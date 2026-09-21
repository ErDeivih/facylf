#!/usr/bin/env node
/**
 * Pone un trabajo concreto al frente de la cola para poder observar qué contesta la federación.
 * Es una sola petición: sirve para diagnosticar, no para forzar la recolección.
 *
 * Uso: node scripts/_diag-adelantar-trabajo.mjs <ruta-cola> <clave-completa-del-trabajo>
 *      (la clave se ve en la columna `clave` de `trabajos`, p. ej. indice_jornadas|19|6335|6335|1)
 */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, clave] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb);
db.exec('pragma busy_timeout=10000');
const antes = db.prepare(`select clave, tipo, estado, prioridad, intentos, siguiente_intento, ultimo_error
  from trabajos where clave=?`).get(clave);
if (!antes) {
  console.error(`no existe el trabajo ${clave}`);
  const parecidos = db.prepare(`select clave from trabajos where clave like ? limit 8`).all(`%${clave}%`);
  for (const p of parecidos) console.log('  parecido:', p.clave);
  db.close();
  process.exit(1);
}
console.log('antes:', antes);
db.prepare(`update trabajos set estado='pendiente', prioridad=0, intentos=0, siguiente_intento=null,
  actualizado_en=? where clave=?`).run(new Date().toISOString(), clave);
console.log('después:', db.prepare(`select clave, estado, prioridad, intentos, siguiente_intento from trabajos where clave=?`).get(clave));
db.close();
