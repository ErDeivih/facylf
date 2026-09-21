#!/usr/bin/env node
/** Estado de un trabajo concreto por su clave. */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, clave] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
console.log(db.prepare(`select clave, tipo, estado, prioridad, intentos, siguiente_intento, ultimo_error,
  actualizado_en from trabajos where clave=?`).get(clave));
const peticiones = db.prepare(`select iniciada_en, resultado, detalle from peticiones
  where trabajo like ? order by id desc limit 3`).all(`${clave.slice(0, -1)}%`);
console.log('peticiones:', peticiones);
db.close();
