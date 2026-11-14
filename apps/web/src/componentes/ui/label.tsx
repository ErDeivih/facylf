import * as React from 'react';
import { cn } from '@/lib/cn';

/** Etiqueta de campo: texto de interfaz, corta, en caja baja y legible (sin «eyebrows»). */
export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-nota font-semibold text-[var(--texto-suave)]', className)} {...props} />
  ),
);
Label.displayName = 'Label';
