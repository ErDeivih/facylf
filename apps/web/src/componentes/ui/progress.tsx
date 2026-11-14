import { cn } from '@/lib/cn';

/**
 * Barra de progreso (shadcn) para una cobertura o un porcentaje ya calculado por el
 * servidor. Comunica con su `aria-label` y su valor numérico; el color no es la única
 * señal (al lado va el tanto por ciento en texto).
 */
export function Progress({
  valor,
  etiqueta,
  valorActual,
  valorMax,
  className,
}: {
  /** 0–100. Un valor desconocido no se pinta como 0: no se pasa. */
  valor: number;
  etiqueta: string;
  /** Si el consumidor conoce la escala real (p. ej. jornada 7 de 26), se anuncia esa, no el %. */
  valorActual?: number;
  valorMax?: number;
  className?: string;
}) {
  const acotado = Math.max(0, Math.min(100, valor));
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={valorMax ?? 100}
      aria-valuenow={valorActual ?? acotado}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--fondo-sutil)]', className)}
    >
      <div className="h-full rounded-full bg-[var(--accion)]" style={{ width: `${acotado}%` }} />
    </div>
  );
}
