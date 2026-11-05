import type { ReactNode } from 'react';
import { TARJETA } from './controles';

/** Estado vacío del calendario: una frase y, si hay filtros, la salida. Nunca una tarjeta vacía. */
export function SinPartidos({ children }: { children: ReactNode }) {
  return (
    <div className={`${TARJETA} px-4 py-4`}>
      <p className="m-0 text-cuerpo text-[var(--texto-suave)]">{children}</p>
    </div>
  );
}

/**
 * Esqueleto del calendario con las mismas dimensiones que la lista real (SISTEMA-DISENO §5): la fila
 * mide lo mismo que un partido y no hay spinner que desplace la página al resolverse.
 */
export function EsqueletoCalendario({ filas = 6 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite" className={TARJETA}>
      <span className="sr-only">Cargando el calendario…</span>
      <div className="px-4 py-3"><div className={`h-5 w-32 ${bloque}`} /></div>
      {Array.from({ length: Math.max(1, filas) }, (_, i) => (
        <div key={i} data-esqueleto="partido"
          className="flex min-h-11 items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-3.5 py-2.5">
          <div className={`h-4 flex-1 ${bloque}`} />
          <div className={`h-5 w-14 ${bloque}`} />
          <div className={`h-4 flex-1 ${bloque}`} />
        </div>
      ))}
    </div>
  );
}
