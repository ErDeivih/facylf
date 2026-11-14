import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Casilla (nativa). No se usa la Checkbox de Radix a propósito: la casilla nativa es la que
 * funciona sin JavaScript —la foto estática publicada es HTML puro— y la que mejor anuncian los
 * lectores de pantalla en un formulario GET. Se marca el cuadrado con el acento del sistema y se
 * deja el área táctil en la `<label>` que la envuelve (44 px).
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'checkbox', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'size-5 flex-none cursor-pointer rounded-[var(--radius-sm)] border border-[var(--borde-fuerte)] accent-[var(--accion)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fondo)]',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
