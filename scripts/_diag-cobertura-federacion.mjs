/*
 * ¿Está Euskadi terminada? Cobertura real de su cola, no la impresión de una sesión.
 *
 * Mide: temporadas, competiciones, grupos y jornadas; cuántas jornadas están comprobadas y cuántas no; y el
 * estado de los trabajos por tipo. Sólo lee.
 *
 * Uso: node scripts/_diag-cobertura-federacion.mjs euskadi
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const federacion = process.argv[2] ?? 'euskadi';
const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;

console.log(`═══ ${federacion}`);
console.log(`  temporadas ${uno('select count(*) n from temporadas')} · competiciones ${uno('select count(*) n from competiciones')} · grupos ${uno('select count(*) n from grupos')} · jornadas ${uno('select count(*) n from jornadas')}`);
console.log(`  partidos ${uno('select count(*) n from partidos')} · equipos ${uno('select count(*) n from equipos')} · actas ${uno('select count(*) n from actas')} (hechas ${uno("select count(*) n from actas where estado='hecha'")})`);

console.log('\n  jornadas por estado de comprobación:');
for (const t of db.prepare(`select temporada, count(*) total,
    sum(case when comprobada_en is not null then 1 else 0 end) comprobadas
  from jornadas group by temporada order by temporada`).all()) {
  console.log(`    t${t.temporada}: ${t.comprobadas}/${t.total} comprobadas`);
}

console.log('\n  trabajos por tipo y estado:');
for (const t of db.prepare(`select tipo, estado, count(*) n from trabajos group by tipo, estado order by tipo, n desc`).all()) {
  console.log(`    ${String(t.tipo).padEnd(18)} ${String(t.estado).padEnd(11)} ${t.n}`);
}

console.log('\n  pendientes por tipo, y los que YA se podrían hacer:');
const ahora = new Date().toISOString();
for (const t of db.prepare(`select tipo, count(*) n,
    sum(case when siguiente_intento is null or siguiente_intento <= ? then 1 else 0 end) ya
  from trabajos where estado='pendiente' group by tipo order by n desc`).all(ahora)) {
  console.log(`    ${String(t.tipo).padEnd(18)} ${String(t.n).padStart(6)} pendientes · ${String(t.ya).padStart(6)} ya disponibles`);
}
const prox = db.prepare(`select min(siguiente_intento) m from trabajos where estado='pendiente' and siguiente_intento > ?`).get(ahora)?.m;
console.log(`  el siguiente aplazado llega en: ${prox ?? '—'}`);
db.close();
