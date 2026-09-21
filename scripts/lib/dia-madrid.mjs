/*
 * EL DÍA CIVIL DE MADRID, EN UN SOLO SITIO.
 *
 * El presupuesto diario de peticiones es «por día», y el día que vale es el de Madrid: es el que ve quien mira
 * la federación, y el que usa el recolector para decidir si ya ha gastado su cupo. Pero las marcas de tiempo se
 * guardan en UTC (`ahoraIso()`), así que comparar la fecha de Madrid contra `substr(iniciada_en, 1, 10)` compara
 * dos cosas distintas.
 *
 * Medido el 19/09/2026: con esa comparación, una petición hecha a las 23:30 UTC del 31 de enero (00:30 del 1 de
 * febrero en Madrid) contaba para el 31 y no para el 1, es decir que el cupo se renovaba a medianoche UTC
 * (01:00 o 02:00 en Madrid) y en esa hora se podían colar peticiones de más. Por eso la cola guarda ahora el día
 * de Madrid de cada petición en su propia columna (`peticiones.dia_madrid`), calculada al registrarla.
 *
 * Lo usan el recolector (al registrar la petición y al contar el cupo), el supervisor (`proximo-trabajo.mjs`) y
 * `ajustar-flota.mjs`. Estaba copiado en tres guiones con la misma línea; ahora hay una sola definición.
 */

/** Día civil de Madrid (`AAAA-MM-DD`) de un instante. Sin argumento, ahora. */
export function diaDeMadrid(instante = Date.now()) {
  const momento = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(momento.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(momento);
}

/** Hora (0-23) de Madrid de un instante. Sin argumento, ahora. */
export function horaDeMadrid(instante = Date.now()) {
  const momento = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(momento.getTime())) return null;
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23',
  }).format(momento));
}
