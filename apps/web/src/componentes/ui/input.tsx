import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Campo de texto (shadcn) con el alto táctil y el borde del sistema. El anillo de foco
 * es el token `--foco`; nunca se quita el outline sin sustituto.
 */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-2.5 text-tabla font-medium text-[var(--texto)] placeholder:text-[var(--texto-tenue)] transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--accion)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
