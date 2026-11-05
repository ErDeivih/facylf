/**
 * Clases compartidas de los controles del calendario.
 *
 * Viven en un sitio para que los dos formularios (global y de grupo) midan igual: 44 px de alto, radio
 * de control y borde fuerte. Los colores son siempre tokens del sistema de diseño.
 */
export const TARJETA = 'overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
export const CONTROL = 'h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)]';
export const ETIQUETA = 'text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]';
export const BOTON = 'h-11 rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)]';
export const ENLACE = 'inline-flex min-h-11 items-center px-2 text-tabla font-semibold text-[var(--accion)] hover:underline';
export const ENLACE_APAGADO = 'inline-flex min-h-11 cursor-not-allowed items-center px-2 text-tabla font-semibold text-[var(--texto-suave)]';
