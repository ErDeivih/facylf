import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DEL_EQUIPO, type FilaHistorialEquipo } from '@/consultas/historial-equipos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Migas } from '@/componentes/fichas/piezas';
import {
  CabeceraHistorialEquipo, ResumenHistorialEquipo, TemporadasDelEquipo,
} from '@/componentes/historial/Equipo';
import { idDeFicha } from '@/lib/fichas';
import { filaAncla, historialDeEquipo } from '@/lib/historial-equipos';

/**
 * Historial de un equipo: `/explorar/equipo/[id]/historial`.
 *
 * **El id es el de la inscripción** (`core.team_entry.id`), la misma pieza que la ficha de equipo: el
 * `team_season` del canónico colapsa equipos distintos del mismo club con el mismo nombre publicado y
 * usarlo aquí mezclaría dos historiales. Desde esa inscripción se busca su **línea** (club, categoría,
 * letra) y se enseñan todas sus temporadas.
 *
 * Una sola consulta: la cabecera (equipo, club, federación y escudo) viaja en las mismas filas que las
 * temporadas. `generateMetadata` usa la misma función memoizada, así que no hay una segunda lectura en
 * la misma petición.
 */
export const revalidate = 60;

const historialDe = cache(async (id: number): Promise<FilaHistorialEquipo[]> =>
  consulta<FilaHistorialEquipo>(HISTORIAL_DEL_EQUIPO.sql, [id]));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const filas = await historialDe(id);
    const ancla = filaAncla(filas, id);
    return ancla ? { title: `${ancla.equipo} · historial — Fondo Popular` } : {};
  } catch {
    // Sin canónico la página ya enseña su estado; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PaginaHistorialEquipo({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let filas: FilaHistorialEquipo[] = [];
  try {
    filas = await historialDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Historial del equipo" motivo={error.message} />;
    throw error;
  }
  if (filas.length === 0) notFound();

  const ancla = filaAncla(filas, id)!;
  const { temporadas, resumen } = historialDeEquipo(filas);

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: ancla.federacion_nombre },
        { texto: ancla.club, href: `/explorar/club/${ancla.club_id}` },
        { texto: ancla.equipo, href: `/explorar/equipo/${ancla.equipo_id}` },
        { texto: 'Historial' },
      ]} />
      <CabeceraHistorialEquipo fila={ancla} />
      <ResumenHistorialEquipo resumen={resumen} />
      <TemporadasDelEquipo temporadas={temporadas} />
    </div>
  );
}
