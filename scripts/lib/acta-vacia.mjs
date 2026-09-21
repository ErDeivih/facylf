/**
 * ¿Es esta acta una página VACÍA (la federación no ha publicado nada) o una maqueta que no entendemos?
 *
 * Esto sólo describe la salida del parser: la antigüedad del partido se decide en el worker, porque una ficha
 * vacía de un partido de esta semana puede llenarse en unos días y una de hace tres meses ya no.
 *
 * ── POR QUÉ NO SE MIRA EL ÁRBITRO (medido el 19/09/2026) ─────────────────────────────────────────────────────
 *
 * La primera versión exigía que tampoco hubiera árbitro, y por eso NO servía: en Navarra, las tres fichas que la
 * fuente no publica (actas de la 2023-24, partidos de mayo de 2024, 102 KB) se parsean así —
 *
 *     {"goles":0,"tarjetas":0,"cambios":0,"tecnicos":0,"locales":0,"arbitro":"sí"}
 *
 * — es decir, **el árbitro sí viene**: se designa ANTES del partido, así que su presencia no dice nada sobre si el
 * acta está publicada. Al revés, es una señal útil: si el árbitro se ha leído, la página es una ficha de acta de
 * verdad y el parser la entiende, así que lo que falta es el contenido deportivo, no la maqueta.
 *
 * Y sigue siendo conservador: si alguna de esas colecciones no es un array (una salida desconocida, un parser
 * nuevo, un campo que no está), NO se autoriza la ausencia definitiva. Sólo se declara vacía una acta cuyo
 * contenido deportivo se ha podido mirar entero y está vacío.
 */
export function actaSinContenidoDeportivo(acta) {
  const colecciones = [acta.goles, acta.tarjetas, acta.cambios, acta.tecnicos,
    acta.lineups?.local?.titulares, acta.lineups?.local?.suplentes,
    acta.lineups?.visitante?.titulares, acta.lineups?.visitante?.suplentes];
  return colecciones.every((lista) => Array.isArray(lista) && lista.length === 0);
}
