import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Aviso (shadcn). El tono no lo pone sólo el color: `role` cambia con la gravedad y el
 * texto dice qué pasa. `error` se anuncia como alerta; el resto, como estado.
 */
export const alertVariants = cva(
  'relative w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-tabla [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3',
  {
    variants: {
      variant: {
        info: 'border-[var(--borde)] bg-[var(--fondo-sutil)] text-[var(--texto)]',
        ok: 'border-[var(--victoria)] bg-[var(--fondo-elevado)] text-[var(--texto)]',
        aviso: 'border-[var(--amarilla)] bg-[var(--fondo-elevado)] text-[var(--texto)]',
        error: 'border-[var(--derrota)] bg-[var(--fondo-elevado)] text-[var(--texto)]',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('m-0 text-bloque font-bold text-[var(--texto)]', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('m-0 mt-1 text-tabla text-[var(--texto-suave)]', className)} {...props} />;
}
