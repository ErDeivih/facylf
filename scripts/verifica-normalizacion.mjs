/*
 * ¿Existe una función de normalización en el canónico? El buscador tiene que ignorar tildes y mayúsculas,
 * y las columnas `nombre_norm` / `nombre_en_fuente_norm` se rellenan con la función del propio proyecto:
 * usarla es la única forma de que «Atlético» encuentre «atletico» y «C.D. Navega» encuentre «navega».
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const c = new pg.Client({ connectionString: env.DATABASE_URL_LECTOR });
await c.connect();

const f = await c.query(`select n.nspname, p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname ilike '%normaliza%' order by 1, 2`);
console.log('=== FUNCIONES DE NORMALIZACIÓN ===');
for (const x of f.rows) console.log(`  ${x.nspname}.${x.proname}(${x.args})`);
if (f.rows.length === 0) console.log('  (ninguna)');

console.log('\n=== PRUEBA CON TILDES Y PUNTOS ===');
for (const texto of ['Atlético', 'C.D. Navega', 'Pizarrales', 'victoria c.f.', 'Hergar Helmántica']) {
  try {
    const r = await c.query('select core.normaliza_nombre($1) as n', [texto]);
    console.log(`  "${texto}" -> "${r.rows[0].n}"`);
  } catch (e) { console.log(`  "${texto}" -> ERROR: ${e.message}`); }
}

console.log('\n=== ¿COMO SE GUARDAN DE VERDAD EN LAS COLUMNAS _norm? ===');
const r = await c.query(`select nombre_canonico, nombre_norm from core.club
  where nombre_canonico ilike '%victoria%' or nombre_canonico ilike '%navega%' limit 5`);
for (const x of r.rows) console.log(`  "${x.nombre_canonico}" -> "${x.nombre_norm}"`);
await c.end();
