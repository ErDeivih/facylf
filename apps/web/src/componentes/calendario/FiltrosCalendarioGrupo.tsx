import Link from 'next/link';
import type { Route } from 'next';
import {
  rutaDeCalendario, tieneFiltrosDeGrupo, urlDeCalendarioGrupo,
} from '@/lib/calendario';
import type { FiltrosCalendarioGrupo as FiltrosDeGrupo } from '@/lib/calendario';
import { BOTON, CONTROL, ENLACE, ETIQUETA, TARJETA } from './controles';

/**
 * Filtros del calendario de un grupo: jornada, equipo y estado.
 *
 * Las opciones salen de los partidos del propio grupo (jornadas y equipos que existen de verdad), no
 * de una lista escrita a mano. Es un formulario GET: el estado vive en la URL y no hace falta JS.
 */
export function FiltrosCalendarioGrupo({ grupoId, filtros, jornadas, equipos }: {
  grupoId: number;
  filtros: FiltrosDeGrupo;
  jornadas: readonly number[];
  equipos: ReadonlyArray<{ id: number; nombre: string }>;
}) {
  const hayFiltros = tieneFiltrosDeGrupo(filtros);
  return (
    <form action={rutaDeCalendario(grupoId)} method="get" aria-label="Filtros del calendario"
      className={`${TARJETA} grid gap-3 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]`}>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Jornada</span>
        <select name="j" defaultValue={filtros.jornada ?? ''} className={CONTROL}>
          <option value="">Todas</option>
          {jornadas.map((numero) => <option key={numero} value={numero}>Jornada {numero}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Equipo</span>
        <select name="equipo" defaultValue={filtros.equipo ?? ''} className={CONTROL}>
          <option value="">Todos</option>
          {equipos.map((equipo) => <option key={equipo.id} value={equipo.id}>{equipo.nombre}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={filtros.estado} className={CONTROL}>
          <option value="todos">Todos</option>
          <option value="con-resultado">Con resultado</option>
          <option value="sin-resultado">Sin resultado</option>
        </select>
      </label>
      <div className="flex items-center gap-1 sm:col-span-2 lg:col-span-1 lg:justify-end">
        <button type="submit" className={BOTON}>Filtrar</button>
        {hayFiltros && (
          <Link href={urlDeCalendarioGrupo(grupoId, filtros, { jornada: null, equipo: null, estado: 'todos' }) as Route}
            className={ENLACE}>
            Quitar
          </Link>
        )}
      </div>
    </form>
  );
}
