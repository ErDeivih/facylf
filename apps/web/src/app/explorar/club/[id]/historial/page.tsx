import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DEL_CLUB, type FilaHistorialClub } from '@/consultas/historial-equipos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Migas } from '@/componentes/fichas/piezas';
import {
  CabeceraHistorialClub, ResumenHistorialClub, TemporadasDelClub,
} from '@/componentes/historial/Club';
import { idDeFicha } from '@/lib/fichas';
import { filasDeEquiposDelClub, resumenDeClubEnHistorial, temporadasDelClub } from '@/lib/historial-equipos';

/**
 * Historial de un club: `/explorar/club/[id]/historial`.
 *
 * **El id es el del club** (`core.club.id`). La pantalla enseña sus equipos temporada a temporada:
 * todas sus inscripciones, con la categoría y la letra del filial delante, para que los varios equipos
 * que un club tiene en la misma temporada no se confundan.
 *
 * Una sola consulta: el club (nombre, lugar, federación y escudo) se lee en el mismo `left join` que
 * sus equipos. Un club sin equipos publicados devuelve una fila con el club y los equipos a `null` y
 * la pantalla lo dice; un club que no existe no devuelve filas y es un 404 de verdad.
 */
export const revalidate = 60;

/** Tope de inscripciones que se traen en una visita; un club normal no llega ni a la mitad. */
const LIMITE_EQUIPOS = 1200;

const clubDe = cache(async (id: number): Promise<FilaHistorialClub[]> =>
  consulta<FilaHistorialClub>(HISTORIAL_DEL_CLUB.sql, [id, LIMITE_EQUIPOS]));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const filas = await clubDe(id);
    return filas[0] ? { title: `${filas[0].club} · historial — Fondo Popular` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaHistorialClub({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let filas: FilaHistorialClub[] = [];
  try {
    filas = await clubDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Historial del club" motivo={error.message} />;
    throw error;
  }
  if (filas.length === 0) notFound();

  const cabecera = filas[0]!;
  const equipos = filasDeEquiposDelClub(filas);
  const temporadas = temporadasDelClub(filas);
  const resumen = resumenDeClubEnHistorial(filas);
  const total = cabecera.total;
  const truncado = total !== null && total > equipos.length;

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: cabecera.federacion_nombre },
        { texto: cabecera.club, href: `/explorar/club/${cabecera.club_id}` },
        { texto: 'Historial' },
      ]} />
      <CabeceraHistorialClub fila={cabecera} />
      <ResumenHistorialClub resumen={resumen} />
      {truncado && (
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Se muestran los primeros {equipos.length} equipos de {total}. Acota por temporada desde la ficha del club.
        </p>
      )}
      <TemporadasDelClub temporadas={temporadas} />
    </div>
  );
}
