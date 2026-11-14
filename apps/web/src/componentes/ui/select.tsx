import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Desplegable nativo (no el Select de Radix).
 *
 * Decisión: en móvil el desplegable nativo es el que mejor se usa con una mano y el que
 * anuncian bien los lectores de pantalla; y el estado de los filtros vive en la URL, así
 * que no hace falta un popover controlado. Se viste con los tokens del sistema.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)] transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--accion)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
