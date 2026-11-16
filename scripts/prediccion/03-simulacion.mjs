#!/usr/bin/env node
/*
 * 03-simulacion.mjs — clasificación final estimada por Monte Carlo.
 *
 * Para cada grupo con partidos pendientes:
 *   1. parte de la tabla actual (puntos, goles a favor y en contra de lo jugado);
 *   2. toma los goles esperados de cada partido pendiente de `analytics.poisson_partido` (fuerza por
 *      equipo y ventaja de casa ya incorporadas);
 *   3. DEDUCE los partidos que aún no tienen fila en `core.match`: el canónico no guarda las jornadas
 *      futuras, y sin ellas la «simulación» da el 100 % al puesto de hoy. Sólo se deduce si el grupo es
 *      una liga a una o dos vueltas (`scripts/lib/calendario-restante.mjs`); sus goles esperados salen
 *      de `analytics.poisson_equipo` y `analytics.poisson_liga`. Un grupo cuyo formato no se reconoce
 *      NO se publica: se borra su estimación anterior;
 *   4. corrige cada equipo por su FORMA RECIENTE (puntos de sus últimos 5 partidos, factor 0,85-1,15);
 *   5. simula N veces los partidos que quedan, ordena por puntos / diferencia de goles / goles a favor
 *      y cuenta en qué puesto acaba cada equipo.
 *
 * Escribe `analytics.simulacion_final` (migración 0062): posición media, puntos medios, probabilidad
 * de cada puesto y cuántos partidos se han simulado y deducido (0065). Idempotente: borra las filas de los grupos que recalcula y las vuelve a insertar.
 *
 * Uso:
 *   node scripts/prediccion/03-simulacion.mjs
 *   node scripts/prediccion/03-simulacion.mjs --simulaciones 5000
 *   node scripts/prediccion/03-simulacion.mjs --limite 5 --seco
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { formatoDeLiga, partidosQueFaltan } from '../lib/calendario-restante.mjs';
import { golesEsperados } from '../lib/poisson.mjs';

try { process.loadEnvFile('.env'); } catch { /* el entorno puede traerla */ }
const url = process.env.DATABASE_URL_MIGRACION ?? process.env.DATABASE_URL_PUBLICADOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRACION o DATABASE_URL_PUBLICADOR (en .env).');
  process.exit(2);
}
const requerir = createRequire(resolve('packages/canonico/package.json'));
const { Client } = requerir('pg');

const args = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const TEMPORADA = valor('--temporada', '2026-27');
const FEDERACION = valor('--federacion', 'castilla-leon');
const SIMULACIONES = Number(valor('--simulaciones', '3000'));
const LIMITE = Number(valor('--limite', '0')) || 0;
const SECO = args.includes('--seco');

const c = new Client({ connectionString: url, statement_timeout: 1800000, application_name: 'prediccion-simulacion' });
await c.connect();

/** PRNG determinista por grupo: la misma entrada da la misma simulación, y se puede repetir. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestra Poisson por el método de Knuth; λ se acota para que la simulación no se dispare. */
function poisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let p = 1;
  let k = 0;
  do {
    k += 1;
    p *= rng();
  } while (p > L && k < 40);
  return k - 1;
}

try {
  const temporada = await c.query('select id, etiqueta from core.season where etiqueta = $1', [TEMPORADA]);
  if (!temporada.rowCount) throw new Error(`la temporada ${TEMPORADA} no está en core.season`);
  const seasonId = temporada.rows[0].id;

  // Todos los grupos con algún partido, no sólo los que tienen pendientes con fila: un grupo con todo lo
  // cargado ya jugado y media liga por delante también necesita su estimación.
  const grupos = await c.query(`
    select pg.id, pg.nombre, ce.nombre_publicado edicion, pg.competition_edition_id::text ed,
           pg.jornadas_previstas::int jornadas,
           count(*) filter (where m.goles_local is null)::int pendientes
      from core.match m
      join core.phase_group pg on pg.id = m.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.federation f on f.id = ce.federation_id
     where ce.season_id = $1 and f.codigo = $2
     group by 1,2,3,4,5
     order by 1
     ${LIMITE > 0 ? `limit ${LIMITE}` : ''}`, [seasonId, FEDERACION]);
  if (!grupos.rowCount) { console.log('No hay grupos con partidos.'); process.exit(0); }
  const ids = grupos.rows.map((g) => String(g.id));
  console.log(`grupos con partidos: ${grupos.rowCount} · simulaciones por grupo: ${SIMULACIONES}`);

  const equipos = await c.query(`
    select te.phase_group_id::text g, te.id::text te, ts.nombre, te.team_season_id::text ts
      from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
     where te.phase_group_id = any($1::bigint[])
     order by te.phase_group_id, ts.nombre`, [ids]);

  const jugados = await c.query(`
    with lados as (
      select m.phase_group_id::text g, m.home_team_entry_id::text te,
             m.goles_local gf, m.goles_visitante ga, m.played_at, m.id
        from core.match m where m.phase_group_id = any($1::bigint[]) and m.goles_local is not null
      union all
      select m.phase_group_id::text, m.away_team_entry_id::text,
             m.goles_visitante, m.goles_local, m.played_at, m.id
        from core.match m where m.phase_group_id = any($1::bigint[]) and m.goles_local is not null
    )
    select g, te, count(*)::int pj,
           sum(case when gf > ga then 3 when gf = ga then 1 else 0 end)::int pts,
           sum(gf)::int gf, sum(ga)::int ga
      from lados group by 1,2`, [ids]);

  const forma = await c.query(`
    with lados as (
      select m.phase_group_id::text g, m.home_team_entry_id::text te,
             m.goles_local gf, m.goles_visitante ga, m.played_at, m.id
        from core.match m where m.phase_group_id = any($1::bigint[]) and m.goles_local is not null
      union all
      select m.phase_group_id::text, m.away_team_entry_id::text,
             m.goles_visitante, m.goles_local, m.played_at, m.id
        from core.match m where m.phase_group_id = any($1::bigint[]) and m.goles_local is not null
    ), orden as (
      select g, te, gf, ga,
             row_number() over (partition by g, te order by played_at desc nulls last, id desc) rn
        from lados
    )
    select g, te, count(*)::int n,
           sum(case when gf > ga then 3 when gf = ga then 1 else 0 end)::int pts
      from orden where rn <= 5 group by 1,2`, [ids]);

  const pendientes = await c.query(`
    select m.phase_group_id::text g, m.id::text match_id,
           m.home_team_entry_id::text local, m.away_team_entry_id::text visitante,
           coalesce(p.goles_esperados_local, 1.40)::float8 lh,
           coalesce(p.goles_esperados_visitante, 1.10)::float8 lv
      from core.match m
      left join analytics.poisson_partido p on p.match_id = m.id
     where m.phase_group_id = any($1::bigint[]) and m.goles_local is null
     order by m.phase_group_id, m.id`, [ids]);

  // Todos los cruces que ya tienen fila (jugados o no): lo que no esté aquí es lo que hay que deducir.
  const cruces = await c.query(`
    select m.phase_group_id::text g, m.home_team_entry_id::text local, m.away_team_entry_id::text visitante
      from core.match m where m.phase_group_id = any($1::bigint[])`, [ids]);

  // Calendario previsto (0067): los cruces de las jornadas que aún no tienen partido. Si el grupo lo
  // tiene, se simula con él y no se deduce nada. Antes de aplicar la 0067 la tabla no existe: se sigue
  // con la deducción por formato de liga.
  let previstos = { rows: [] };
  let conCalendario = new Set();
  try {
    previstos = await c.query(`
      select phase_group_id::text g, home_team_entry_id::text local, away_team_entry_id::text visitante
        from core.calendario_pendiente where phase_group_id = any($1::bigint[])`, [ids]);
    const tienen = await c.query(`
      select distinct phase_group_id::text g from core.calendario_previsto
       where phase_group_id = any($1::bigint[])`, [ids]);
    conCalendario = new Set(tienen.rows.map((r) => r.g));
  } catch (error) {
    if (error.code !== '42P01') throw error;
    console.log('core.calendario_previsto no existe (0067 sin aplicar): se deduce el calendario por formato de liga.');
  }

  // Fuerza de cada inscripción y medias de su liga, para los partidos sin predicción propia.
  const ediciones = [...new Set(grupos.rows.map((g) => g.ed))];
  const fuerzas = await c.query(`
    select competition_edition_id::text ed, team_season_id::text ts, ataque::float8 ataque, defensa::float8 defensa
      from analytics.poisson_equipo where competition_edition_id = any($1::bigint[])`, [ediciones]);
  const ligas = await c.query(`
    select competition_edition_id::text ed, media_local::float8 ml, media_visitante::float8 mv
      from analytics.poisson_liga where competition_edition_id = any($1::bigint[])`, [ediciones]);
  const fuerzaDe = new Map(fuerzas.rows.map((f) => [`${f.ed}:${f.ts}`, f]));
  const ligaDe = new Map(ligas.rows.map((l) => [l.ed, l]));

  // Índices por grupo.
  const porGrupo = (filas) => {
    const m = new Map();
    for (const f of filas) {
      if (!m.has(f.g)) m.set(f.g, []);
      m.get(f.g).push(f);
    }
    return m;
  };
  const equiposDe = porGrupo(equipos.rows);
  const jugadosDe = porGrupo(jugados.rows);
  const formaDe = porGrupo(forma.rows);
  const pendientesDe = porGrupo(pendientes.rows);
  const crucesDe = porGrupo(cruces.rows);
  const previstosDe = porGrupo(previstos.rows);

  const salida = [];
  const cuenta = { publicados: 0, conCalendario: 0, sinFormato: 0, terminados: 0, sinLiga: 0 };
  for (const grupo of grupos.rows) {
    const g = String(grupo.id);
    const lista = equiposDe.get(g) ?? [];
    if (lista.length < 2) continue;
    // Lo que queda por jugar y no tiene fila en core.match sale, por este orden, del calendario
    // previsto del grupo o, si no lo hay, del formato de liga. Sin ninguno de los dos no se sabe qué
    // queda y no se publica estimación.
    let faltan;
    const delCalendario = conCalendario.has(g);
    if (delCalendario) {
      faltan = (previstosDe.get(g) ?? []).map((p) => ({ local: p.local, visitante: p.visitante, campoNeutral: false }));
    } else {
      const formato = formatoDeLiga(lista.length, grupo.jornadas);
      if (formato === null) { cuenta.sinFormato += 1; continue; }
      faltan = partidosQueFaltan({
        equipos: lista.map((e) => e.te), existentes: crucesDe.get(g) ?? [], formato,
      });
      if (faltan === null) { cuenta.sinFormato += 1; continue; }
    }
    if (faltan.length === 0 && grupo.pendientes === 0) { cuenta.terminados += 1; continue; }
    const liga = ligaDe.get(grupo.ed);
    if (faltan.length > 0 && !liga) { cuenta.sinLiga += 1; continue; }
    const tsDe = new Map(lista.map((e) => [e.te, e.ts]));
    const fuerza = (te) => fuerzaDe.get(`${grupo.ed}:${tsDe.get(te)}`) ?? { ataque: 1, defensa: 1 };
    const sinFila = faltan.filter((p) => tsDe.has(p.local) && tsDe.has(p.visitante)).map((p) => {
      const neutra = (liga.ml + liga.mv) / 2;
      const l = fuerza(p.local);
      const v = fuerza(p.visitante);
      const goles = golesEsperados({
        mediaLocal: p.campoNeutral ? neutra : liga.ml,
        mediaVisitante: p.campoNeutral ? neutra : liga.mv,
        ataqueLocal: l.ataque, defensaLocal: l.defensa,
        ataqueVisitante: v.ataque, defensaVisitante: v.defensa,
      });
      return { local: p.local, visitante: p.visitante, lh: goles.local, lv: goles.visitante };
    });
    const idx = new Map(lista.map((e, i) => [e.te, i]));
    const pts = lista.map(() => 0);
    const gf = lista.map(() => 0);
    const ga = lista.map(() => 0);
    for (const j of jugadosDe.get(g) ?? []) {
      const i = idx.get(j.te);
      if (i === undefined) continue;
      pts[i] = j.pts; gf[i] = j.gf; ga[i] = j.ga;
    }
    const factor = lista.map(() => 1);
    for (const f of formaDe.get(g) ?? []) {
      const i = idx.get(f.te);
      if (i === undefined || f.n === 0) continue;
      // 0 puntos en los últimos 5 → 0,85; 3 puntos por partido → 1,15. La forma modula, no sustituye.
      factor[i] = Math.min(1.15, Math.max(0.85, 0.85 + 0.30 * (f.pts / (3 * f.n))));
    }
    const conFila = pendientesDe.get(g) ?? [];
    const partidos = [...conFila, ...sinFila].map((p) => ({
      h: idx.get(p.local), a: idx.get(p.visitante), lh: p.lh, lv: p.lv,
    })).filter((p) => p.h !== undefined && p.a !== undefined);

    const rng = mulberry32(0x9E3779B9 ^ Number(grupo.id));
    const sumaPts = new Float64Array(lista.length);
    const sumaPos = new Float64Array(lista.length);
    const cuentaPos = lista.map(() => new Float64Array(lista.length));
    for (let s = 0; s < SIMULACIONES; s += 1) {
      const p = pts.slice();
      const f = gf.slice();
      const a = ga.slice();
      for (const partido of partidos) {
        const lh = Math.min(5, Math.max(0.15, partido.lh * factor[partido.h]));
        const lv = Math.min(5, Math.max(0.15, partido.lv * factor[partido.a]));
        const gh = poisson(lh, rng);
        const gv = poisson(lv, rng);
        f[partido.h] += gh; a[partido.h] += gv;
        f[partido.a] += gv; a[partido.a] += gh;
        if (gh > gv) p[partido.h] += 3;
        else if (gh < gv) p[partido.a] += 3;
        else { p[partido.h] += 1; p[partido.a] += 1; }
      }
      const orden = lista.map((_, i) => i).sort((i, j) => (
        p[j] - p[i] || (f[j] - a[j]) - (f[i] - a[i]) || f[j] - f[i] || lista[i].te.localeCompare(lista[j].te)
      ));
      for (let pos = 0; pos < orden.length; pos += 1) {
        const i = orden[pos];
        sumaPts[i] += p[i];
        sumaPos[i] += pos + 1;
        cuentaPos[i][pos] += 1;
      }
    }
    for (let i = 0; i < lista.length; i += 1) {
      salida.push({
        grupo: Number(grupo.id), equipo: Number(lista[i].te),
        posicion: sumaPos[i] / SIMULACIONES,
        puntos: sumaPts[i] / SIMULACIONES,
        probs: Array.from(cuentaPos[i], (n) => Math.round((n / SIMULACIONES) * 10000) / 100),
        equipos: lista.length,
        pendientes: conFila.length + (delCalendario ? sinFila.length : 0),
        deducidos: delCalendario ? 0 : sinFila.length,
      });
    }
    cuenta.publicados += 1;
    if (delCalendario) cuenta.conCalendario += 1;
  }
  console.log(`grupos publicados: ${cuenta.publicados} (${cuenta.conCalendario} con calendario previsto) · sin formato de liga: ${cuenta.sinFormato} · `
    + `ya terminados: ${cuenta.terminados} · sin parámetros de liga: ${cuenta.sinLiga}`);

  console.log(`filas calculadas: ${salida.length}`);
  if (SECO) {
    console.log('seco: no se escribe. Muestra:', salida.slice(0, 3));
  } else {
    await c.query('begin');
    try {
      await c.query('delete from analytics.simulacion_final where phase_group_id = any($1::bigint[])', [ids]);
      for (let i = 0; i < salida.length; i += 500) {
        const lote = salida.slice(i, i + 500);
        const valores = [];
        const params = [];
        lote.forEach((f, j) => {
          const b = j * 9;
          valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},now())`);
          params.push(f.grupo, f.equipo, f.posicion, f.puntos, JSON.stringify(f.probs), f.equipos, SIMULACIONES, f.pendientes, f.deducidos);
        });
        await c.query(`insert into analytics.simulacion_final
          (phase_group_id, team_entry_id, posicion_esperada, puntos_medios, prob_posiciones, equipos, simulaciones,
           partidos_pendientes, partidos_deducidos, calculado_en)
          values ${valores.join(',')}`, params);
      }
      await c.query('commit');
      console.log(`escritas ${salida.length} filas en analytics.simulacion_final`);
    } catch (error) {
      await c.query('rollback');
      throw error;
    }
  }

  const control = await c.query(`
    select count(*) filas, count(distinct phase_group_id) grupos,
           round(min(posicion_esperada),2) pos_min, round(max(posicion_esperada),2) pos_max
      from analytics.simulacion_final where phase_group_id = any($1::bigint[])`, [ids]);
  console.log('control:', control.rows[0]);
} finally {
  await c.end();
}
