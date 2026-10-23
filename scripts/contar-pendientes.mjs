#!/usr/bin/env node
/**
 * Escribe en la salida el número de trabajos pendientes YA VENCIDOS de una cola (para el supervisor).
 *
 * Antes contaba todos los pendientes, también los aplazados a una fecha futura (11/10/2026): Cataluña tenía 905,
 * todos con fecha de dentro de días o meses, y el supervisor la relanzaba cada 20 s —`preparar` + `arrancar` +
 * «Sin trabajo pendiente»— día y noche, abriendo una cola de 360 MB dos veces por minuto para nada. Ahora sólo
 * cuenta lo que se puede pedir ya; con 0, el supervisor espera media hora y vuelve a mirar, así que lo aplazado
 * se recoge como mucho media hora después de vencer.
 */
import { DatabaseSync } from 'node:sqlite';
try {
  const db = new DatabaseSync(process.argv[2], { readOnly: true });
  const n = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)`).get(new Date().toISOString()).n;
  db.close();
  process.stdout.write(String(n));
} catch {
  process.stdout.write('-1');
}
