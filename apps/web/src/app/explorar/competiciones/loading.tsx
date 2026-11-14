import { EstadoCargando, Skeleton, SkeletonFilas } from '@/componentes/ui';

/** Carga del listado: el hueco de los filtros y de las filas, sin spinner que desplace la página. */
export default function CargandoCompeticiones() {
  return (
    <EstadoCargando etiqueta="Cargando competiciones…">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-[92px]" />
        <div className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <SkeletonFilas filas={8} columnas={2} />
        </div>
      </div>
    </EstadoCargando>
  );
}
