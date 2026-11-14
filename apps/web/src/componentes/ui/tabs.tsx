import Link from 'next/link';
import type { Route } from 'next';
import { cn } from '@/lib/cn';

export type Pestana = { etiqueta: string; href?: string; activa: boolean };

/**
 * Navegación por pestañas del detalle (shadcn «tabs», pero con enlaces).
 *
 * No se usa el Tabs de Radix a propósito: el estado vive en la URL (regla del producto),
 * así que cada pestaña es una página cargable, compartible y con su historial. La barra se
 * desplaza en horizontal dentro de sí misma y marca la activa con borde, no sólo con color.
 */
export function TabsNav({ pestanas, etiqueta = 'Secciones de la competición', className }: {
  pestanas: readonly Pestana[];
  etiqueta?: string;
  className?: string;
}) {
  return (
    <nav aria-label={etiqueta} className={cn('relative -mx-1', className)}>
      <ul data-tabs-scroll className="m-0 flex list-none items-stretch gap-1 overflow-x-auto px-1 pb-0">
        {pestanas.map((p) => (
          <li key={p.etiqueta} className="flex">
            {p.href === undefined ? (
              <span aria-disabled="true"
                className="inline-flex min-h-11 cursor-not-allowed items-center whitespace-nowrap border-b-2 border-transparent px-3 text-tabla font-medium text-[var(--texto-suave)]">
                {p.etiqueta}
              </span>
            ) : (
              <Link
                href={p.href as Route}
                aria-current={p.activa ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-tabla font-semibold transition-colors duration-150 focus-visible:[outline-offset:-2px]',
                  p.activa
                    ? 'border-[var(--accion)] text-[var(--accion)]'
                    : 'border-transparent text-[var(--texto-suave)] hover:border-[var(--borde-fuerte)] hover:text-[var(--texto)]',
                )}
              >
                {p.etiqueta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
