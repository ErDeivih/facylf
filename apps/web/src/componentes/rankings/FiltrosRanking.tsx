import Link from 'next/link';
import type { Route } from 'next';
import type { FilaOpcionesEstadisticas } from '@/consultas/estadisticas';
import type { FilaEdicionRanking } from '@/consultas/rankings';
import type { FilaGrupoDeLaEdicion } from '@/consultas/competiciones';
import { MINIMOS_PARTIDOS, RUTA_RANKINGS, tieneFiltrosRanking, urlDeRanking, type FiltrosRanking } from '@/lib/rankings';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from '@/componentes/listados/controles';

/**
 * Filtros del ranking: federación, temporada, competición, grupo y mínimo de partidos.
 *
 * Es un formulario GET normal: no necesita JavaScript y el estado vive en la URL. La competición es un
 * desplegable de las ediciones que existen en esa federación y temporada; el grupo depende de la
 * competición elegida, así que hasta que no hay una el desplegable de grupo está desactivado (con su
 * explicación visible, no oculto).
 */
export function FiltrosRanking({ filtros, opciones, ediciones, grupos, porDefecto }: {
  filtros: FiltrosRanking;
  opciones: FilaOpcionesEstadisticas;
  ediciones: readonly FilaEdicionRanking[];
  grupos: readonly FilaGrupoDeLaEdicion[];
  porDefecto: FiltrosRanking;
}) {
  const federaciones = opciones.federaciones ?? [];
  const temporadas = opciones.temporadas ?? [];
  const hayFiltros = tieneFiltrosRanking(filtros, porDefecto);
  return (
    <form action={RUTA_RANKINGS} method="get" aria-label="Filtros del ranking"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto]`}>
      <input type="hidden" name="tipo" value={filtros.tipo} />
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Federación</span>
        <select name="fed" defaultValue={filtros.federacion ?? ''} className={CONTROL}>
          {federaciones.map((f) => (
            <option key={f.codigo} value={f.codigo}>{f.nombre_corto ?? f.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Temporada</span>
        <select name="temp" defaultValue={filtros.temporada ?? ''} className={CONTROL}>
          {temporadas.map((t) => <option key={t.etiqueta} value={t.etiqueta}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Competición</span>
        <select name="ed" defaultValue={filtros.edicion === null ? '' : String(filtros.edicion)}
          disabled={ediciones.length === 0} className={CONTROL}>
          <option value="">Todas las competiciones</option>
          {ediciones.map((e) => (
            <option key={e.edicion_id} value={String(e.edicion_id)}>{e.edicion}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Grupo</span>
        <select name="grupo" defaultValue={filtros.grupo === null ? '' : String(filtros.grupo)}
          disabled={filtros.edicion === null} className={CONTROL}>
          <option value="">{filtros.edicion === null ? 'Elige una competición' : 'Todos los grupos'}</option>
          {grupos.map((g) => <option key={g.grupo_id} value={String(g.grupo_id)}>{g.grupo}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Mínimo de partidos</span>
        <select name="min" defaultValue={String(filtros.minimoPartidos)} className={CONTROL}>
          {MINIMOS_PARTIDOS.map((m) => (
            <option key={m} value={String(m)}>{m === 0 ? 'Cualquiera' : `${m} partidos`}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
        <button type="submit" className={BOTON}>Ver</button>
        {hayFiltros && (
          <Link href={RUTA_RANKINGS as Route} className={ENLACE} aria-label="Quitar los filtros del ranking">
            Quitar
          </Link>
        )}
      </div>
      {filtros.edicion !== null && grupos.length === 0 && (
        <p className="m-0 text-nota text-[var(--texto-suave)] sm:col-span-2 lg:col-span-6">
          Esa competición no tiene grupos importados.
        </p>
      )}
    </form>
  );
}
