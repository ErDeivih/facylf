import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ARBITRO_POR_ID, type FilaArbitro } from '@/consultas/oficiales';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { CabeceraOficial } from '@/componentes/oficiales/CabeceraOficial';
import {
  CompeticionesDeArbitro, ResumenDeArbitro, UltimosPartidosDeArbitro,
} from '@/componentes/oficiales/Arbitro';
import { idDeOficial } from '@/lib/oficiales';

/**
 * Ficha de árbitro: `/explorar/arbitro/[id]`, con el id de `core.person`.
 *
 * Una sola consulta (`arbitro-por-id`) trae la persona, los totales, el desglose por competición con la
 * media de la competición y los últimos partidos: no hay una consulta por partido.
 *
 * Es un 404 de verdad cuando el id no es un entero positivo o cuando esa persona no ha arbitrado ningún
 * partido como principal: un jugador no tiene ficha de árbitro, y una ficha vacía lo parecería.
 *
 * Los asistentes no se enseñan porque el canónico no los guarda todavía (`core.match_official` sólo tiene
 * el rol `principal`); no se rellenan con lo que no hay.
 */
export const revalidate = 60;

const arbitroDe = cache(async (id: number): Promise<FilaArbitro | undefined> => {
  const [fila] = await consulta<FilaArbitro>(ARBITRO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) return {};
  try {
    const fila = await arbitroDe(id);
    return fila ? { title: `${fila.nombre} · Árbitro — Fondo Popular` } : {};
  } catch {
    // Sin canónico la página ya enseña su estado; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PaginaArbitro({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeOficial(crudo);
  if (id === null) notFound();

  let fila: FilaArbitro | undefined;
  try {
    fila = await arbitroDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Árbitro" />;
    throw error;
  }
  if (!fila) notFound();

  const temporadas = new Set(fila.competiciones.map((c) => c.temporada)).size;
  const lineas = [
    `${fila.partidos} ${fila.partidos === 1 ? 'partido arbitrado' : 'partidos arbitrados'}`,
    `${temporadas} ${temporadas === 1 ? 'temporada' : 'temporadas'}`,
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: 'Explorar', href: '/explorar/competiciones' },
        { texto: fila.nombre },
      ]} />
      <CabeceraOficial nombre={fila.nombre} rol="Árbitro principal" lineas={lineas} />
      <ResumenDeArbitro fila={fila} />
      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <CompeticionesDeArbitro competiciones={fila.competiciones} />
        <UltimosPartidosDeArbitro partidos={fila.ultimos} />
      </div>
    </div>
  );
}
