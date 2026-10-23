#!/usr/bin/env node
/*
 * mira-lote.mjs — SÓLO LEE (sesión `read only`). Explica por qué un lote del importador no validó.
 *
 *   node scripts/claude/mira-lote.mjs 75466            (por id de lote)
 *   node scripts/claude/mira-lote.mjs --grupo 903639327 (los últimos lotes de ese grupo)
 *   node scripts/claude/mira-lote.mjs --avisos andalucia (filas descartadas A PROPÓSITO, por temporada)
 *
 * `--avisos` explica el «goteo» de 1-9 partidos por temporada entre la cola y el canónico: suma, del ÚLTIMO
 * lote de cada grupo, los avisos que deja el importador (p. ej. fila con el mismo equipo en los dos lados).
 *
 * Para cada lote: estado, ámbito (cursor_hasta), diferencias de la validación; y para su grupo en el canónico:
 * partidos por jornada, `source_order` repetidos o huérfanos (filas de importaciones anteriores con otra
 * numeración), actas citadas por más de un partido y partidos sin acta. Es lo que hace falta para saber si un
 * «partidos 18≠36» es una pérdida, un doble o restos de una importación vieja.
 */
import { abreCanonico } from '../lib/informes-consulta.mjs';

try { process.loadEnvFile('.env'); } catch { /* puede venir del entorno */ }
// El rol lector no ve el esquema `ops` (lotes y avisos). Se usa el del importador, pero con la sesión en
// SÓLO LECTURA: cualquier escritura fallaría en PostgreSQL antes de tocar nada.
const url = process.env.DATABASE_URL_PUBLICADOR;
if (!url) { console.error('Falta DATABASE_URL_PUBLICADOR (en .env).'); process.exit(2); }
const args = process.argv.slice(2);
const iGrupo = args.indexOf('--grupo');
const iAvisos = args.indexOf('--avisos');
const grupo = iGrupo >= 0 ? args[iGrupo + 1] : null;
const ids = args.filter((a, i) => /^\d+$/.test(a) && i !== iGrupo + 1).map(Number);
const c = await abreCanonico(url);
await c.query('set session characteristics as transaction read only');
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
try {
  if (iAvisos >= 0) {
    const fed = args[iAvisos + 1];
    const r = await q(`with ultimo as (
        select distinct on (b.cursor_hasta) b.id, b.cursor_hasta
          from ops.batch b join core.federation f on f.id = b.federation_id
         where f.codigo = $1 order by b.cursor_hasta, b.id desc)
      select substring(u.cursor_hasta from 'temporada=([^;]+)') temp, e.codigo, count(*) avisos,
             sum(coalesce((e.parametros->>'filas')::int, 0)) filas,
             sum(coalesce((e.parametros->>'conResultado')::int, 0)) con_resultado
        from ultimo u join ops.normalizacion_error e on e.batch_id = u.id
       group by 1, 2 order by 1 desc, 2`, [fed]);
    console.log(`Avisos del último lote de cada grupo · ${fed}`);
    for (const f of r) console.log(`  ${f.temp}  ${f.codigo.padEnd(56)} avisos ${String(f.avisos).padStart(4)} · filas ${String(f.filas).padStart(4)} · con resultado ${f.con_resultado}`);
    if (!r.length) console.log('  (ningún aviso)');
    process.exitCode = 0;
  } else {
  const lotes = ids.length
    ? await q(`select id, estado, cursor_hasta, terminado_en, validacion->'diferencias' dif from ops.batch where id = any($1::bigint[]) order by id`, [ids])
    : await q(`select id, estado, cursor_hasta, terminado_en, validacion->'diferencias' dif from ops.batch
                where cursor_hasta like $1 order by id desc limit 6`, [`%grupo=${grupo};%`]).then(async (r) => r.length ? r
                : q(`select id, estado, cursor_hasta, terminado_en, validacion->'diferencias' dif from ops.batch
                     where cursor_hasta like $1 order by id desc limit 6`, [`%grupo=${grupo}`]));
  if (!lotes.length) console.log('No hay lotes con ese criterio.');
  const vistos = new Set();
  for (const l of lotes) {
    console.log(`\n=== lote ${l.id} · ${l.estado} · ${l.terminado_en?.toISOString?.() ?? l.terminado_en ?? '-'}\n    ${l.cursor_hasta}`);
    if (l.dif) console.log(`    diferencias: ${JSON.stringify(l.dif)}`);
    const cod = /grupo=([^;]+)/.exec(l.cursor_hasta ?? '')?.[1];
    const temp = /temporada=([^;]+)/.exec(l.cursor_hasta ?? '')?.[1];
    if (!cod || vistos.has(cod + temp)) continue;
    vistos.add(cod + temp);
    const pgs = await q(`select pg.id, pg.nombre, ce.codigo_externo comp, s.etiqueta temp
        from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.season s on s.id = ce.season_id where pg.codigo_externo = $1 and s.etiqueta = $2`, [cod, temp]);
    for (const pg of pgs) {
      console.log(`  grupo ${cod} (${pg.nombre}) · competición ${pg.comp} · phase_group ${pg.id}`);
      const porJornada = await q(`select md.numero, count(*) n, count(*) filter (where m.goles_local is not null) res,
          array_agg(m.source_order order by m.source_order) ordenes
          from core.match m join core.matchday md on md.id = m.matchday_id where m.phase_group_id = $1
          group by md.numero order by md.numero`, [pg.id]);
      for (const j of porJornada) console.log(`    J${String(j.numero).padStart(2)}  partidos ${String(j.n).padStart(3)} · con resultado ${String(j.res).padStart(3)} · orden ${j.ordenes.join(',')}`);
      const actasDobles = await q(`select s.codigo_acta, count(distinct m.id) n, array_agg(m.id) ids
          from core.match m join core.match_source s on s.match_id = m.id where m.phase_group_id = $1
          group by s.codigo_acta having count(distinct m.id) > 1 limit 10`, [pg.id]);
      console.log(`    actas citadas por >1 partido: ${actasDobles.length}${actasDobles.length ? ' → ' + actasDobles.map((a) => `${a.codigo_acta}×${a.n}`).join(' ') : ''}`);
      const sinActa = await q(`select count(*) n from core.match m where m.phase_group_id = $1
          and not exists (select 1 from core.match_source s where s.match_id = m.id and s.codigo_acta is not null)`, [pg.id]);
      console.log(`    partidos sin código de acta: ${sinActa[0].n}`);
      const mismosEquipos = await q(`select count(*) n from (select m.matchday_id, m.home_team_entry_id, m.away_team_entry_id
          from core.match m where m.phase_group_id = $1 group by 1,2,3 having count(*) > 1) t`, [pg.id]).catch((e) => [{ n: `(no se pudo: ${e.message.slice(0, 80)})` }]);
      console.log(`    mismo cruce repetido en la misma jornada: ${mismosEquipos[0].n}`);
    }
  }
  }
} finally { await c.end(); }
