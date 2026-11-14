/**
 * Formatos numéricos del producto, siempre por el formateador del idioma.
 *
 * `Intl.NumberFormat` evita el `toFixed().replace('.', ',')` repartido por las pantallas: el
 * separador decimal, los miles y el redondeo son los del español, no los de la máquina.
 */
const DOS_DECIMALES = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ENTERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** «4,85» — media de goles por partido, con dos decimales. */
export function decimal2(valor: number): string {
  return DOS_DECIMALES.format(valor);
}

/** «249» — un recuento sin decimales. */
export function entero(valor: number): string {
  return ENTERO.format(valor);
}
