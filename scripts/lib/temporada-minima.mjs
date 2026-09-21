/**
 * Suelo de temporadas de la recolección.
 *
 * Decisión del cliente (14/9/2026): de momento se recogen **sólo las temporadas 2023-24 en adelante**
 * (23-24, 24-25, 25-26 y la 26-27 que se va generando). Lo ya recogido de temporadas anteriores no se
 * tira: queda donde está, aplazado, para cuando se retome el histórico.
 *
 * El identificador de temporada NO sirve para comparar entre federaciones: en La Rioja el código 9 es
 * 2013-14 y en Andalucía el 19 es 2023-24. Por eso el suelo se compara siempre contra la **etiqueta**
 * (`temporadas.etiqueta`, formato `AAAA-AA`), que sí ordena igual en las dieciocho colas.
 *
 * Dos usos:
 *   · `encola()` no crea trabajo de temporadas por debajo del suelo;
 *   · las consultas que eligen el siguiente trabajo lo excluyen, por si quedara alguno encolado.
 *
 * Se puede cambiar sin tocar código con `FACYLF_TEMPORADA_MINIMA=2020-21`.
 */

export const TEMPORADA_MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2023-24';

/** ¿Esta etiqueta entra dentro de lo que se recoge? Una etiqueta que no se entiende se deja pasar. */
export function esTemporadaDeTrabajo(etiqueta, minima = TEMPORADA_MINIMA) {
  if (!etiqueta) return true;
  return String(etiqueta) >= minima;
}

/**
 * ¿Hay que trabajar esta temporada? Sin entrada en `temporadas` se deja pasar: no se descarta trabajo
 * por un catálogo que todavía no se ha descubierto. Lo que sí se excluye es lo que el catálogo ya ha
 * dicho que es antiguo.
 *
 * La consulta se hace viva (una lectura de una tabla pequeña) y no con una caché: el catálogo se
 * escribe mientras se encola trabajo, y una caché construida a mitad de una transacción trataría como
 * «desconocida» una temporada que se acaba de registrar.
 */
export function esTemporadaDeTrabajoDeLaCola(db, temporada, minima = TEMPORADA_MINIMA) {
  if (temporada === null || temporada === undefined || temporada === '') return true;
  const fila = db.prepare('select etiqueta from temporadas where codigo = ?').get(String(temporada));
  if (!fila) return true;
  return esTemporadaDeTrabajo(fila.etiqueta, minima);
}

/** Fragmento SQL para excluir en una consulta los trabajos de temporadas ya catalogadas como antiguas. */
export function sqlExcluyeTemporadasViejas(alias = 't') {
  const columna = alias ? `${alias}.temporada` : 'temporada';
  return `(${columna} is null or ${columna} not in (select codigo from temporadas where etiqueta < ?))`;
}

/**
 * Aplaza el trabajo pendiente de temporadas antiguas: no se borra ni se cancela nada —queda para el
 * histórico— pero deja de consumir tiempo de recolección y el visor lo cuenta como aplazado.
 * Devuelve cuántos trabajos ha tocado.
 */
export function aplazaTemporadasViejas(db, minima = TEMPORADA_MINIMA, { hasta = '2099-01-01T00:00:00.000Z' } = {}) {
  const resultado = db.prepare(`
    update trabajos set siguiente_intento = ?, actualizado_en = ?
    where estado = 'pendiente'
      and temporada in (select codigo from temporadas where etiqueta < ?)
      and (siguiente_intento is null or siguiente_intento < ?)
  `).run(hasta, new Date().toISOString(), minima, hasta);
  return Number(resultado.changes ?? 0);
}

/** Deshace el aplazamiento (para cuando se retome el histórico). */
export function reactivaTemporadasViejas(db, minima = TEMPORADA_MINIMA) {
  const resultado = db.prepare(`
    update trabajos set siguiente_intento = null, actualizado_en = ?
    where estado = 'pendiente'
      and temporada in (select codigo from temporadas where etiqueta < ?)
  `).run(new Date().toISOString(), minima);
  return Number(resultado.changes ?? 0);
}
