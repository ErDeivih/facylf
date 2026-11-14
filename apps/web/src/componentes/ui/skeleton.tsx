import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Esqueleto de carga: ocupa el sitio real del contenido para que la página no salte al
 * llegar los datos. Es decorativo (`aria-hidden`) y el aviso accesible va en el contenedor
 * con `role="status"`. `prefers-reduced-motion` lo detiene (regla global de tokens.css).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]', className)} {...props} />;
}

/** Bloque de filas esqueleto con las dimensiones de una tabla real. */
export function SkeletonFilas({ filas = 6, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: Math.max(1, filas) }, (_, i) => (
        <div key={i} className="flex min-h-[44px] items-center gap-3 border-b border-[var(--fondo-sutil)] px-4 py-2.5 last:border-b-0">
          {Array.from({ length: Math.max(1, columnas) }, (_, j) => (
            <Skeleton key={j} className={j === 0 ? 'h-4 flex-1' : 'h-4 w-12'} />
          ))}
        </div>
      ))}
    </div>
  );
}
