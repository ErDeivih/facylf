import Link from 'next/link';
import type { Route } from 'next';
import type { FilaOpcionesCalendario } from '@/consultas/calendario';
import {
  RUTA_CALENDARIO_GLOBAL, tieneFiltrosGlobales, urlDeCalendarioGlobal,
} from '@/lib/calendario';
import type { FiltrosCalendarioGlobal as FiltrosGlobales } from '@/lib/calendario';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from './controles';

/**
 * Filtros del calendario global: federación, temporada, jornada, rango de fechas y texto.
 *
 * Es un formulario GET normal: no necesita JavaScript y el estado vive en la URL, así que una búsqueda
 * se puede compartir y recargar. La temporada se enseña siempre (con la más reciente por defecto): sin
 * temporada el conjunto de partidos de una federación crece demasiado.
 */
export function FiltrosCalendarioGlobal({ filtros, opciones, temporada, temporadaPorDefecto }: {
  filtros: FiltrosGlobales;
  opciones: FilaOpcionesCalendario;
  /** Temporada efectiva cuando la URL no pide una: la más reciente publicada. */
  temporada: string | null;
  /** Temporada que se enseña si no se filtra. Sirve para saber si la elegida es distinta. */
  temporadaPorDefecto: string | null;
}) {
  const federaciones = opciones.federaciones ?? [];
  const temporadas = opciones.temporadas ?? [];
  const hayFiltros = tieneFiltrosGlobales(filtros)
    || (filtros.temporada !== null && filtros.temporada !== temporadaPorDefecto);
  return (
    <form action={RUTA_CALENDARIO_GLOBAL} method="get" aria-label="Filtros del calendario"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-6`}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Federación</span>
        <select name="fed" defaultValue={filtros.federacion ?? ''} className={CONTROL}>
          <option value="">Todas</option>
          {federaciones.map((f) => (
            <option key={f.codigo} value={f.codigo}>{f.nombre_corto ?? f.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Temporada</span>
        <select name="temp" defaultValue={filtros.temporada ?? temporada ?? ''} className={CONTROL}>
          {temporadas.map((t) => <option key={t.etiqueta} value={t.etiqueta}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Jornada</span>
        <input name="j" inputMode="numeric" placeholder="Todas" defaultValue={filtros.jornada ?? ''} className={CONTROL} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Desde</span>
        <input type="date" name="desde" defaultValue={filtros.desde ?? ''} className={CONTROL} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Hasta</span>
        <input type="date" name="hasta" defaultValue={filtros.hasta ?? ''} className={CONTROL} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-3">
        <span className={ETIQUETA}>Equipo o competición</span>
        <input type="search" name="q" placeholder="Burgos, Liga Nacional…" defaultValue={filtros.texto ?? ''} className={CONTROL} />
      </label>
      <div className="flex items-center gap-1 sm:col-span-2 lg:col-span-3 lg:justify-end">
        <button type="submit" className={BOTON}>Filtrar</button>
        {hayFiltros && (
          <Link href={RUTA_CALENDARIO_GLOBAL as Route} className={ENLACE}
            aria-label="Quitar todos los filtros del calendario">
            Quitar
          </Link>
        )}
        {hayFiltros && filtros.desplazamiento > 0 && (
          <Link href={urlDeCalendarioGlobal(filtros, { desplazamiento: 0 }) as Route} className={ENLACE}>
            Primera página
          </Link>
        )}
      </div>
    </form>
  );
}
