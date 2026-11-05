import type { ReactNode } from 'react';

/**
 * Piezas compartidas de los dos bloques de `/entrar` (entrar y crear cuenta).
 *
 * El sistema de diseño prohíbe colores literales y tamaños sueltos, así que las clases de los
 * controles viven aquí una sola vez: los dos formularios no pueden acabar con dos alturas de campo,
 * dos bordes o dos focos distintos. El anillo de foco es el global de `tokens.css`; no se apaga ni se
 * sustituye por nada.
 *
 * Los controles miden 44 px de alto (objetivo táctil del prototipo) y los botones ocupan todo el ancho
 * de la tarjeta, que a 360 px de ventana son 272 px útiles: sin desplazamiento horizontal.
 */

/** Campo de texto con su etiqueta visible y, opcionalmente, una ayuda dentro de la misma etiqueta. */
export function Campo({ id, etiqueta, ayuda, children }: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-tabla font-semibold text-[var(--texto)]">
        {etiqueta}
        {ayuda && <span className="font-normal text-[var(--texto-suave)]"> {ayuda}</span>}
      </label>
      {children}
    </div>
  );
}

/** Control de texto del sistema: borde fuerte, 44 px y el foco global. */
export const CLASE_CONTROL =
  'h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-bloque text-[var(--texto)]';

/** Acción principal de cada bloque. */
export const CLASE_BOTON_PRIMARIO =
  'inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-sm font-bold text-[var(--texto-inverso)] hover:opacity-90';

/** Acción secundaria: misma altura, borde y fondo de tarjeta. */
export const CLASE_BOTON_SECUNDARIO =
  'inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-sm font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]';

/** Enlace dentro del texto, con altura táctil de 44 px aunque se lea como un enlace. */
export const CLASE_BOTON_ENLACE =
  'inline-flex min-h-11 items-center text-tabla font-semibold text-[var(--accion)] underline underline-offset-2 hover:opacity-80';
