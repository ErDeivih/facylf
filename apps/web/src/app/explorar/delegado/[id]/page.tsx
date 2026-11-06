import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { DELEGADO_POR_ID, type FilaDelegado } from '@/consultas/oficiales';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { CabeceraOficial } from '@/componentes/oficiales/CabeceraOficial';
import {
  AsignacionesDeDelegado, ResumenDeDelegado, UltimosPartidosDeDelegado,
} from '@/componentes/oficiales/Delegado';
import { idDeOficial } from '@/lib/oficiales';

/**
 * Ficha de delegado de equipo: `/explorar/delegado/[id]`, con el id de `core.person`.
 *
 * Una sola consulta (`delegado-por-id`) trae la persona, el resumen, sus equipos por temporada y los
 * últimos partidos. Sólo cuenta el delegado **de equipo** (`DEL. Equipo`, `delegado`, `DELEGAT EQUIP`,
 * `Taldeko Delegatua`); el delegado de campo es otra figura y no se suma aquí.
 *
 * 404 real cuando el id no vale o la persona no figura en ninguna acta como delegado de equipo.
 */
export const revalidate = 60;

const delegadoDe = cache(async (id: number): Promise<FilaDelegado | undefined> => {
  const [fila] = await consulta<FilaDelegado>(DELEGADO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) return {};
  try {
    const fila = await delegadoDe(id);
    return fila ? { title: `${fila.nombre} · Delegado — Fondo Popular` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaDelegado({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) notFound();

  let fila: FilaDelegado | undefined;
  try {
    fila = await delegadoDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Delegado" />;
    throw error;
  }
  if (!fila) notFound();

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
      <CabeceraOficial nombre={fila.nombre} rol="Delegado de equipo" lineas={lineas} />
      <ResumenDeDelegado fila={fila} />
      <AsignacionesDeDelegado asignaciones={fila.asignaciones} />
      <UltimosPartidosDeDelegado partidos={fila.ultimos} />
    </div>
  );
}
