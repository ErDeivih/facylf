/*
 * ¿Por qué están aplazados los trabajos de Euskadi? (y de cualquier federación)
 *
 * La pregunta es si el aplazamiento masivo es una POLÍTICA deliberada (no insistir a la fuente) o un efecto
 * lateral de los fallos, que dejaría trabajo parado sin motivo. Se mira por tipo, por día y con ejemplos.
 *
 * Sólo lee. Uso: node scripts/_diag-aplazamientos.mjs euskadi
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const federacion = process.argv[2] ?? 'euskadi';
const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const ahora = new Date().toISOString();

console.log(`═══ ${federacion}: por qué se aplaza`);
console.log('\n  pendientes por tipo y por día de reintento:');
for (const t of db.prepare(`select tipo, substr(coalesce(siguiente_intento, 'SIN FECHA'), 1, 10) dia, count(*) n
  from trabajos where estado = 'pendiente' group by tipo, dia order by tipo, dia limit 24`).all()) {
  console.log(`    ${String(t.tipo).padEnd(16)} ${String(t.dia).padEnd(12)} ${t.n}`);
}
console.log('\n  intentos de los pendientes (¿son reintentos de algo que falló?):');
for (const t of db.prepare(`select intentos, count(*) n from trabajos where estado = 'pendiente' group by intentos order by intentos`).all()) {
  console.log(`    ${t.intentos} intento(s): ${t.n}`);
}
console.log('\n  ¿de QUÉ temporada es lo que está aplazado? (una jornada futura se aplaza por diseño;');
console.log('   una histórica sin comprobar se aplaza por otra cosa y eso sí habría que mirarlo)');
for (const t of db.prepare(`select tipo, temporada, count(*) n from trabajos
  where estado = 'pendiente' group by tipo, temporada order by tipo, temporada`).all()) {
  console.log(`    ${String(t.tipo).padEnd(16)} t${String(t.temporada).padEnd(4)} ${t.n}`);
}
console.log('\n  ejemplos de lo que está aplazado:');
for (const e of db.prepare(`select clave, tipo, intentos, siguiente_intento from trabajos
  where estado = 'pendiente' order by siguiente_intento limit 6`).all()) {
  console.log(`    ${String(e.clave).slice(0, 44).padEnd(46)} intentos ${e.intentos} · ${e.siguiente_intento}`);
}
console.log('\n  ¿cuánta gente espera detrás? jornadas de la cola sin comprobar nunca:');
const nunca = db.prepare(`select count(*) n from jornadas where comprobada_en is null`).get().n;
const total = db.prepare('select count(*) n from jornadas').get().n;
console.log(`    ${nunca} de ${total} jornadas no se han comprobado NUNCA`);
void ahora;
db.close();
