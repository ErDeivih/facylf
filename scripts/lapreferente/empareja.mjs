/**
 * L3a · Cada competición de La Preferente con su grupo de la federación (o «no lo tiene»). Escribe externo.lp_emparejado
 * y, si una edición que se proyectó desde LP (origen = 'lapreferente') ya tiene su grupo de federación, marca
 * core.competition_edition.reemplazada_por (manda la federación).
 *
 *   node scripts/lapreferente/empareja.mjs [--temporada 2025-26] [--federacion cataluna] [--seco]
 *
 * Orden de pruebas, de la más fuerte a la más débil:
 *   1. CÓDIGO: la URL de carga de LP da el grupo de la federación (PNFG codgrupo; iSquad id_competicion) → ese grupo,
 *      confirmado con los marcadores si los dos lados tienen partidos jugados.
 *   2. MARCADORES: entre los grupos de su federación (o familia) y temporada, el de más equipos parecidos, y sólo si
 *      ≥ 90 % de los marcadores comparables coinciden (scripts/lib/empareja-lapreferente.mjs).
 *   3. Si no: «sin_contraparte» (se puede proyectar) o «dudoso» (hay candidato pero no cuadra: no se proyecta).
 * Claude, 26/10/2026.
 */
import { fileURLToPath } from 'node:url';
import { emparejaGrupo, palabras } from '../lib/empareja-lapreferente.mjs';
import { CCAA_LP, pg, urlBase } from './lib.mjs';

/** Parecido de dos conjuntos de equipos: fracción de equipos de LP con alguna palabra significativa común. */
export function parecidoDeEquipos(lp, fed) {
  if (!lp.length || !fed.length) return 0;
  const fedPalabras = fed.map((n) => new Set(palabras(n)));
  let si = 0;
  for (const n of lp) {
    const p = palabras(n);
    if (p.length && fedPalabras.some((s) => p.some((x) => s.has(x)))) si += 1;
  }
  return si / Math.max(lp.length, fed.length);
}

/** Decide con los datos ya leídos (puro, se prueba sin base). */
export function decide({ lpPartidos, porCodigo, candidatos }) {
  if (porCodigo) {
    const r = emparejaGrupo(lpPartidos, porCodigo.partidos);
    // El código del grupo es exacto: sólo se duda si hay marcadores suficientes para contrastar y no cuadran. Que la
    // federación vaya atrasada (pocos comparables) no lo hace dudoso: es justo lo que vigila lp_resultados_que_faltan.
    if (r.comparables < 5 || r.parte >= 0.9) return { estado: 'emparejado', phase_group_id: porCodigo.id, via: 'codigo', ...r };
    return { estado: 'dudoso', phase_group_id: porCodigo.id, via: 'codigo_sin_marcadores', ...r };
  }
  let mejor = null;
  for (const c of candidatos) {
    const r = emparejaGrupo(lpPartidos, c.partidos);
    if (!mejor || r.parte * r.comparables > mejor.parte * mejor.comparables) mejor = { ...r, phase_group_id: c.id };
  }
  if (mejor?.emparejado) return { estado: 'emparejado', via: 'marcadores', ...mejor };
  if (mejor && mejor.comparables >= 10 && mejor.parte >= 0.5) return { estado: 'dudoso', via: 'marcadores_sin_umbral', ...mejor };
  return { estado: 'sin_contraparte', phase_group_id: null, via: 'ninguno', cobertura: mejor?.cobertura ?? null, comparables: mejor?.comparables ?? 0, coinciden: mejor?.coinciden ?? 0, parte: mejor?.parte ?? 0, equipos: {}, diferencias: [] };
}

/**
 * Cada partido de LP con su partido del canónico, por los equipos ya emparejados (nombre LP → nombre federación) y,
 * si el cruce se repite (grupos a 3-4 vueltas), por orden de jornada. Puro.
 */
export function mapeaPartidos(lp, fed, equipos) {
  const nombre = (n) => (typeof equipos[n] === 'object' ? equipos[n]?.federacion : equipos[n]) ?? null;
  const porJornada = (a, b) => (a.jornada ?? 0) - (b.jornada ?? 0);
  const deFed = new Map();
  for (const p of [...fed].sort(porJornada)) {
    const k = `${p.local}|${p.visitante}`;
    if (!deFed.has(k)) deFed.set(k, []);
    deFed.get(k).push(p);
  }
  const usados = new Map();
  const salida = [];
  for (const p of [...lp].sort(porJornada)) {
    const l = nombre(p.local);
    const v = nombre(p.visitante);
    if (!l || !v) continue;
    const k = `${l}|${v}`;
    const n = usados.get(k) ?? 0;
    usados.set(k, n + 1);
    const q = deFed.get(k)?.[n];
    if (q?.id) salida.push({ clave: p.clave, match_id: Number(q.id) });
  }
  return salida;
}

const SQL_PARTIDOS = `select m.id, md.numero jornada, coalesce(tl.nombre_en_fuente, '?') local, coalesce(tv.nombre_en_fuente, '?') visitante,
    m.goles_local gl, m.goles_visitante gv
  from core.match m join core.matchday md on md.id = m.matchday_id
  left join core.team_entry tl on tl.id = m.home_team_entry_id left join core.team_entry tv on tv.id = m.away_team_entry_id
  where m.phase_group_id = $1`;

export async function emparejaTodo(cliente, { temporada = null, federacion = null, seco = false, log = console.log } = {}) {
  const feds = new Map((await cliente.query('select id, codigo from core.federation')).rows.map((f) => [f.codigo, Number(f.id)]));
  const filtros = ['true'];
  const params = [];
  if (temporada) { params.push(temporada); filtros.push(`c.temporada = $${params.length}`); }
  if (federacion) { params.push(feds.get(federacion) ?? -1); filtros.push(`c.federation_id = $${params.length}`); }
  const comps = (await cliente.query(`select c.* from externo.lp_competicion c where c.federation_id is not null and ${filtros.join(' and ')}
    order by c.temporada, c.federation_id, c.id`, params)).rows;
  const cuenta = { emparejado: 0, dudoso: 0, sin_contraparte: 0, reemplazadas: 0 };
  const tieneMapa = (await cliente.query(`select to_regclass('externo.lp_partido_match') is not null ok`)).rows[0].ok;
  const cache = new Map();   // federación-familia|temporada → [{id, codigo, equipos}]
  for (const c of comps) {
    const fedCodigo = [...feds.entries()].find(([, id]) => id === Number(c.federation_id))?.[0];
    const familia = (Object.values(CCAA_LP).find((l) => l.includes(fedCodigo)) ?? [fedCodigo]).map((f) => feds.get(f)).filter(Boolean);
    const lpPartidos = (await cliente.query('select clave, jornada, local_nombre local, visitante_nombre visitante, goles_local gl, goles_visitante gv from externo.lp_partido where competicion_id = $1', [c.id])).rows;
    // 1. Por código.
    let porCodigo = null;
    if (c.grupo_federacion || (c.plataforma_federacion === 'isquad' && c.competicion_federacion)) {
      const fila = (await cliente.query(`select pg.id from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id
          join core.season s on s.id = ce.season_id
         where ce.federation_id = any($1) and s.etiqueta = $2 and ce.origen = 'federacion'
           and (pg.codigo_externo = $3 or ($4::text is not null and ce.codigo_externo = $4 and pg.codigo_externo = coalesce($3, pg.codigo_externo)))
         order by pg.id limit 1`, [familia, c.temporada, c.grupo_federacion, c.plataforma_federacion === 'isquad' ? c.competicion_federacion : null])).rows[0];
      if (fila) porCodigo = { id: Number(fila.id), partidos: (await cliente.query(SQL_PARTIDOS, [fila.id])).rows };
    }
    // 2. Por marcadores, entre los grupos con equipos parecidos.
    let candidatos = [];
    if (!porCodigo) {
      const clave = `${familia.join(',')}|${c.temporada}`;
      if (!cache.has(clave)) {
        cache.clear();   // van ordenadas por temporada y federación: sólo hace falta la última (RAM)
        cache.set(clave, (await cliente.query(`select pg.id, array_agg(te.nombre_en_fuente) equipos
            from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id
            join core.season s on s.id = ce.season_id join core.team_entry te on te.phase_group_id = pg.id
           where ce.federation_id = any($1) and s.etiqueta = $2 and ce.origen = 'federacion' group by pg.id`, [familia, c.temporada])).rows);
      }
      const equiposLp = [...new Set(lpPartidos.flatMap((p) => [p.local, p.visitante]))];
      const top = cache.get(clave).map((g) => ({ id: Number(g.id), s: parecidoDeEquipos(equiposLp, g.equipos ?? []) }))
        .filter((g) => g.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 3);
      for (const g of top) candidatos.push({ id: g.id, partidos: (await cliente.query(SQL_PARTIDOS, [g.id])).rows });
    }
    const d = decide({ lpPartidos, porCodigo, candidatos });
    cuenta[d.estado] += 1;
    if (seco) continue;
    // Partido a partido (0054): qué partido del canónico es cada uno de LP. Sirve para el acta provisional de LP
    // mientras la federación no tiene la suya, y para el vigía.
    if (tieneMapa) {
      await cliente.query('delete from externo.lp_partido_match where partido_clave in (select clave from externo.lp_partido where competicion_id = $1)', [c.id]);
      if (d.estado === 'emparejado' && d.phase_group_id) {
        const fed = porCodigo?.id === d.phase_group_id ? porCodigo.partidos : candidatos.find((x) => x.id === d.phase_group_id)?.partidos ?? [];
        const pares = mapeaPartidos(lpPartidos, fed, d.equipos ?? {});
        for (let i = 0; i < pares.length; i += 500) {
          const trozo = pares.slice(i, i + 500);
          await cliente.query(`insert into externo.lp_partido_match (partido_clave, match_id) select * from unnest($1::text[], $2::bigint[])
            on conflict (partido_clave) do update set match_id = excluded.match_id`, [trozo.map((x) => x.clave), trozo.map((x) => x.match_id)]);
        }
        cuenta.partidos_casados = (cuenta.partidos_casados ?? 0) + pares.length;
      }
    }
    await cliente.query(`insert into externo.lp_emparejado (competicion_id, phase_group_id, estado, cobertura, comparables, coinciden, parte, equipos, diferencias, calculado_en)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
      on conflict (competicion_id) do update set phase_group_id = excluded.phase_group_id, estado = excluded.estado, cobertura = excluded.cobertura,
        comparables = excluded.comparables, coinciden = excluded.coinciden, parte = excluded.parte, equipos = excluded.equipos,
        diferencias = excluded.diferencias, calculado_en = now()`,
      [c.id, d.phase_group_id ?? null, d.estado, d.cobertura ?? null, d.comparables ?? 0, d.coinciden ?? 0, d.parte ?? 0,
        JSON.stringify(d.equipos ?? {}), JSON.stringify((d.diferentes ?? d.diferencias ?? []).slice(0, 50))]);
    // Si esta competición ya se proyectó desde LP y ahora tiene grupo de federación: manda la federación.
    if (d.estado === 'emparejado' && d.phase_group_id) {
      const r = await cliente.query(`update core.competition_edition lp set reemplazada_por = fed.competition_edition_id
          from core.phase_group fed
         where fed.id = $1 and lp.origen = 'lapreferente' and lp.codigo_externo = $2 and lp.reemplazada_por is distinct from fed.competition_edition_id`,
      [d.phase_group_id, `lp${c.id}`]);
      cuenta.reemplazadas += Number(r.rowCount ?? 0);
    }
  }
  log(`Emparejado de ${comps.length} competiciones de LP:`, cuenta);
  return cuenta;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
  const { Client } = pg();
  const cliente = new Client({ connectionString: urlBase() });
  await cliente.connect();
  await emparejaTodo(cliente, { temporada: arg('temporada'), federacion: arg('federacion'), seco: process.argv.includes('--seco') });
  await cliente.end();
}
