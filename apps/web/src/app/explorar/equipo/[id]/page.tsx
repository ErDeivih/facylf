import { cache } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EQUIPO_POR_ID, PARTIDOS_DEL_EQUIPO, PLANTILLA_DEL_EQUIPO,
  type FilaEquipo, type FilaJugadorDePlantilla, type FilaPartidoDeEquipo,
} from '@/consultas/entidades';
import { ESCUDO_DEL_CLUB, GOLES_POR_TRAMO, type FilaTramoGoles } from '@/consultas/fichas';
import { CabeceraEquipo } from '@/componentes/fichas/Cabeceras';
import { GolesPorTramo, PlantillaDelEquipo, ResumenDelEquipo, UltimosResultados } from '@/componentes/fichas/Equipo';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { idDeFicha, resumenDeEquipo, tramosCompletos } from '@/lib/fichas';

/**
 * Ficha de equipo: `/explorar/equipo/[id]`.
 *
 * **El id es el de la inscripción canónica** (`core.team_entry.id`), no el del equipo-temporada ni el
 * del club. Es la misma decisión que toma todo el catálogo de entidades y el motivo está medido: la
 * clave de `core.team_season` colapsa dos equipos del mismo club con el mismo nombre publicado en una
 * sola fila (el juvenil y el sénior del club 16), así que una ficha de equipo-temporada enseñaría la
 * plantilla de uno con la clasificación del otro.
 *
 * Cuatro consultas y ninguna por jugador ni por partido: la cabecera del equipo (con su club y su
 * competición), el escudo del club, y en una sola foto la plantilla, los partidos y los goles por tramo.
 * La racha, los goles y el reparto casa/fuera se calculan de esos mismos partidos, sin volver a la base.
 */
export const revalidate = 60;

const equipoDe = cache(async (id: number): Promise<FilaEquipo | undefined> => {
  const [fila] = await consulta<FilaEquipo>(EQUIPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const equipo = await equipoDe(id);
    return equipo ? { title: `${equipo.nombre_en_fuente} · ${equipo.temporada} — Cantera` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaEquipo({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let equipo: FilaEquipo | undefined;
  let plantilla: FilaJugadorDePlantilla[] = [];
  let partidos: FilaPartidoDeEquipo[] = [];
  let goles: FilaTramoGoles[] = [];
  let tieneEscudo = false;
  try {
    equipo = await equipoDe(id);
    if (!equipo) notFound();
    const [escudo, ...datos] = await consultaEnUnaFoto([
      { sql: ESCUDO_DEL_CLUB.sql, parametros: [Number(equipo.club_id)] },
      { sql: PLANTILLA_DEL_EQUIPO.sql, parametros: [id, 200] },
      { sql: PARTIDOS_DEL_EQUIPO.sql, parametros: [id, 200, 0] },
      { sql: GOLES_POR_TRAMO.sql, parametros: [id] },
    ]);
    tieneEscudo = (escudo[0] as { tiene_escudo?: boolean } | undefined)?.tiene_escudo === true;
    plantilla = datos[0] as unknown as FilaJugadorDePlantilla[];
    partidos = datos[1] as unknown as FilaPartidoDeEquipo[];
    goles = datos[2] as unknown as FilaTramoGoles[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Equipo" />;
    throw error;
  }

  const resumen = resumenDeEquipo(partidos);
  const ultimos = partidos
    .filter((partido) => partido.resultado !== 'sin_resultado')
    .slice(-5);

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: equipo.club, href: `/explorar/club/${equipo.club_id}` },
        { texto: `${equipo.nombre_en_fuente} · ${equipo.temporada}` },
      ]} />
      <CabeceraEquipo equipo={equipo} tieneEscudo={tieneEscudo} />
      <div className="flex justify-end">
        <Link href={`/explorar/equipo/${id}/historial`}
          className="text-tabla font-semibold text-[var(--accion)] hover:underline">
          Ver historial del equipo
        </Link>
      </div>
      <ResumenDelEquipo equipo={equipo} resumen={resumen} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <GolesPorTramo tramos={tramosCompletos(goles)} />
        <UltimosResultados partidos={ultimos} grupoId={Number(equipo.grupo_id)} />
      </div>
      <PlantillaDelEquipo filas={plantilla} partidosElegibles={equipo.partidos_elegibles} />
    </div>
  );
}
