#!/usr/bin/env node
/** Los próximos trabajos que va a coger un worker, en orden. */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
const cuantos = Number(process.argv[3] ?? 8);
const db = new DatabaseSync(ruta, { readOnly: true });
const filas = db.prepare(`select tipo, temporada, competicion, grupo, jornada, acta, prioridad, estado,
    intentos, ultimo_error from trabajos
  where estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?)
  order by prioridad, coalesce(cast(temporada as integer), -1) desc,
    case when tipo='acta' then 0 else 1 end, creado_en limit ?`).all(new Date().toISOString(), cuantos);
for (const f of filas) {
  console.log(`prio=${String(f.prioridad).padStart(9)} ${f.tipo.padEnd(15)} t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada ?? '-'} acta=${f.acta ?? '-'} intentos=${f.intentos} ${f.ultimo_error ?? ''}`);
}
db.close();
