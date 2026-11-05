import Link from 'next/link';
import type { Route } from 'next';
import type { FilaOpcionesEstadisticas } from '@/consultas/estadisticas';
import {
  MINUTOS_OJEO, POSICIONES_OJEO, RUTA_OJEO, etiquetasDeEdad, tieneFiltrosOjeo, urlDeOjeo,
  type FiltrosOjeo as FiltrosOjeo_Tipo,
} from '@/lib/rankings';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from '@/componentes/listados/controles';

/**
 * Filtros del buscador de talento: federación, temporada, categoría, edad, minutos y posición.
 *
 * Formulario GET normal, sin JavaScript: el estado vive en la URL. La edad se ofrece con el año que
 * le corresponde en la temporada elegida («Sub-19 (2008 o después)»), calculado, no escrito a mano.
 * La posición de campo no la publican todas las federaciones: si algún filtro no devuelve resultados,
 * la pantalla lo dice (aquí no se desactiva un filtro que a veces sí tiene datos).
 */
export function FiltrosOjeo({ filtros, opciones, categorias, porDefecto }: {
  filtros: FiltrosOjeo_Tipo;
  opciones: FilaOpcionesEstadisticas;
  categorias: readonly string[];
  porDefecto: FiltrosOjeo_Tipo;
}) {
  const federaciones = opciones.federaciones ?? [];
  const temporadas = opciones.temporadas ?? [];
  const edades = etiquetasDeEdad(filtros.temporada);
  const hayFiltros = tieneFiltrosOjeo(filtros, porDefecto);
  return (
    <form action={RUTA_OJEO} method="get" aria-label="Filtros de ojeo"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3`}>
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
        <span className={ETIQUETA}>Categoría</span>
        <select name="cat" defaultValue={filtros.categoria ?? ''} className={CONTROL}>
          <option value="">Todas las categorías</option>
          {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Edad</span>
        <select name="edad" defaultValue={filtros.edad === null ? '' : String(filtros.edad)} className={CONTROL}>
          <option value="">Cualquier edad</option>
          {edades.map((edad) => <option key={edad.valor} value={edad.valor}>{edad.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Minutos mínimos</span>
        <select name="min" defaultValue={String(filtros.minutos)} className={CONTROL}>
          {MINUTOS_OJEO.map((minutos) => (
            <option key={minutos} value={String(minutos)}>
              {minutos === 0 ? 'Cualquiera' : `${minutos} minutos`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Posición</span>
        <select name="pos" defaultValue={filtros.posicion} className={CONTROL}>
          {POSICIONES_OJEO.map((posicion) => (
            <option key={posicion.valor} value={posicion.valor}>{posicion.etiqueta}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3 lg:justify-end">
        <button type="submit" className={BOTON}>Ver</button>
        {hayFiltros && (
          <Link href={RUTA_OJEO as Route} className={ENLACE} aria-label="Quitar los filtros del ojeo">
            Quitar
          </Link>
        )}
      </div>
    </form>
  );
}
