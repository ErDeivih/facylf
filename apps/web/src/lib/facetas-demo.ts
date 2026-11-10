/**
 * Modo demostración: la foto estática publicada en GitHub Pages enseña SOLO la temporada 2026-27 y solo
 * opciones que tienen datos. Se activa con `FACYLF_DEMO=1` en el proceso que genera la foto.
 *
 * POR QUÉ EXISTE. La app completa ofrece todas las temporadas del canónico y todas las facetas que existen,
 * incluidas etiquetas heredadas del portal («sin determinar», niveles que solo aparecen en una competición
 * suelta). En una demo eso confunde: se pide una temporada y se ven huecos. La demo acota las opciones a lo que
 * enseña de verdad.
 *
 * No cambia ninguna consulta ni ningún dato: filtra la lista de opciones que pinta la interfaz. Si mañana la demo
 * quiere otra temporada, se cambia aquí.
 */
export const ES_DEMO = process.env.FACYLF_DEMO === '1';

/** La única temporada que enseña la demo pública. */
export const TEMPORADA_DEMO = '2026-27';

/** Etiquetas que un catálogo heredado arrastra y que no aportan nada en la demo. */
const ETIQUETAS_RARAS = /sin determinar|sin asignar|sin especificar|no consta|desconocid|^otros?$/i;

type Opcion = { valor: string; etiqueta: string };

/**
 * Filtra la lista de opciones de una faceta para la demo: fuera etiquetas raras y, en temporada, solo 2026-27.
 * En la app completa devuelve la lista tal cual (no toca nada).
 */
export function opcionesDeDemo<T extends Opcion>(dimension: string, opciones: readonly T[]): T[] {
  if (!ES_DEMO) return [...opciones];
  const limpias = opciones.filter((o) => !ETIQUETAS_RARAS.test(o.etiqueta) && !ETIQUETAS_RARAS.test(o.valor));
  if (dimension === 'temporada') return limpias.filter((o) => o.valor === TEMPORADA_DEMO);
  return limpias;
}

/** ¿Se ofrece esta opción en la demo? (para listas que no pasan por `opcionesDeDemo`). */
export function opcionVisibleEnDemo(etiqueta: string, valor = ''): boolean {
  if (!ES_DEMO) return true;
  return !ETIQUETAS_RARAS.test(etiqueta) && !ETIQUETAS_RARAS.test(valor);
}
