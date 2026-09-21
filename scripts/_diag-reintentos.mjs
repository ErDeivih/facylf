#!/usr/bin/env node
/** Trabajos que se reintentan una y otra vez por el mismo motivo: cuántos son y cuántos intentos llevan. */
import { DatabaseSync } from 'node:sqlite';

const rutaDb = process.argv[2];
const db = new DatabaseSync(rutaDb, { readOnly: true });
const filas = db.prepare(`select tipo, ultimo_error, count(*) n, min(intentos) mini, max(intentos) maxi,
    sum(case when estado='pendiente' then 1 else 0 end) pendientes, sum(case when estado='hecho' then 1 else 0 end) hechos
  from trabajos where ultimo_error is not null
  group by tipo, ultimo_error order by n desc limit 12`).all();
for (const f of filas) {
  console.log(`${String(f.n).padStart(6)} × ${f.tipo.padEnd(14)} intentos ${f.mini}-${f.maxi} (pendientes ${f.pendientes}, hechos ${f.hechos}) · ${String(f.ultimo_error).slice(0, 78)}`);
}
const pendientes = db.prepare(`select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?`)
  .get(new Date().toISOString()).n;
console.log(`\ntrabajos pendientes aplazados (siguiente_intento en el futuro): ${pendientes}`);
db.close();
