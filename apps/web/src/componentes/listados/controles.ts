/**
 * Clases compartidas de las pantallas de listado (Rankings y Ojeo).
 *
 * Viven en un solo sitio para que los dos formularios, las tablas y los estados midan igual: 44 px de
 * objetivo táctil, radio de control y borde fuerte. Colores siempre con tokens del sistema.
 */
export const TARJETA = 'overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
export const CONTROL = 'h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)] disabled:cursor-not-allowed disabled:opacity-70';
export const ETIQUETA = 'text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]';
export const BOTON = 'h-11 rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)]';
export const ENLACE = 'inline-flex min-h-11 items-center px-2 text-tabla font-semibold text-[var(--accion)] hover:underline';
export const BOTON_SECUNDARIO = 'inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]';
export const INSIGNIA = 'inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-etiqueta font-semibold uppercase tracking-[0.04em] text-[var(--texto-suave)]';
/** Tabla densa del prototipo: cabecera en versalita y cifras con `tabular-nums` (viene de tokens.css). */
export const TABLA = 'w-full border-collapse text-tabla text-[var(--texto)]';
export const TH = 'whitespace-nowrap px-2 py-2.5 text-left text-etiqueta font-semibold uppercase tracking-[0.05em] text-[var(--texto-suave)]';
export const TH_NUM = `${TH} text-right`;
export const TD = 'px-2 py-2.5 align-middle';
export const TD_NUM = `${TD} whitespace-nowrap text-right tabular-nums`;
