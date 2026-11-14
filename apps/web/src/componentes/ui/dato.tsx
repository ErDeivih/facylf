import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Cifra con su etiqueta, en una pastilla (`Badge` no sirve: aquí el valor manda y va en negrita).
 * Se usa para los indicadores de una ficha; el texto de la etiqueta y el número van siempre juntos,
 * así que la cifra nunca aparece suelta.
 */
export function Dato({ etiqueta, children, className }: {
  etiqueta: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-2 py-1 text-nota text-[var(--texto)]', className)}>
      <span className="text-[var(--texto-suave)]">{etiqueta}</span>
      <strong className="tabular-nums">{children}</strong>
    </span>
  );
}
