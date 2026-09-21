#!/usr/bin/env node
/**
 * Cuánto ocupa UN grupo en el PostgreSQL canónico. Sólo lectura.
 *
 * Uso: node scripts/_diag-tamano-grupo.mjs <federacion> <grupo>
 *
 * Mide dos cosas distintas y no las mezcla:
 *   · MEDIDO  = suma de `pg_column_size(fila)` de las filas que el grupo usa. Es dato real, no
 *               estimación: incluye TOAST comprimido y excluye huecos muertos.
 *   · ESTIMADO= la parte proporcional de `pg_total_relation_size` (tabla + índices + TOAST) que le
 *               tocaría al grupo según su número de filas. Sirve para dimensionar el disco, no es
 *               una medida del grupo.
 */
import { readFileSync } from 'node:fs';
// `pg` sólo existe dentro del paquete canónico (pnpm no lo eleva a la raíz).
const { default: pg } = await import(new URL('../packages/canonico/node_modules/pg/lib/index.js', import.meta.url).href);

const [federacion, grupo] = process.argv.slice(2);
if (!federacion || !grupo) throw new Error('Uso: node scripts/_diag-tamano-grupo.mjs <federacion> <grupo>');

const env = readFileSync('.env', 'utf8');
// El rol lector no puede ver `source.*` (la procedencia es del importador, no de la web), y este
// diagnóstico mide también esa tabla: se usan las credenciales de migración SÓLO para leer tamaños.
const url = /^DATABASE_URL_MIGRACION=(.*)$/m.exec(env)?.[1]?.trim();
if (!url) throw new Error('Falta DATABASE_URL_MIGRACION en .env');
const pool = new pg.Pool({ connectionString: url, max: 2 });

const { rows: ctx } = await pool.query(
  `select f.id federacion_id, g.id grupo_id, g.codigo_externo, e.id edicion_id
     from core.phase_group g
     join core.competition_edition e on e.id = g.competition_edition_id
     join core.federation f on f.id = e.federation_id
    where f.codigo = $1 and g.codigo_externo = $2`, [federacion, grupo]);
const fila = ctx[0];
if (!fila) throw new Error(`No está importado el grupo ${grupo} de ${federacion}`);
const G = fila.grupo_id;

// Cada entrada: tabla, condición que selecciona las filas del grupo y si son compartibles con otros.
const tablas = [
  ['core.match', `t.phase_group_id = $1`],
  ['core.match_source', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.match_report', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.match_official', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.appearance', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.match_event', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.match_staff', `exists (select 1 from core.match m where m.id = t.match_id and m.phase_group_id = $1)`],
  ['core.matchday', `t.phase_group_id = $1`],
  ['core.team_entry', `t.phase_group_id = $1`],
  ['core.team_season', `exists (select 1 from core.team_entry te where te.team_season_id = t.id and te.phase_group_id = $1)`],
  ['core.team_alias', `exists (select 1 from core.team_season ts join core.team_entry te on te.team_season_id = ts.id where ts.id = t.team_season_id and te.phase_group_id = $1)`],
  ['core.club', `exists (select 1 from core.team_season ts join core.team_entry te on te.team_season_id = ts.id where ts.club_id = t.id and te.phase_group_id = $1)`],
  ['core.venue', `exists (select 1 from core.match m where m.venue_id = t.id and m.phase_group_id = $1)`],
  ['core.person', `exists (select 1 from core.appearance a join core.match m on m.id = a.match_id where a.person_id = t.id and m.phase_group_id = $1)
      or exists (select 1 from core.match_official o join core.match m on m.id = o.match_id where o.person_id = t.id and m.phase_group_id = $1)
      or exists (select 1 from core.match_staff s join core.match m on m.id = s.match_id where s.person_id = t.id and m.phase_group_id = $1)`],
  ['core.person_source_identity', `exists (select 1 from core.appearance a join core.match m on m.id = a.match_id where a.person_id = t.person_id and m.phase_group_id = $1)
      or exists (select 1 from core.match_official o join core.match m on m.id = o.match_id where o.person_id = t.person_id and m.phase_group_id = $1)
      or exists (select 1 from core.match_staff s join core.match m on m.id = s.match_id where s.person_id = t.person_id and m.phase_group_id = $1)`],
  ['core.person_name', `exists (select 1 from core.appearance a join core.match m on m.id = a.match_id where a.person_id = t.person_id and m.phase_group_id = $1)
      or exists (select 1 from core.match_official o join core.match m on m.id = o.match_id where o.person_id = t.person_id and m.phase_group_id = $1)
      or exists (select 1 from core.match_staff s join core.match m on m.id = s.match_id where s.person_id = t.person_id and m.phase_group_id = $1)`],
  ['source.external_ref', `t.federation_id = $2 and (
        exists (select 1 from core.match m where m.id = t.canonical_id and m.phase_group_id = $1)
     or exists (select 1 from core.matchday d where d.id = t.canonical_id and d.phase_group_id = $1)
     or exists (select 1 from core.team_entry te where te.id = t.canonical_id and te.phase_group_id = $1)
     or exists (select 1 from core.phase_group g where g.id = t.canonical_id and g.id = $1)
     or exists (select 1 from core.person p where p.id = t.canonical_id and (exists (select 1 from core.appearance a join core.match m on m.id = a.match_id where a.person_id = p.id and m.phase_group_id = $1)
        or exists (select 1 from core.match_official o join core.match m on m.id = o.match_id where o.person_id = p.id and m.phase_group_id = $1)
        or exists (select 1 from core.match_staff s join core.match m on m.id = s.match_id where s.person_id = p.id and m.phase_group_id = $1))))`],
  ['ops.coverage_checkpoint', `t.phase_group_id = $1`],
];

let totalMedido = 0;
let totalEstimado = 0;
console.log(`Grupo ${grupo} de ${federacion} (phase_group ${G}, edición ${fila.edicion_id})`);
console.log('  tabla                          filas    medido     total-relación  cuota-estimada');
for (const [tabla, condicion] of tablas) {
  const params = condicion.includes('$2') ? [G, fila.federacion_id] : [G];
  const { rows } = await pool.query(
    `select count(*)::int n, coalesce(sum(pg_column_size(t)),0)::bigint bytes from ${tabla} t where ${condicion}`,
    params);
  const { rows: total } = await pool.query(`select count(*)::int n, pg_total_relation_size('${tabla}')::bigint bytes from ${tabla}`);
  const n = rows[0].n;
  const bytes = Number(rows[0].bytes);
  const cuota = total[0].n > 0 ? Math.round((Number(total[0].bytes) * n) / total[0].n) : 0;
  totalMedido += bytes;
  totalEstimado += cuota;
  if (n === 0) continue;
  console.log(`  ${tabla.padEnd(30)} ${String(n).padStart(6)} ${(bytes / 1024).toFixed(0).padStart(9)} KB ${(Number(total[0].bytes) / 1048576).toFixed(1).padStart(12)} MB ${(cuota / 1024).toFixed(0).padStart(13)} KB`);
}
console.log(`\n  MEDIDO (suma de filas del grupo)         ${(totalMedido / 1048576).toFixed(2)} MB`);
console.log(`  ESTIMADO (proporción de tabla+índices)   ${(totalEstimado / 1048576).toFixed(2)} MB`);
console.log(`  Tamaño de la base entera                 ${(Number((await pool.query("select pg_database_size(current_database()) b")).rows[0].b) / 1048576).toFixed(1)} MB`);
await pool.end();
