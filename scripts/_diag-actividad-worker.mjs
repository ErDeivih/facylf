/*
 * ¿El worker ha hecho peticiones NATURALES después de una hora concreta, y qué jornadas ha comprobado?
 *
 * Es la comprobación de que el supervisor relanza el recolector y de que el ritmo sigue siendo el suyo: no
 * basta con que el proceso esté vivo, hay que ver peticiones nuevas y jornadas selladas después de la hora.
 * Sólo lee.
 *
 * Uso: node scripts/_diag-actividad-worker.mjs [federacion] [desdeISO]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federacion = process.argv[2] ?? 'euskadi';
const desde = process.argv[3] ?? '2026-09-17T06:00:00.000Z';
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const tablas = db.prepare("select name from sqlite_master where type='table' order by name").all().map((t) => t.name);
console.log(`tablas: ${tablas.join(', ')}`);

const columnas = (t) => db.prepare(`pragma table_info(${t})`).all().map((c) => c.name);

console.log(`\n-- jornadas comprobadas (max y por día) --`);
for (const f of db.prepare(`select substr(comprobada_en,1,10) dia, count(*) n from jornadas
  where comprobada_en is not null group by dia order by dia desc limit 7`).all()) {
  console.log(`  ${f.dia}: ${f.n}`);
}
const maximo = db.prepare('select max(comprobada_en) m from jornadas').get().m;
console.log(`  máximo comprobada_en: ${maximo}`);

if (tablas.includes('peticiones')) {
  console.log(`\n-- peticiones (columnas: ${columnas('peticiones').join(', ')}) --`);
  const tieneCuando = columnas('peticiones').find((c) => /en$|fecha|hora/.test(c));
  console.log(`  total: ${db.prepare('select count(*) n from peticiones').get().n}`);
  if (tieneCuando) {
    console.log(`  después de ${desde}: ${db.prepare(`select count(*) n from peticiones where ${tieneCuando} >= ?`).get(desde).n}`);
    for (const p of db.prepare(`select * from peticiones where ${tieneCuando} >= ? order by ${tieneCuando} limit 8`).all(desde)) {
      console.log(`    ${JSON.stringify(p)}`);
    }
  }
}
if (tablas.includes('trabajos')) {
  console.log('\n-- trabajos --');
  for (const t of db.prepare('select estado, count(*) n from trabajos group by estado').all()) console.log(`  ${t.estado}: ${t.n}`);
  for (const t of db.prepare("select clave, estado, siguiente_intento from trabajos where estado='en_curso' limit 5").all()) {
    console.log(`  en curso: ${JSON.stringify(t)}`);
  }
}
if (tablas.includes('descansos')) console.log(`\ndescansos (tabla): ${db.prepare('select count(*) n from descansos').get().n}`);
if (tablas.includes('decisiones_descanso')) {
  console.log(`\ndecisiones_descanso: ${db.prepare('select count(*) n from decisiones_descanso').get().n}`);
  for (const c of db.prepare('pragma table_info(decisiones_descanso)').all()) console.log(`  columna ${c.name}`);
}
db.close();
