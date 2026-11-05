import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ENTRENADOR_POR_ID, type FilaEntrenador } from '@/consultas/oficiales';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { CabeceraOficial } from '@/componentes/oficiales/CabeceraOficial';
import {
  AsignacionesDeEntrenador, ResumenDeEntrenador, UltimosPartidosDeEntrenador,
} from '@/componentes/oficiales/Entrenador';
import { familiaDeRol, idDeOficial } from '@/lib/oficiales';

/**
 * Ficha de entrenador: `/explorar/entrenador/[id]`, con el id de `core.person`.
 *
 * Una sola consulta (`entrenador-por-id`) trae la persona, el balance, las asignaciones por temporada y
 * los últimos partidos. El rol se normaliza en SQL con la misma regla que la interfaz: primer y segundo
 * entrenador cuentan (los dos dirigen), el entrenador de porteros no.
 *
 * 404 real cuando el id no vale o la persona no figura en ningún acta como entrenador.
 */
export const revalidate = 60;

const entrenadorDe = cache(async (id: number): Promise<FilaEntrenador | undefined> => {
  const [fila] = await consulta<FilaEntrenador>(ENTRENADOR_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) return {};
  try {
    const fila = await entrenadorDe(id);
    return fila ? { title: `${fila.nombre} · Entrenador — Cantera` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaEntrenador({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) notFound();

  let fila: FilaEntrenador | undefined;
  try {
    fila = await entrenadorDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Entrenador" />;
    throw error;
  }
  if (!fila) notFound();

  // La figura que se enseña es la que más ejerce: si dirigió como primer entrenador, «Entrenador».
  const rol = fila.asignaciones.some((a) => familiaDeRol(a.rol) === 'entrenador')
    ? 'Entrenador'
    : 'Segundo entrenador';
  const lineas = [
    `${fila.partidos} ${fila.partidos === 1 ? 'partido' : 'partidos'}`,
    `${fila.equipos} ${fila.equipos === 1 ? 'equipo' : 'equipos'}`,
    `${fila.temporadas} ${fila.temporadas === 1 ? 'temporada' : 'temporadas'}`,
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: 'Explorar', href: '/explorar/competiciones' },
        { texto: fila.nombre },
      ]} />
      <CabeceraOficial nombre={fila.nombre} rol={rol} lineas={lineas} />
      <ResumenDeEntrenador fila={fila} />
      <AsignacionesDeEntrenador asignaciones={fila.asignaciones} />
      <UltimosPartidosDeEntrenador partidos={fila.ultimos} />
    </div>
  );
}
