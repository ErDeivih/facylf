import { EstadoCargando, Skeleton, SkeletonFilas } from '@/componentes/ui';

/** Carga del panel: ocupa el sitio del resumen y de las filas reales, sin spinner que desplace. */
export default function CargandoCalidad() {
  return (
    <EstadoCargando etiqueta="Cargando la calidad de los grupos…">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-72" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[72px]" />)}
        </div>
        <Skeleton className="h-[60px]" />
        <div className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <SkeletonFilas filas={10} columnas={5} />
        </div>
      </div>
    </EstadoCargando>
  );
}
