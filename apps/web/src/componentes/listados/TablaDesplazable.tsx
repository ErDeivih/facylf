import type { ReactNode } from 'react';

/**
 * Caja con desplazamiento horizontal para una tabla densa.
 *
 * La tabla NO se convierte en tarjetas: se desplaza dentro de su caja, que es lo que pide
 * SISTEMA-DISENO para las pantallas de comparar filas. La caja es una región con nombre y **se puede
 * enfocar con el teclado** (`tabIndex`): si no, axe marca `scrollable-region-focusable` y quien navega
 * con teclado no puede llegar a las columnas de la derecha.
 */
export function TablaDesplazable({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={etiqueta}
      tabIndex={0}
      data-tabla-scroll=""
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--foco)]"
    >
      {children}
    </div>
  );
}
