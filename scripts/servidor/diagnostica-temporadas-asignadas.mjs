/*
 * diagnostica-temporadas-asignadas.mjs — ¿el recolector elige de verdad sólo su temporada?
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El reparto por temporadas de Castilla y León entre el PC y el servidor depende de UNA cosa: que
 * `siguienteTrabajo` no elija trabajo de la temporada de la otra máquina. Si el filtro no funcionara, las dos
 * pedirían las mismas actas al mismo portal y no habría ningún error que lo delatara —simplemente se trabajaría
 * el doble para el mismo resultado—, así que hay que comprobarlo mirando QUÉ trabajo elige con y sin la
 * asignación.
 *
 * Hay un detalle que este guion cuida: las etiquetas se leen al CARGAR el módulo, así que la variable tiene que
 * estar puesta ANTES de importarlo. Por eso el import es dinámico y va después de fijar el entorno; con un
 * `import` normal arriba, la prueba mediría siempre el caso «sin asignar» y daría un falso aprobado.
 *
 * SÓLO LEE la cola.
 *
 * Uso:
 *   node scripts/servidor/diagnostica-temporadas-asignadas.mjs <ruta-cola.sqlite>            (sin asignar)
 *   node scripts/servidor/diagnostica-temporadas-asignadas.mjs <ruta-cola.sqlite> 2025-26    (asignando)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('uso: diagnostica-temporadas-asignadas.mjs <ruta-cola.sqlite> [etiqueta...]');
  process.exit(2);
}
const asignadas = process.argv.slice(3);

// ANTES del import dinámico: las etiquetas se leen al cargar el módulo.
process.env.FACYLF_TEMPORADAS = asignadas.join(',');

const { cargaTemporadasAsignadas, temporadasAsignadas } = await import('../lib/temporadas-asignadas.mjs');
const { siguienteTrabajo } = await import('../lib/recolector-local.mjs');
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });

console.log(`cola: ${ruta}`);

/*
 * ── SE CARGA EL FICHERO IGUAL QUE LO HACE `abreBase` ─────────────────────────────────────────────────────
 *
 * Es la comprobación que de verdad importa: la asignación viaja en un fichero JUNTO A LA COLA, así que hay que
 * demostrar que se lee. Mirar sólo la variable de entorno daría un falso aprobado, porque el orden por defecto
 * (la temporada más reciente) coincide muchas veces con lo asignado y parecería que el filtro funciona.
 */
const asignacion = cargaTemporadasAsignadas(join(dirname(ruta), 'temporadas-asignadas.txt'));
console.log(`fichero de asignación: ${asignacion.origen ?? '(no hay: esta máquina trabaja todas las temporadas)'}`);
console.log(`temporadas asignadas: ${temporadasAsignadas().join(', ') || '(ninguna)'}`);

const tabla = db.prepare('select codigo, etiqueta from temporadas order by etiqueta').all();
if (tabla.length) {
  console.log('  código → etiqueta: ' + tabla.map((t) => `${t.codigo}=${t.etiqueta}`).join('  '));
} else {
  console.log('  (esta cola no tiene tabla `temporadas`)');
}

// Cuánto trabajo disponible hay por temporada, para poder explicar el resultado.
const ahora = new Date().toISOString();
console.log('  disponibles por temporada (trabajos pendientes y ya vencidos):');
for (const t of db.prepare(`select temporada, count(*) n from trabajos
    where estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?)
    group by temporada order by temporada`).all(ahora)) {
  const etiqueta = tabla.find((x) => String(x.codigo) === String(t.temporada))?.etiqueta ?? '—';
  console.log(`     ${String(t.temporada).padEnd(4)} ${String(etiqueta).padEnd(10)} ${t.n}`);
}

// Y lo que elige de verdad, que es la prueba.
const elegido = siguienteTrabajo(db);
if (!elegido) {
  console.log('\nELEGIDO: ninguno (no hay trabajo disponible con este filtro)');
} else {
  const etiqueta = tabla.find((x) => String(x.codigo) === String(elegido.temporada))?.etiqueta ?? '—';
  console.log(`\nELEGIDO: ${elegido.clave}`);
  console.log(`  temporada ${elegido.temporada} (${etiqueta}) · tipo ${elegido.tipo} · prioridad ${elegido.prioridad}`);
  if (asignadas.length && !asignadas.includes(etiqueta)) {
    console.log('  ✗ FALLA: ha elegido una temporada que NO está asignada a esta máquina.');
    process.exitCode = 1;
  } else if (asignadas.length) {
    console.log('  ✓ elige dentro de la temporada asignada.');
  }
}
db.close();
