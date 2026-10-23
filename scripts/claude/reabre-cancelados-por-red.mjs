#!/usr/bin/env node
/*
 * reabre-cancelados-por-red.mjs — Trabajos CANCELADOS cuyo último error es de RED (no de la fuente): DNS que no
 * resuelve, conexión rechazada o cortada, tiempo agotado, `fetch failed`. Un fallo de red dice que ese día no
 * llegamos, no que la página no exista, así que no debió cancelarse (el código actual ya no lo hace: ver
 * `falloDeRed` en recolector-local.mjs; estos son de antes). Medido el 11/10/2026: ~40 actas en 9 federaciones
 * y 33 en Madrid.
 *
 * Sin `--aplicar` SÓLO CUENTA. Con `--aplicar` los vuelve a `pendiente` (sin fecha, intentos a 0) y, si su acta
 * quedó marcada como ausente, la devuelve a `pendiente` para que el grupo no se publique sin ella.
 * ESCRIBE en la cola con --aplicar: lo lanza David o DeepSeek, con el recolector de esa federación parado o
 * entre tandas (la cola usa WAL y espera hasta 2 min por el bloqueo).
 *
 * Uso: node reabre-cancelados-por-red.mjs <cola-v2.sqlite> [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';
const ruta = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!ruta) { console.error('uso: reabre-cancelados-por-red.mjs <cola-v2.sqlite> [--aplicar]'); process.exit(2); }
const RED = /net::ERR_|fetch failed|aborted due to timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|other side closed|^terminated$/i;
const db = new DatabaseSync(ruta, { readOnly: !aplicar, timeout: 120000 });
const candidatos = db.prepare(`select clave, tipo, temporada, competicion, grupo, jornada, acta, ultimo_error from trabajos
  where estado='cancelado' and ultimo_error is not null`).all().filter((t) => RED.test(String(t.ultimo_error)));
const porTipo = {};
for (const t of candidatos) porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + 1;
console.log(`${ruta}: ${candidatos.length} trabajos cancelados por fallo de red ${JSON.stringify(porTipo)}`);
if (!aplicar || !candidatos.length) { if (!aplicar) console.log('  (sin --aplicar: no se toca nada)'); process.exit(0); }
const ahora = new Date().toISOString();
const reabre = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0, actualizado_en=? where clave=? and estado='cancelado'`);
const acta = db.prepare(`update actas set estado='pendiente' where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?
  and estado in ('ausente_web','sin_datos')`);
let t = 0, a = 0;
db.exec('begin immediate');
try {
  for (const c of candidatos) {
    t += Number(reabre.run(ahora, c.clave).changes ?? 0);
    if (c.tipo === 'acta' && c.acta) a += Number(acta.run(c.temporada, c.competicion, c.grupo, c.jornada, c.acta).changes ?? 0);
  }
  db.exec('commit');
} catch (e) { db.exec('rollback'); throw e; }
console.log(`  reabiertos ${t} trabajos y ${a} actas`);
db.close();
