import Link from 'next/link';
import type { Route } from 'next';
import type { FilaOpcionesEstadisticas } from '@/consultas/estadisticas';
import {
  RUTA_ESTADISTICAS, tieneFiltrosEstadisticas, urlDeEstadisticas, type FiltrosEstadisticas,
} from '@/lib/estadisticas';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from './controles';

/**
 * Filtros de la página global de estadísticas: federación, temporada y búsqueda de competición.
 *
 * Es un formulario GET normal: el estado vive en la URL y no necesita JavaScript. La búsqueda de
 * competición no filtra las cifras de la federación: sirve para saltar a las estadísticas de un grupo
 * concreto; por eso se rotula «Buscar competición».
 */
export function FiltrosEstadisticas({ filtros, opciones, federacion, temporada }: {
  filtros: FiltrosEstadisticas;
  opciones: FilaOpcionesEstadisticas;
  federacion: string | null;
  temporada: string | null;
}) {
  const federaciones = opciones.federaciones ?? [];
  const temporadas = opciones.temporadas ?? [];
  const hayFiltros = tieneFiltrosEstadisticas(filtros);
  const urlSelector = `/explorar/competiciones?fed=${encodeURIComponent(federacion ?? '')}&temp=${encodeURIComponent(temporada ?? '')}`;
  return (
    <form action={RUTA_ESTADISTICAS} method="get" aria-label="Filtros de estadísticas"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]`}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Federación</span>
        <select name="fed" defaultValue={federacion ?? ''} className={CONTROL}>
          {federaciones.map((f) => (
            <option key={f.codigo} value={f.codigo}>{f.nombre_corto ?? f.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Temporada</span>
        <select name="temp" defaultValue={temporada ?? ''} className={CONTROL}>
          {temporadas.map((t) => <option key={t.etiqueta} value={t.etiqueta}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Buscar competición</span>
        <input type="search" name="q" placeholder="Liga Nacional, Burgos…" defaultValue={filtros.texto ?? ''} className={CONTROL} />
      </label>
      <div className="flex items-center gap-1 lg:justify-end">
        <button type="submit" className={BOTON}>Ver</button>
        {hayFiltros && (
          <Link href={RUTA_ESTADISTICAS as Route} className={ENLACE} aria-label="Quitar los filtros">
            Quitar
          </Link>
        )}
      </div>
      <p className="m-0 text-nota text-[var(--texto-suave)] sm:col-span-2 lg:col-span-4">
        <Link href={urlSelector as Route} className="font-semibold text-[var(--accion)] hover:underline">
          Ver todas las competiciones de esta federación y temporada
        </Link>
      </p>
    </form>
  );
}
