import type { ReactNode } from 'react';
import { Card } from './card';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { cn } from '@/lib/cn';

/**
 * Estados de pantalla, una sola vez para todo el producto (encargo de UI, paso 5).
 *
 * - `EstadoVacio`: dice qué pasa y deja la salida (quitar filtros, volver al principio).
 *   Nunca una tabla vacía ni un «0 resultados» seco.
 * - `EstadoError`: qué falla, sin textos internos (ni SQL, ni nombres de tabla), y una
 *   acción para reintentar.
 * - `EstadoCargando`: región `status` con el esqueleto que ocupa el sitio real.
 */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('px-4 py-6', className)}>
      <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      {descripcion && <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">{descripcion}</p>}
      {accion && <div className="mt-4 flex flex-wrap items-center gap-2">{accion}</div>}
    </Card>
  );
}

export function EstadoError({
  titulo,
  descripcion,
  accion,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <Alert variant="error" className={cn('px-4 py-4', className)}>
      <AlertTitle>{titulo}</AlertTitle>
      {descripcion && <AlertDescription>{descripcion}</AlertDescription>}
      {accion && <div className="mt-3 flex flex-wrap items-center gap-2">{accion}</div>}
    </Alert>
  );
}

export function EstadoCargando({ children, etiqueta = 'Cargando…' }: { children: ReactNode; etiqueta?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{etiqueta}</span>
      {children}
    </div>
  );
}
