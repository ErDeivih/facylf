import type { ReactNode } from 'react';
import { TARJETA } from './controles';

/** Estado vacío de una sección de estadísticas: frase clara, sin tarjeta vacía ni tabla en blanco. */
export function SinDatos({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby="sin-datos" className={`${TARJETA} px-4 py-4`}>
      <h2 id="sin-datos" className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{children}</p>
    </section>
  );
}

/**
 * Esqueleto de carga con las dimensiones del contenido (SISTEMA-DISENO §5): filas de cifras, un bloque
 * de gráfico y una lista. Sin spinner, para que la página no salte al resolverse.
 */
export function EsqueletoEstadisticas({ filas = 6 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-[18px]">
      <span className="sr-only">Cargando las estadísticas…</span>
      <div className={`${TARJETA} grid gap-2 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-4`}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[var(--radius-lg)] bg-[var(--fondo-sutil)] px-3 py-2.5">
            <div className={`h-3 w-20 ${bloque}`} />
            <div className={`mt-2 h-7 w-16 ${bloque}`} />
          </div>
        ))}
      </div>
      <div className={`${TARJETA} px-4 py-3.5`}>
        <div className={`h-5 w-52 ${bloque}`} />
        <div className={`mt-2 h-3 w-40 ${bloque}`} />
        <div className={`mt-3 h-40 w-full ${bloque}`} />
      </div>
      <div className={TARJETA}>
        <div className="px-4 py-3.5"><div className={`h-5 w-32 ${bloque}`} /></div>
        {Array.from({ length: Math.max(1, filas) }, (_, i) => (
          <div key={i} data-esqueleto="fila"
            className="flex min-h-11 items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
            <div className={`size-4 ${bloque}`} />
            <div className={`h-4 flex-1 ${bloque}`} />
            <div className={`h-4 w-10 ${bloque}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
