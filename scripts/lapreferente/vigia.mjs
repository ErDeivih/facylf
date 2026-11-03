/**
 * L5 · El vigía de La Preferente: lo que LP sabe y la federación (todavía) no, o dice distinto.
 *
 *   node scripts/lapreferente/vigia.mjs [--dias 3]        informe por pantalla
 *
 * Y como chequeos de scripts/vigilancia-plataforma.mjs (área «calidad»; abren y cierran alertas en ops.alerta):
 *   · lp_resultados_que_faltan  partidos de grupos emparejados con resultado en LP hace más de N días y SIN
 *                               resultado en el canónico: la cola de la federación va atrasada o se ha atascado
 *                               (el caso de Araba del 26/10: «25 de 80 jornadas jugadas hace 2-9 días sin resultado»).
 *   · lp_marcadores_distintos   grupos emparejados donde menos del 95 % de los marcadores comparables coinciden.
 *   · lp_emparejados_dudosos    competiciones de LP que no se han podido emparejar con seguridad (revisar a mano).
 * Sólo lectura. Si no existe el esquema externo (0051), no devuelve nada.
 * Claude, 26/10/2026.
 */
import { fileURLToPath } from 'node:url';
import { pg, urlBase } from './lib.mjs';

const SQL_FALTAN = `
  with emp as (
    select e.competicion_id, e.phase_group_id, e.equipos from externo.lp_emparejado e
     where e.estado = 'emparejado' and e.phase_group_id is not null
  ), lp as (
    select p.clave, emp.phase_group_id, p.fecha,
           emp.equipos -> p.local_nombre ->> 'federacion' fl, emp.equipos -> p.visitante_nombre ->> 'federacion' fv
      from externo.lp_partido p join emp using (competicion_id)
     where p.goles_local is not null and p.fecha is not null and p.fecha < current_date - $1::int
  )
  select f.codigo federacion, ce.nombre_publicado competicion, pg.nombre grupo, pg.id phase_group_id,
         count(distinct m.id)::int partidos, to_char(min(lp.fecha), 'YYYY-MM-DD') desde
    from lp
    join core.team_entry tl on tl.phase_group_id = lp.phase_group_id and tl.nombre_en_fuente = lp.fl
    join core.team_entry tv on tv.phase_group_id = lp.phase_group_id and tv.nombre_en_fuente = lp.fv
    join core.match m on m.phase_group_id = lp.phase_group_id and m.home_team_entry_id = tl.id and m.away_team_entry_id = tv.id
    join core.phase_group pg on pg.id = lp.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    join core.federation f on f.id = ce.federation_id
   where m.goles_local is null and m.official_status not in ('cancelled', 'administrative')
   group by 1, 2, 3, 4
   order by partidos desc`;

const SQL_DISTINTOS = `
  select f.codigo federacion, c.nombre competicion_lp, e.competicion_id, e.phase_group_id, e.comparables, e.coinciden, e.parte,
         e.diferencias -> 0 ejemplo
    from externo.lp_emparejado e
    join externo.lp_competicion c on c.id = e.competicion_id
    left join core.federation f on f.id = c.federation_id
   where e.estado = 'emparejado' and e.comparables >= 10 and e.parte < 0.95
   order by e.parte, e.comparables desc`;

const SQL_DUDOSOS = `
  select f.codigo federacion, count(*)::int n
    from externo.lp_emparejado e
    join externo.lp_competicion c on c.id = e.competicion_id
    left join core.federation f on f.id = c.federation_id
   where e.estado = 'dudoso' group by 1 order by 2 desc`;

/** Los tres chequeos, con la forma de vigilancia-plataforma.mjs: { nombre, area, estado, valor, detalle }. */
export async function chequeosLaPreferente(cliente, { dias = 3, minimo = 5 } = {}) {
  const hay = (await cliente.query(`select to_regclass('externo.lp_emparejado') is not null ok`)).rows[0].ok;
  if (!hay) return [];
  const faltan = (await cliente.query(SQL_FALTAN, [dias])).rows;
  const totalFaltan = faltan.reduce((s, r) => s + r.partidos, 0);
  const porFed = {};
  for (const r of faltan) porFed[r.federacion] = (porFed[r.federacion] ?? 0) + r.partidos;
  const distintos = (await cliente.query(SQL_DISTINTOS)).rows;
  const dudosos = (await cliente.query(SQL_DUDOSOS)).rows;
  const totalDudosos = dudosos.reduce((s, r) => s + r.n, 0);
  return [
    { nombre: 'lp_resultados_que_faltan', area: 'calidad', estado: totalFaltan >= minimo ? 'aviso' : 'ok', valor: totalFaltan,
      detalle: { dias, por_federacion: porFed, grupos: faltan.slice(0, 8).map((r) => `${r.federacion} · ${r.competicion} · ${r.grupo} (${r.partidos}, desde ${r.desde})`) } },
    { nombre: 'lp_marcadores_distintos', area: 'calidad', estado: distintos.length ? 'aviso' : 'ok', valor: distintos.length,
      detalle: { grupos: distintos.slice(0, 8).map((r) => ({ federacion: r.federacion, lp: r.competicion_id, grupo: r.phase_group_id, parte: Number(r.parte), ejemplo: r.ejemplo })) } },
    { nombre: 'lp_emparejados_dudosos', area: 'calidad', estado: totalDudosos ? 'aviso' : 'ok', valor: totalDudosos,
      detalle: { por_federacion: Object.fromEntries(dudosos.map((r) => [r.federacion ?? 'nacional', r.n])) } },
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--dias');
  const dias = i > 0 ? Number(process.argv[i + 1]) : 3;
  const { Client } = pg();
  const cliente = new Client({ connectionString: urlBase(), application_name: 'vigia-lapreferente' });
  await cliente.connect();
  try {
    for (const c of await chequeosLaPreferente(cliente, { dias })) {
      console.log(`${c.estado === 'ok' ? '✓' : '⚠'} ${c.nombre} = ${c.valor}`);
      if (c.estado !== 'ok') console.log(JSON.stringify(c.detalle, null, 2));
    }
  } finally { await cliente.end(); }
}
