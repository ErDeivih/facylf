/*
 * ficha-espera.mjs — leer el latido de una ficha de espera de plaza sin tumbar al recolector.
 *
 * POR QUÉ EXISTE (09/11/2026). Al limpiar las fichas de espera abandonadas, el recolector las lista con
 * `readdirSync` y después les hace `statSync` para saber cuándo latieron. Entre las dos llamadas otra
 * sesión puede borrar la ficha (es exactamente lo que hacen los demás al retirar las abandonadas), y
 * `statSync` lanza ENOENT: el worker termina con código 1 y el supervisor lo relanza. Medido en
 * Castilla y León: 876 salidas con código 1, con 5 plazas y varias federaciones esperando.
 *
 * La regla es la del proyecto: lo que ya no está no es un error, es «sin latido», y se sigue. Cualquier
 * otro fallo al leer el fichero tampoco puede parar la recolección: se trata igual y la limpieza decide.
 */
import { statSync } from 'node:fs';

/**
 * Fecha del último latido de una ficha, en milisegundos, o `null` si no se puede leer.
 * @param {string} ruta
 * @param {{stat?: (ruta: string) => {mtimeMs: number}}} [opciones] `stat` se inyecta en las pruebas
 * @returns {number|null}
 */
export function latidoDeFicha(ruta, { stat = statSync } = {}) {
  try {
    const datos = stat(ruta);
    const cuando = Number(datos?.mtimeMs);
    return Number.isFinite(cuando) ? cuando : null;
  } catch {
    return null;
  }
}
