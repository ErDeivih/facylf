/*
 * lee-temporadas-asignadas.mjs — ¿qué temporadas tiene asignadas ESTA federación, leídas como las lee el recolector?
 *
 * Existe para poder comprobarlo DENTRO del contenedor sin escribir JavaScript en la línea de órdenes: con
 * `node -e "<javascript>"` por `ssh`, Windows PowerShell destroza las comillas (pasó dos veces el 24/09/2026) y
 * el código llega roto.
 *
 * Imprime la ruta del fichero, las temporadas que ha leído y, si hay cola al lado, a qué CÓDIGO de esta
 * federación corresponden. Ese último dato importa: los códigos de temporada NO son los mismos en cada
 * federación, así que una asignación «que parece bien» puede estar filtrando por una temporada equivocada.
 *
 * SÓLO LEE.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cargaTemporadasAsignadas, temporadasAsignadas, resuelveTemporadasAsignadas } from '../lib/temporadas-asignadas.mjs';

// La misma ruta que usa `abreBase`: el fichero vive JUNTO A LA COLA de la federación.
const carpeta = process.env.FACYLF_CARPETA ?? '/app/descargas-federacion/recolector-local';
const archivo = `${carpeta}/temporadas-asignadas.txt`;
const cola = `${carpeta}/cola-v2.sqlite`;

const carga = cargaTemporadasAsignadas(archivo);
console.log(`fichero:    ${carga.origen ?? '(no hay: esta máquina trabaja TODAS las temporadas)'}`);
console.log(`asignadas:  ${temporadasAsignadas().join(', ') || '(ninguna)'}`);

if (existsSync(cola) && temporadasAsignadas().length) {
  const db = new DatabaseSync(cola, { readOnly: true, timeout: 30_000 });
  const r = resuelveTemporadasAsignadas(db);
  console.log(`códigos en esta cola: ${r.codigos.join(', ') || '(ninguno)'}`);
  if (r.desconocidas.length) {
    console.log(`AVISO: esta cola NO conoce estas temporadas asignadas: ${r.desconocidas.join(', ')}`);
    console.log('       Con el filtro puesto y ninguna temporada válida, el recolector se quedaría SIN TRABAJO.');
  }
  db.close();
}
