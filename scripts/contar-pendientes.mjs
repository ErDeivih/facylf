#!/usr/bin/env node
/** Escribe en la salida el número de trabajos pendientes de una cola (para el supervisor). */
import { DatabaseSync } from 'node:sqlite';
try {
  const db = new DatabaseSync(process.argv[2], { readOnly: true });
  const n = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')`).get().n;
  db.close();
  process.stdout.write(String(n));
} catch {
  process.stdout.write('-1');
}
