import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Botón del sistema (shadcn): variantes semánticas y `asChild` para que un enlace
 * de Next se comporte como botón sin anidar interactivos.
 *
 * Reglas que cumple: 44 px de objetivo táctil por defecto, foco visible del token
 * `--foco`, `active:scale(0.97)` como respuesta al pulsado, y sólo `transform`,
 * `opacity`, color y borde en la transición (nada de `transition-all`).
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-tabla font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accion)] text-[var(--texto-inverso)] hover:bg-[var(--accion-fuerte)]',
        secondary:
          'border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]',
        outline:
          'border border-[var(--borde)] bg-transparent text-[var(--texto)] hover:bg-[var(--fondo-sutil)]',
        ghost: 'text-[var(--accion)] hover:bg-[var(--accion-suave)]',
        destructive: 'bg-[var(--derrota)] text-[var(--texto-inverso)] hover:opacity-90',
        enlace: 'h-auto min-h-0 rounded-none p-0 text-[var(--accion)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 px-3 text-nota',
        lg: 'h-12 px-6 text-cuerpo',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
