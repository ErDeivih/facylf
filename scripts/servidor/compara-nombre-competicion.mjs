/*
 * compara-nombre-competicion.mjs — el nombre que guardamos y el que la propia acta declara
 *
 * ── QUÉ MIRA ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La clasificación de menores se decide con el nombre de la competición QUE GUARDAMOS en la tabla
 * `competiciones`. Pero cada acta archivada trae su propio `nombre_competicion`, tal como lo publica la fuente.
 * Si los dos no coinciden, la clasificación se decide con un dato peor que el que ya teníamos, y ese es el
 * camino por el que un acta de alevines puede acabar marcada como de adultos sin que nadie se entere.
 *
 * Este guion pone los dos nombres uno al lado del otro, competición por competición.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/compara-nombre-competicion.mjs <ruta-cola.sqlite> [temporada]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('uso: compara-nombre-competicion.mjs <ruta-cola.sqlite> [temporada]');
  process.exit(2);
}
const temporada = process.argv[3] ?? null;
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });

const filas = db.prepare(`select a.temporada, a.competicion,
    count(*) actas,
    sum(case when a.menores = 1 then 1 else 0 end) comoMenores,
    (select nombre from competiciones c where c.temporada = a.temporada and c.codigo = a.competicion) nombre
  from actas a
  where (? is null or a.temporada = ?)
  group by a.temporada, a.competicion
  order by actas desc limit 25`).all(temporada, temporada);

console.log(`cola: ${ruta}\n`);
console.log('  temporada  competición    actas   menores   nombre guardado en `competiciones`');
for (const f of filas) {
  console.log(`  ${String(f.temporada).padEnd(9)}  ${String(f.competicion).padEnd(12)} ${String(f.actas).padStart(6)}`
    + `   ${String(f.comoMenores).padStart(7)}   ${f.nombre === null ? '(NO HAY FILA)' : `«${f.nombre}»`}`);
}

// Y el dato que importa: ¿alguna competición con actas tiene nombre vacío o ausente?
const sinNombre = filas.filter((f) => f.nombre === null || f.nombre === '').length;
console.log('');
console.log(sinNombre
  ? `  ⚠ ${sinNombre} de las ${filas.length} competiciones listadas NO tienen nombre guardado.`
  : `  ✓ las ${filas.length} competiciones listadas tienen nombre guardado.`);
console.log('  (Si un nombre guardado no menciona la categoría —«Aleví», «Benjamí»— pero la ficha sí, la');
console.log('   clasificación de menores se está decidiendo con un nombre incompleto.)');
db.close();
