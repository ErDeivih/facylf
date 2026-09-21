import type { VeredictoActaDescanso } from '../parsers/filas-informativas.js';

/** Veredicto del acta de un bloque de descanso, con el caso «la fila no trae acta» incluido. */
export type VeredictoDeBloque = VeredictoActaDescanso | 'sin-acta';

/**
 * ¿Este bloque de descanso se APARTA de la comparación posición a posición de la jornada?
 *
 * La comparación entre la cola y el HTML archivado es posicional: la fila `n` de la jornada se compara con
 * la `n`-ésima que el extractor produce de ese HTML. Un bloque de descanso que está en un lado y no en el
 * otro **desplaza una posición todas las filas siguientes**, así que hay que quitarlo de los dos lados a la
 * vez. No apartarlo no produce un hallazgo: produce ruido.
 *
 * Aquí está la lección que costó un lote entero. La detección se hacía **recorriendo la cola**: se buscaban
 * filas sospechosas y se abría su acta. Funcionaba mientras la fila seguía en la cola, y dejó de funcionar
 * en cuanto el lote retiró esas filas: **sin fila en la cola no había nada que recorrer**, el bloque del
 * HTML se quedaba sin reconocer y las jornadas afectadas volvían a desalinearse. Medido en Euskadi tras
 * aplicar el lote `e698fde408abbfc4`: 54 filas «ambiguas» que eran puro artefacto.
 *
 * Por eso la decisión **no** depende de que la fila esté en la cola, salvo para el único caso en que debe
 * depender. Las tres reglas, en orden:
 *
 *   1. **`partido-real` nunca se aparta.** El acta de esa fila nombra DOS EQUIPOS REALES: ahí hubo partido.
 *      Apartarlo lo escondería de la comparación y dejaría de declararse. Es la única prohibición absoluta.
 *   2. **`descanso` se aparta siempre.** El acta nombra el descanso en uno de sus lados, así que la
 *      federación documentó que ahí no hubo partido; esté o no la fila en la cola.
 *   3. **Sin fila en la cola, se aparta también lo que el acta no sostiene** (`sin-acta` y `no-demuestra`).
 *      La fuente publica el bloque y la cola no tiene esa fila: no hay nada que comparar, y dejarlo en un
 *      solo lado únicamente desalinea. Si el acta lo sostuviera como partido real, ya lo habría atrapado (1).
 *
 * `enLaCola` es, por tanto, «¿la cola tiene hoy una fila con esta pareja?», no «¿trae acta?»: confundir las
 * dos cosas es exactamente el error que se corrigió al decidir las retiradas.
 */
export function apartaBloqueDeLaComparacion(entrada: { veredicto: VeredictoDeBloque; enLaCola: boolean }): boolean {
  if (entrada.veredicto === 'partido-real') return false;
  return entrada.veredicto === 'descanso' || !entrada.enLaCola;
}
