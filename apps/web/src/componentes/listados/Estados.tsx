import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { BOTON_SECUNDARIO, TARJETA } from './controles';

/**
 * Estado vacío de un listado: una frase que dice qué pasa y, si hay filtros, la salida.
 *
 * No se pinta una tabla vacía ni un «0 resultados» seco: se explica y se deja quitar el filtro. Sin
 * textos internos (nada de SQL, tablas ni nombres de endpoints).
 */
export function SinResultados({ titulo, quitarHref, children }: {
  titulo: string;
  quitarHref?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className={`${TARJETA} px-4 py-5`}>
      <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      {children && <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{children}</p>}
      {quitarHref && (
        <p className="m-0 mt-3">
          <Link href={quitarHref as Route} className={BOTON_SECUNDARIO}>
            Quitar los filtros
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * Esqueleto de carga con las dimensiones de la tabla real (SISTEMA-DISENO §5): la fila mide lo mismo
 * que un resultado y no hay spinner que desplace la página al resolverse.
 */
export function EsqueletoTabla({ filas = 8 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite" className={TARJETA}>
      <span className="sr-only">Cargando el listado…</span>
      <div className="px-4 py-3">
        <div className={`h-5 w-48 ${bloque}`} />
      </div>
      {Array.from({ length: Math.max(1, filas) }, (_, i) => (
        <div key={i} data-esqueleto="fila"
          className="flex min-h-[52px] items-center gap-3 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
          <div className={`size-5 ${bloque}`} />
          <div className={`h-4 flex-1 ${bloque}`} />
          <div className={`h-5 w-12 ${bloque}`} />
        </div>
      ))}
    </div>
  );
}
