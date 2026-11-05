import Link from 'next/link';
import type { Route } from 'next';

/**
 * Estado de error del panel. Sin SQL, sin rutas internas y sin traza: el detalle se queda en el
 * registro del servidor. Se ofrece volver al inicio y se dice que no se ha podido cargar.
 */
export function FalloAdmin({ que }: { que: string }) {
  return (
    <div role="alert" className="border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-4">
      <h1 className="m-0 text-bloque font-bold text-[var(--texto)]">No se ha podido cargar {que}</h1>
      <p className="m-0 mt-1 text-tabla leading-6 text-[var(--texto-suave)]">
        El panel no recibe datos ahora mismo. Vuelve a intentarlo en un momento; si sigue igual, avisa
        a quien administra la plataforma.
      </p>
      <p className="m-0 mt-3">
        <Link href={'/admin' as Route}
          className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
