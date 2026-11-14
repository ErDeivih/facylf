import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Insignia (shadcn). Nunca comunica sólo con color: el texto va siempre dentro.
 * Los tonos salen de los roles de resultado y calidad del sistema, no de una paleta aparte.
 */
export const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-etiqueta font-semibold',
  {
    variants: {
      variant: {
        default: 'border-[var(--borde)] bg-[var(--fondo-sutil)] text-[var(--texto-suave)]',
        ok: 'border-[var(--victoria)] bg-[var(--fondo-elevado)] text-[var(--victoria)]',
        ko: 'border-[var(--derrota)] bg-[var(--fondo-elevado)] text-[var(--derrota)]',
        aviso: 'border-[var(--amarilla)] bg-[var(--fondo-elevado)] text-[var(--amarilla)]',
        info: 'border-[var(--accion)] bg-[var(--accion-suave)] text-[var(--accion)]',
        contorno: 'border-[var(--borde-fuerte)] bg-transparent text-[var(--texto)] normal-case tracking-normal',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
