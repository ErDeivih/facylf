/*
 * estado-cola-pc.mjs — reparto, ritmo y errores de las colas del PC, sin abrirlas en escritura.
 *
 * Responde a las tres preguntas que se hacen de verdad: por dónde va cada federación, a qué ritmo avanza y
 * qué se está quedando por el camino. El esquema de la cola lo imprime en vez de suponerlo, porque las
 * columnas útiles (`ultimo_error`, `intentos`, `actualizado_en`) son las que dicen si un trabajo ha fallado.
 *
 * Uso:  node scripts/estado-cola-pc.mjs [ruta.sqlite ...]
 *       (sin argumentos revisa las cuatro colas del reparto actual)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const POR_DEFECTO = [
  ['castilla-leon', 'descargas-federacion/recolector-local/cola-v2.sqlite'],
  ['valencia', 'descargas-valencia/recolector-local/cola-v2.sqlite'],
  ['madrid', 'descargas-madrid/recolector-local/cola-v2.sqlite'],
  ['cataluna', 'descargas-cataluna/recolector-local/cola-v2.sqlite'],
];
const colas = process.argv.length > 2
  ? process.argv.slice(2).map((r) => [r, r])
  : POR_DEFECTO;

for (const [nombre, ruta] of colas) {
  console.log(`\n════════ ${nombre.toUpperCase()} ════════`);
  if (!existsSync(ruta)) {
    console.log(`  (no existe ${ruta})`);
    continue;
  }
  const db = new DatabaseSync(ruta, { readOnly: true });
  const tablas = db.prepare("select name from sqlite_master where type='table'").all().map((t) => t.name);
  if (!tablas.includes('trabajos')) {
    console.log(`  (sin tabla trabajos: ${tablas.join(', ')})`);
    db.close();
    continue;
  }
  const nombres = db.prepare('pragma table_info(trabajos)').all().map((c) => c.name);
  const col = (...c) => c.find((x) => nombres.includes(x));

  console.log('  ESTADO DE LOS TRABAJOS');
  for (const f of db.prepare('select estado, count(*) as n from trabajos group by 1 order by 2 desc').all()) {
    console.log(`    ${String(f.estado).padEnd(14)} ${f.n}`);
  }

  const cFecha = col('actualizado_en');
  if (cFecha) {
    console.log(`  RITMO POR HORA (trabajos tocados, hora UTC; el PC va 2 h por delante)`);
    const porHora = db.prepare(`select strftime('%H', ${cFecha}) as hora, count(*) as n
      from trabajos where ${cFecha} >= datetime('now', '-8 hours') group by 1 order by 1 desc`).all();
    for (const f of porHora) console.log(`    ${f.hora}h  ${f.n}`);
  }

  /*
   * Un trabajo `pendiente` que además tiene `siguiente_intento` en el futuro NO es trabajo disponible: es un
   * reintento aplazado. La diferencia importa, porque decide si la federación va lenta o simplemente ya no
   * tiene nada que hacer ahora mismo. Medido el 25/09/2026 en Castilla y León: 60.928 pendientes, de los que
   * 38.397 estaban esperando turno y sólo ~22.500 estaban listos para recogerse.
   */
  const cPendiente = col('siguiente_intento');
  if (cPendiente) {
    const esperando = db.prepare(`select count(*) as n from trabajos
      where estado in ('pendiente','en_curso') and ${cPendiente} is not null and ${cPendiente} > datetime('now')`).get();
    const disponibles = db.prepare(`select count(*) as n from trabajos
      where estado = 'pendiente' and (${cPendiente} is null or ${cPendiente} <= datetime('now'))`).get();
    console.log(`  EN ESPERA POR REINTENTO: ${esperando.n}  ·  LISTOS PARA RECOGER AHORA: ${disponibles.n}`);
  }

  const cError = col('ultimo_error');
  if (cError) {
    const errores = db.prepare(`select substr(${cError}, 1, 70) as motivo, count(*) as n
      from trabajos where ${cError} is not null group by 1 order by 2 desc limit 6`).all();
    console.log('  MOTIVOS MÁS FRECUENTES DE FALLO/DESCARTE');
    if (errores.length === 0) console.log('    (ninguno)');
    for (const e of errores) console.log(`    ${String(e.n).padStart(6)}  ${e.motivo}`);
  }
  db.close();
}
