/**
 * Adaptador de la capa heredada (segunda tanda de UI, 13/11/2026).
 *
 * Las pantallas antiguas se escribieron con clases sueltas (`boton-primario`, `control-filtro`,
 * `insignia`, `subnav`, `etiqueta-filtro`) definidas en `globals.css`. En vez de reescribir su JSX
 * —y arriesgar la lógica y las pruebas— se sustituye el VALOR de esas clases por el de la capa
 * `componentes/ui`: mismo botón, mismo campo, misma insignia y mismo foco que las pantallas nuevas.
 *
 * Así una pantalla heredada queda migrada en dos pasos sin tocar su comportamiento:
 *   `className="boton-primario"` → `className={BOTON_PRIMARIO}`
 *
 * Las clases de `globals.css` se conservan como red de seguridad para cualquier uso dinámico que no se
 * haya podido sustituir, y también apuntan a los mismos tokens.
 */
import { cn } from '@/lib/cn';
import { buttonVariants } from './button';

/** Botón de acción principal: alto 44 px, acento del producto y anillo de foco del sistema. */
// `h-auto min-h-11 whitespace-normal`: en las pantallas antiguas el botón también es un enlace con
// nombre largo («Explorar Real Federación…»). Con `whitespace-nowrap` el texto forzaba el ancho de la
// tarjeta y la página se desplazaba en horizontal a 390 px (medido en /federaciones).
export const BOTON_PRIMARIO = cn(buttonVariants({ variant: 'default' }), 'h-auto min-h-11 whitespace-normal text-center');

/** Botón de acción secundaria: borde fuerte, fondo elevado y hover con acento. */
export const BOTON_SECUNDARIO = cn(buttonVariants({ variant: 'secondary' }), 'h-auto min-h-11 whitespace-normal text-center');

/** Campo de formulario: alto 44 px, borde fuerte y foco visible. */
export const CONTROL_FILTRO =
  'flex h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)] transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--accion)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] disabled:cursor-not-allowed disabled:opacity-70';

/** Etiqueta de campo: caja baja, 12 px, sin versalitas con tracking. */
export const ETIQUETA_FILTRO = 'block text-nota font-semibold text-[var(--texto-suave)]';

/** Insignia neutra del sistema. El color nunca va solo: siempre lleva texto. */
export const INSIGNIA =
  'inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-etiqueta font-semibold text-[var(--texto-suave)]';

/** Insignia de resultado negativo / pérdida. */
export const INSIGNIA_ROJA = `${INSIGNIA} border-[var(--derrota)] text-[var(--derrota)]`;

/** Insignia de resultado positivo / victoria. */
export const INSIGNIA_VERDE = `${INSIGNIA} border-[var(--victoria)] text-[var(--victoria)]`;

/** Barra de pestañas heredada: enlaces con subrayado de la activa y desplazamiento interno. */
export const SUBNAV =
  'flex gap-1 overflow-x-auto border border-[var(--borde)] bg-[var(--fondo-elevado)] p-1 [scrollbar-width:thin]';

/** Tarjeta del sistema (misma superficie que `Card`). */
export const TARJETA =
  'overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
