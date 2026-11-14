import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Tarjeta (shadcn): la superficie de contenido del producto.
 *
 * Plana por defecto —borde, sin sombra— porque DESIGN.md §11 reserva la sombra para
 * lo que flota sobre el contenido. `interactiva` añade el estado de hover de una fila
 * enlazada; nunca se usa para «destacar» una tarjeta en flujo.
 */
export function Card({ className, interactiva = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { interactiva?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] text-[var(--texto)]',
        interactiva && 'transition-colors duration-150 hover:border-[var(--borde-fuerte)] hover:bg-[var(--fondo-sutil)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 px-4 pt-4', className)} {...props} />;
}

export function CardTitle({ className, as: Etiqueta = 'h2', ...props }: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' | 'h3' }) {
  return <Etiqueta className={cn('m-0 text-bloque font-bold leading-tight text-[var(--texto)]', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('m-0 text-nota text-[var(--texto-suave)]', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2 px-4 pb-4', className)} {...props} />;
}
