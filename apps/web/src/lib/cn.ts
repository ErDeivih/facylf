import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — la utilidad de shadcn: une clases condicionales y resuelve los conflictos de
 * Tailwind quedándose con la última (`p-4` + `px-2` → `p-4 px-2`).
 *
 * Los componentes de `componentes/ui` la usan para que una pantalla pueda ajustar el
 * tamaño de un botón o el relleno de una tarjeta sin pelearse con la clase base.
 */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
