/*
 * Integridad de una cola: `pragma quick_check`. Imprime `ok` o el problema.
 *
 * El 01/10/2026 aparecieron dos colas del servidor con corrupción por una caída de energía (el `pragma` devolvía
 * filas de error en vez de `ok`), y desde entonces esta comprobación se hace siempre después de tocar colas —y
 * estas semanas se han tocado mucho: se han desaparcado ~285.000 trabajos en las dos máquinas.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/integridad-cola.mjs <cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) { console.log('no-existe'); process.exit(0); }
try {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 120_000 });
  try {
    const filas = db.prepare('pragma quick_check').all();
    const primero = String(Object.values(filas[0] ?? {})[0] ?? 'sin-respuesta');
    if (filas.length === 1 && /^ok$/i.test(primero)) console.log('ok');
    else console.log(`PROBLEMA: ${filas.slice(0, 3).map((f) => Object.values(f)[0]).join(' | ')}`);
  } finally {
    db.close();
  }
} catch (e) {
  console.log(`ERROR: ${String(e.message).slice(0, 90)}`);
}
