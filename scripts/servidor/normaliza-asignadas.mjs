/*
 * ── NORMALIZA EL FICHERO DE TEMPORADAS ASIGNADAS: CÓDIGOS → ETIQUETAS ─────────────────────────────────────
 *
 * `lib/temporadas-asignadas.mjs` lee ETIQUETAS (`2017-18`) y las traduce a códigos por la tabla `temporadas`
 * de cada cola. El motivo está escrito allí: **el código no significa lo mismo en cada federación** (en La Rioja
 * el 9 es 2013-14 y en Andalucía el 19 es 2023-24), así que un código suelto filtra por la temporada equivocada
 * **sin dar ningún aviso**.
 *
 * La herramienta `abre-temporada.mjs` escribió CÓDIGOS durante las rondas del 06/10/2026. Resultado medido:
 * Madrid y Valencia quedaron con `18 17 16 15 14 13 12 11`, que el lector no reconoce — **la asignación no valía
 * para nada y el suelo volvía a excluir el trabajo al elegirlo**. Y CyL quedó con la lista mezclada.
 *
 * Esto lo arregla: traduce cada código conocido de ESA cola a su etiqueta, deja las etiquetas como están, quita
 * duplicados y valores que la cola no conoce (avisando de ellos). Por defecto sólo MIRA.
 *
 * Uso:
 *   node scripts/servidor/normaliza-asignadas.mjs <cola.sqlite> [--escribir] [--fichero <ruta>]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const cola = args[0];
const escribir = args.includes('--escribir');
const iF = args.indexOf('--fichero');

if (!cola || !existsSync(cola)) { console.error('uso: normaliza-asignadas.mjs <cola.sqlite> [--escribir] [--fichero <ruta>]'); process.exit(2); }
const fichero = iF >= 0 ? args[iF + 1] : join(dirname(cola), 'temporadas-asignadas.txt');
if (!existsSync(fichero)) { console.log(`no hay fichero de asignadas: ${fichero}`); process.exit(0); }

const db = new DatabaseSync(cola, { readOnly: true, timeout: 60_000 });
try {
  const etiquetaDe = (codigo) => db.prepare('select etiqueta from temporadas where codigo = ?').get(String(codigo))?.etiqueta ?? null;

  const originales = readFileSync(fichero, 'utf8').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);

  const salida = [];
  const desconocidas = [];
  for (const valor of originales) {
    // ¿Es una etiqueta que la cola conoce? Entonces ya está bien.
    const comoEtiqueta = db.prepare('select codigo from temporadas where etiqueta = ?').get(valor)?.codigo;
    if (comoEtiqueta) { if (!salida.includes(valor)) salida.push(valor); continue; }
    // ¿Es un código de esta cola? Se traduce.
    const et = etiquetaDe(valor);
    if (et) { if (!salida.includes(et)) salida.push(et); continue; }
    desconocidas.push(valor);
  }

  console.log(`  ${fichero}`);
  console.log(`    antes : ${originales.join(' ')}`);
  console.log(`    después: ${salida.join(' ')}`);
  if (desconocidas.length) console.log(`    ⚠ la cola no conoce: ${desconocidas.join(' ')}`);

  if (escribir) {
    writeFileSync(fichero, salida.join('\n') + '\n', 'utf8');
    console.log('    escrito.');
  } else {
    console.log('    (mirar: repetir con --escribir)');
  }
} finally {
  db.close();
}
