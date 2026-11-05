import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  PERSONA_POR_ID, TRAYECTORIA_DE_PERSONA, type FilaPersona, type FilaTemporadaDePersona,
} from '@/consultas/entidades';
import { PARTIDOS_DE_PERSONA, type FilaPartidoDePersona } from '@/consultas/fichas';
import { CabeceraJugador, type ContextoDeJugador } from '@/componentes/fichas/Cabeceras';
import {
  IdentidadDelJugador, MinutosPorTemporada, TablaTrayectoria, TotalesJugador, UltimosPartidosJugador,
} from '@/componentes/fichas/Jugador';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { idDeFicha, minutosPorTemporada, totalesDeCarrera } from '@/lib/fichas';

/**
 * Ficha de jugador: `/explorar/jugador/[id]`.
 *
 * **El id es el de la persona canónica** (`core.person.id`). No es un código federativo: la misma
 * persona puede tener códigos de dos federaciones y una fila aquí, y ése es justamente el trabajo de
 * identidad que el canónico hace. Los códigos se enseñan, pero la ruta va por el id interno para que
 * una decisión de identidad no rompa los enlaces.
 *
 * Tres consultas y ninguna por partido: la persona, su trayectoria (una fila por equipo y temporada) y
 * sus últimos partidos, que ya traen equipo, club, competición y rival en la misma fila. La portada de
 * la persona se cachea con React para que `generateMetadata` y la página no la pidan dos veces.
 *
 * Si la persona no existe es un 404 de verdad, no un 200 con la página vacía.
 */
export const revalidate = 60;

const personaDe = cache(async (id: number): Promise<FilaPersona | undefined> => {
  const [fila] = await consulta<FilaPersona>(PERSONA_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const persona = await personaDe(id);
    return persona ? { title: `${persona.nombre_mostrado} — facylf` } : {};
  } catch {
    return {};
  }
}

export default async function PaginaJugador({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let persona: FilaPersona | undefined;
  let trayectoria: FilaTemporadaDePersona[] = [];
  let partidos: FilaPartidoDePersona[] = [];
  try {
    persona = await personaDe(id);
    if (!persona) notFound();
    const [t, p] = await consultaEnUnaFoto([
      { sql: TRAYECTORIA_DE_PERSONA.sql, parametros: [id, 100] },
      { sql: PARTIDOS_DE_PERSONA.sql, parametros: [id, 12] },
    ]);
    trayectoria = t as unknown as FilaTemporadaDePersona[];
    partidos = p as unknown as FilaPartidoDePersona[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Jugador" />;
    throw error;
  }

  const totales = totalesDeCarrera(trayectoria);
  const federaciones = [...new Set(trayectoria.map((f) => f.federacion_nombre))];
  // La trayectoria llega de la temporada más reciente a la más antigua: la primera fila es su equipo actual.
  const ultima = trayectoria[0];
  const contexto: ContextoDeJugador = {
    equipoActual: ultima
      ? { equipo_id: Number(ultima.equipo_id), nombre: ultima.nombre_en_fuente, edicion: ultima.edicion, temporada: ultima.temporada }
      : null,
    federaciones,
    temporadas: new Set(trayectoria.map((f) => f.temporada)).size,
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        ...(federaciones[0] ? [{ texto: federaciones[0] }] : []),
        { texto: persona.nombre_mostrado },
      ]} />
      <CabeceraJugador jugador={persona} contexto={contexto} />
      <TotalesJugador totales={totales} />
      <div className="grid gap-[18px] lg:grid-cols-2">
        <MinutosPorTemporada filas={minutosPorTemporada(trayectoria)} />
        <IdentidadDelJugador jugador={persona} />
      </div>
      <TablaTrayectoria filas={trayectoria} />
      <UltimosPartidosJugador filas={partidos} />
    </div>
  );
}
