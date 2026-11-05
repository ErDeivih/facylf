/**
 * Clases compartidas de los controles del selector de competiciones.
 *
 * Viven en un sitio para que el formulario, las insignias y los chips midan igual: 44 px de objetivo
 * táctil, radio de control y borde fuerte. Los colores son siempre tokens del sistema de diseño.
 */
export const TARJETA = 'overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
export const CONTROL = 'h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)]';
export const ETIQUETA = 'text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]';
export const BOTON = 'h-11 rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)]';
export const BOTON_SECUNDARIO = 'inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)]';
export const ENLACE = 'inline-flex min-h-11 items-center px-2 text-tabla font-semibold text-[var(--accion)] hover:underline';
export const INSIGNIA = 'inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-etiqueta font-semibold uppercase tracking-[0.04em] text-[var(--texto-suave)]';
export const CHIP = 'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-nota font-semibold text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]';
