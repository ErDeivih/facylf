#!/usr/bin/env node
/*
 * canonico-por-federacion.mjs — SÓLO LEE (rol lector). Qué hay en el canónico del PC por federación y temporada:
 * ediciones, grupos, partidos, partidos con resultado y, con --alineaciones, filas de alineación.
 *
 * Para comprobar el traspaso al PC (T-04): tras importar una federación, sus temporadas deben aparecer aquí con
 * tantos grupos como importó `importar-temporada.ps1`. `informe:buscar` NO sirve para esto: busca equipos para
 * informes (por defecto sólo CyL, sólo la temporada vigente y sólo grupos con cobertura certificada).
 *
 * Uso (PC, en F:\EspacioCodigo\facylf):
 *   node scripts/claude/canonico-por-federacion.mjs                 (todas)
 *   node scripts/claude/canonico-por-federacion.mjs rioja canarias  (esas)
 *   node scripts/claude/canonico-por-federacion.mjs ceuta --alineaciones
 */
import { abreCanonico } from '../lib/informes-consulta.mjs';

try { process.loadEnvFile('.env'); } catch { /* puede venir del entorno */ }
const url = process.env.DATABASE_URL_LECTOR;
if (!url) { console.error('Falta DATABASE_URL_LECTOR (en .env).'); process.exit(2); }
const args = process.argv.slice(2);
const conAlineaciones = args.includes('--alineaciones');
const feds = args.filter((a) => !a.startsWith('--'));
const c = await abreCanonico(url);
try {
  const r = await c.query(`
    with g as (
      select f.codigo fed, s.etiqueta temp, ce.id ceid, pg.id pgid
        from core.phase_group pg
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.season s on s.id = ce.season_id
        join core.federation f on f.id = ce.federation_id
       where (cardinality($1::text[]) = 0 or f.codigo = any($1::text[])))
    select fed, temp, count(distinct ceid) ediciones, count(*) grupos,
           sum((select count(*) from core.match m where m.phase_group_id = g.pgid)) partidos,
           sum((select count(*) from core.match m where m.phase_group_id = g.pgid and m.goles_local is not null)) con_resultado
           ${conAlineaciones ? `, sum((select count(*) from core.appearance a join core.team_entry te on te.id = a.team_entry_id
                                      where te.phase_group_id = g.pgid)) alineaciones` : ''}
      from g group by 1, 2 order by 1, 2 desc`, [feds]);
  let actual = '';
  for (const f of r.rows) {
    if (f.fed !== actual) { console.log(`\n### ${f.fed}`); actual = f.fed; }
    console.log(`  ${f.temp}  ediciones ${String(f.ediciones).padStart(4)} · grupos ${String(f.grupos).padStart(5)} · partidos ${String(f.partidos).padStart(6)} · con resultado ${String(f.con_resultado).padStart(6)}${conAlineaciones ? ` · alineaciones ${f.alineaciones}` : ''}`);
  }
  if (!r.rows.length) console.log(`Sin datos en el canónico para: ${feds.join(', ') || '(ninguna)'}`);
} finally { await c.end(); }
