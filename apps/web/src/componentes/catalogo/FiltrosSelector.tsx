import Link from 'next/link';
import type { Route } from 'next';
import type { EstadoSelector, OpcionesSelector, OpcionSelector } from '@/lib/selector-competiciones';
import { RUTA_SELECTOR, tieneFiltrosSelector } from '@/lib/selector-competiciones';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from './controles';

/**
 * Filtros del selector de temporada y competición.
 *
 * Es un formulario GET normal: no necesita JavaScript y el estado vive en la URL, así que una búsqueda
 * se puede compartir y recargar. Los desplegables ofrecen **sólo los valores que existen hoy** en el
 * catálogo (los trae `OPCIONES_DEL_SELECTOR`); no hay listas escritas a mano.
 *
 * La caja de texto acepta una competición, un grupo o una temporada escritos de forma natural
 * («Segunda Juvenil 2017, Burgos»). Lo que se deduce de ella —por ejemplo la temporada del año— se
 * aplica y se enseña en su desplegable, para que el usuario vea lo que se está filtrando.
 */
export function FiltrosSelector({ estado, opciones }: {
  estado: EstadoSelector;
  opciones: OpcionesSelector;
}) {
  const { filtros } = estado;
  return (
    <form action={RUTA_SELECTOR} method="get" aria-label="Filtros de competiciones"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-4`}>
      <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
        <span className={ETIQUETA}>Competición, grupo o temporada</span>
        <input type="search" name="q" defaultValue={filtros.texto ?? ''}
          placeholder="Segunda Juvenil 2017, Burgos" className={CONTROL} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Federación</span>
        <select name="fed" defaultValue={filtros.federacion ?? ''} className={CONTROL}>
          <option value="">Todas las federaciones</option>
          {opciones.federaciones.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Temporada</span>
        <select name="temp" defaultValue={filtros.temporada ?? ''} className={CONTROL}>
          <option value="">Todas las temporadas</option>
          {opciones.temporadas.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Categoría</span>
        <select name="cat" defaultValue={filtros.categoria ?? ''} className={CONTROL}>
          <option value="">Todas las categorías</option>
          {opciones.categorias.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Modalidad</span>
        <select name="mod" defaultValue={filtros.modalidad ?? ''} className={CONTROL}>
          <option value="">Todas las modalidades</option>
          {opciones.modalidades.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Género</span>
        <select name="gen" defaultValue={filtros.genero ?? ''} className={CONTROL}>
          <option value="">Todos los géneros</option>
          {opciones.generos.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Provincia</span>
        <select name="prov" defaultValue={filtros.provincia ?? ''} className={CONTROL}>
          <option value="">Todas las provincias</option>
          {opciones.provincias.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Nivel</span>
        <select name="nivel" defaultValue={filtros.nivel === null ? '' : String(filtros.nivel)} className={CONTROL}>
          <option value="">Todos los niveles</option>
          {opciones.niveles.map((o: OpcionSelector) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3 lg:justify-end">
        <button type="submit" className={BOTON}>Buscar</button>
        {tieneFiltrosSelector(filtros) && (
          <Link href={RUTA_SELECTOR as Route} className={ENLACE}>Quitar filtros</Link>
        )}
      </div>
    </form>
  );
}
