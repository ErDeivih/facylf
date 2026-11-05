import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import { PERSONA_POR_ID, type FilaPersona } from '@/consultas/entidades';
import {
  HISTORIAL_DE_JUGADOR, type AparicionDeHistorial, type FilaHistorialJugador,
} from '@/consultas/historial';
import { ResumenHistorial } from '@/componentes/historial/ResumenHistorial';
import { TablaHistorial } from '@/componentes/historial/TablaHistorial';
import { CabeceraJugador, type ContextoDeJugador } from '@/componentes/fichas/Cabeceras';
import { IdentidadDelJugador } from '@/componentes/fichas/Jugador';
import { AvisoSinArchivo, Migas } from '@/componentes/fichas/piezas';
import { idDeFicha } from '@/lib/fichas';
import {
  agrupaHistorial, equipoActual, resumenDeCarrera, tituloDeHistorial,
} from '@/lib/historial-jugador';

/**
 * Historial de un jugador: `/explorar/jugador/[id]/historial`, con el id de `core.person.id`.
 *
 * Es la respuesta al feedback de David (WALL, «Revisión de las capturas»): la trayectoria agregada de la
 * ficha pierde los cambios a mitad de temporada y los equipos distintos del mismo club. Aquí se baja a
 * la aparición real y se agrupa en tramos, con una fila por equipo y temporada y un aviso cuando hay
 * cambio de equipo o de club, o cuando hay dos equipos a la vez porque las fechas se solapan.
 *
 * Dos consultas en una sola foto: la persona (para la cabecera y el aviso de identidad nominal) y el
 * historial (persona + apariciones en un JSON). No hay una consulta por temporada ni por equipo. Si la
 * persona no existe es un 404 de verdad; si existe pero no tiene actas, se dice «sin historial».
 */
export const revalidate = 60;

/** Título de la pestaña: el jugador y el historial. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) return {};
  try {
    const [historial] = await consultaEnUnaFoto<FilaHistorialJugador>([
      { sql: HISTORIAL_DE_JUGADOR.sql, parametros: [id] },
    ]);
    const fila = historial[0];
    return fila ? { title: tituloDeHistorial(fila.nombre_mostrado) } : {};
  } catch {
    return {};
  }
}

export default async function PaginaHistorial({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeFicha(crudo);
  if (id === null) notFound();

  let persona: FilaPersona | undefined;
  let historial: FilaHistorialJugador | undefined;
  try {
    const [filasHistorial, filasPersona] = await consultaEnUnaFoto<FilaHistorialJugador | FilaPersona>([
      { sql: HISTORIAL_DE_JUGADOR.sql, parametros: [id] },
      { sql: PERSONA_POR_ID.sql, parametros: [id] },
    ]);
    historial = filasHistorial[0] as FilaHistorialJugador | undefined;
    persona = filasPersona[0] as FilaPersona | undefined;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <AvisoSinArchivo titulo="Historial" />;
    throw error;
  }
  if (!persona) notFound();

  const apariciones: AparicionDeHistorial[] = historial?.apariciones ?? [];
  const temporadas = agrupaHistorial(apariciones);
  const resumen = resumenDeCarrera(temporadas);
  const actual = equipoActual(temporadas);
  const federaciones = [...new Set(apariciones.map((a) => a.federacion_nombre))];
  const contexto: ContextoDeJugador = {
    equipoActual: actual === null
      ? null
      : { equipo_id: actual.equipoId, nombre: actual.equipo, edicion: actual.edicion, temporada: actual.temporada },
    federaciones,
    temporadas: temporadas.length,
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Migas tramos={[
        { texto: persona.nombre_mostrado, href: `/explorar/jugador/${id}` },
        { texto: 'Historial' },
      ]} />
      <CabeceraJugador jugador={persona} contexto={contexto} />
      {persona.identidad_nominal && <IdentidadDelJugador jugador={persona} />}
      <ResumenHistorial resumen={resumen} />
      <TablaHistorial temporadas={temporadas} />
    </div>
  );
}
