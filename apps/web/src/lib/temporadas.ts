/**
 * Ventana de temporadas que enseña la web.
 *
 * La recolección se limita desde el 14/9/2026 a **2023-24 en adelante** (`scripts/lib/temporada-minima.mjs`)
 * para poder terminar antes la ingesta. La web tiene que contar lo mismo que se recoge: si el portal
 * sigue enseñando 2015-16 mientras los recolectores ya no van a por esas temporadas, el visitante ve
 * un catálogo enorme en el que casi todo está a medias para siempre.
 *
 * Las temporadas anteriores NO se borran ni se ocultan por avería: están recopiladas y aplazadas para
 * cuando se retome el histórico. Por eso la web lo dice con palabras en el pie, en vez de desaparecer
 * sin explicación.
 *
 * Se compara por ETIQUETA (`temporadas.etiqueta`, `AAAA-AA`) y nunca por código: en La Rioja el código
 * 9 es 2013-14 y en Andalucía el 19 es 2023-24.
 */

const POR_DEFECTO = '2023-24';

/** Etiquetas con la forma `AAAA-AA`. Cualquier otra cosa se ignora y se usa la de por defecto. */
function etiquetaValida(valor: string | undefined): string {
  return valor && /^\d{4}-\d{2}$/.test(valor) ? valor : POR_DEFECTO;
}

export const TEMPORADA_MINIMA = etiquetaValida(process.env.FACYLF_TEMPORADA_MINIMA);

/**
 * Filtro SQL para dejar fuera las temporadas anteriores a la ventana. `alias` es el alias de la tabla
 * que tiene la columna `temporada` (grupos, partidos, actas, participaciones…).
 *
 * La etiqueta está validada arriba, así que interpolarla no puede meter nada raro en la consulta.
 */
export function filtroVentana(alias: string): string {
  return `${alias}.temporada in (select codigo from temporadas where etiqueta >= '${TEMPORADA_MINIMA}')`;
}

/** ¿Esta temporada entra en la ventana que enseña la web? Se usa cuando no hay SQL de por medio. */
export function enVentana(etiqueta: string | null | undefined): boolean {
  if (!etiqueta) return false;
  return etiqueta >= TEMPORADA_MINIMA;
}
