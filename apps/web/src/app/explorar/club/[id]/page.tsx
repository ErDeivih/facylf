import { cache } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import { CLUB_POR_ID, EQUIPOS_DEL_CLUB, type FilaClub, type FilaEquipoDeClub } from '@/consultas/entidades';
import { ESCUDO_DEL_CLUB } from '@/consultas/fichas';
import { CabeceraClub } from '@/componentes/fichas/Cabeceras';
import { EquiposDeLaTemporada, EvolucionDelClub, ResumenDelClub } from '@/componentes/fichas/Club';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { evolucionDelClub, idDeFicha, temporadaActual } from '@/lib/fichas';

/**
 * Ficha de club: `/explorar/club/[id]`.
 *
 * **El id es el del club canónico** (`core.club.id`). Un club tiene muchas inscripciones (equipos de
 * cada categoría y temporada) y la ficha las enseña todas de una vez: los equipos de la temporada en
 * curso y la evolución de cada línea en las últimas temporadas.
 *
 * Tres consultas: el club, sus inscripciones (hasta 500, que cubre de sobra un club real) y si tiene
 * escudo. La temporada en curso, la evolución y el resumen se calculan de esa misma lista, sin una
 * consulta por temporada ni por equipo.
 */
export const revalidate = 60;

const clubDe = cache(async (id: number): Promise<FilaClub | undefined> => {
  const [fila] = await consulta<FilaClub>(CLUB_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const club = await clubDe(id);
    return club ? { title: `${club.nombre_canonico} — Fondo Popular` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaClub({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let club: FilaClub | undefined;
  let equipos: FilaEquipoDeClub[] = [];
  let tieneEscudo = false;
  try {
    club = await clubDe(id);
    if (!club) notFound();
    const [lista, escudo] = await consultaEnUnaFoto([
      { sql: EQUIPOS_DEL_CLUB.sql, parametros: [id, null, 500] },
      { sql: ESCUDO_DEL_CLUB.sql, parametros: [id] },
    ]);
    equipos = lista as unknown as FilaEquipoDeClub[];
    tieneEscudo = (escudo[0] as { tiene_escudo?: boolean } | undefined)?.tiene_escudo === true;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Club" />;
    throw error;
  }

  const temporada = temporadaActual(equipos);
  const actuales = temporada === null ? [] : equipos.filter((equipo) => equipo.temporada === temporada);

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: club.federacion_nombre },
        { texto: club.nombre_canonico },
      ]} />
      <CabeceraClub club={club} tieneEscudo={tieneEscudo} />
      <div className="flex justify-end">
        <Link href={`/explorar/club/${id}/historial`}
          className="text-tabla font-semibold text-[var(--accion)] hover:underline">
          Ver historial del club
        </Link>
      </div>
      <ResumenDelClub club={club} equipos={equipos} />
      <EquiposDeLaTemporada filas={actuales} temporada={temporada} />
      <EvolucionDelClub evolucion={evolucionDelClub(equipos, 6)} />
    </div>
  );
}
