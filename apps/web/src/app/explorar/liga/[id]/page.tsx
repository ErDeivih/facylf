import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CLASIFICACION_CALCULADA, GRUPO_POR_ID,
  type FilaClasificacionPantalla, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { DISCIPLINA_Y_CANTERA_DEL_GRUPO, type FilaEquipoDeLiga } from '@/consultas/liga';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import {
  EVENTOS_DEL_GRUPO, type EventosDelGrupo, type FilaEventosDelGrupo,
} from '@/consultas/estadisticas';
import { EnlacesDeApoyo } from '@/componentes/estadisticas/Tablas';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraLiga } from '@/componentes/liga/CabeceraLiga';
import {
  CanteraDelGrupo, CifrasDeLiga, ClasificacionResumida, DisciplinaDelGrupo, GolesPorTramoDeLiga,
  ResultadosDeLiga, ResultadosRecientes,
} from '@/componentes/liga/Liga';
import { agregaResumenDePartidos, idDeGrupoDeUrl } from '@/lib/estadisticas';
import { resultadosRecientes, tramosDeLiga } from '@/lib/liga';
import { tituloDeCompeticion } from '@/lib/pantalla-competicion';

/**
 * Página de liga: `/explorar/liga/[id]`.
 *
 * **El id es el del grupo** (`core.phase_group.id`), el mismo que usa la ficha de competición: una
 * liga del archivo es un grupo publicado por una federación en una temporada. La edición puede tener
 * varios grupos (y entonces se abre cada uno); aceptar el id de edición mezclaría grupos distintos en
 * una misma tabla.
 *
 * Es la lectura de la liga contra `prototipo/Liga.dc.html`: resultados, cuándo se marcan los goles,
 * minutos de los equipos inferiores (cantera), clasificación resumida y disciplina por equipo, con
 * enlaces a competición, jornada, acta y ficha de cada equipo.
 *
 * Consultas: la portada del grupo primero (sin ella no hay 404 correcto ni parámetros para las demás)
 * y después, en una sola foto, los partidos, los eventos del grupo, la disciplina-cantera y la
 * clasificación. Ninguna consulta por equipo ni por partido.
 */
export const revalidate = 60;

const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: crudo } = await params;
  const id = idDeGrupoDeUrl(crudo);
  if (id === null) return {};
  try {
    const grupo = await portadaDe(id);
    return grupo ? { title: tituloDeCompeticion(grupo) } : {};
  } catch {
    return {};
  }
}

export default async function PaginaLiga({ params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const id = idDeGrupoDeUrl(crudo);
  if (id === null) notFound();

  let grupo: FilaPortadaGrupo | undefined;
  try {
    grupo = await portadaDe(id);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Liga" motivo={error.message} />;
    throw error;
  }
  if (!grupo) notFound();

  const base = `/explorar/competicion/${grupo.grupo_id}`;
  let partidos: FilaPartidoCanonico[] = [];
  let eventos: EventosDelGrupo = { tramos: [], tarjetas: [] };
  let equipos: FilaEquipoDeLiga[] = [];
  let clasificacion: FilaClasificacionPantalla[] = [];
  try {
    const [p, e, eq, cl] = await consultaEnUnaFoto([
      { sql: PARTIDOS_DE_GRUPO.sql, parametros: [grupo.federacion, grupo.grupo_codigo, 1000] },
      { sql: EVENTOS_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      { sql: DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      { sql: CLASIFICACION_CALCULADA.sql, parametros: [grupo.grupo_id] },
    ]);
    partidos = p as unknown as FilaPartidoCanonico[];
    eventos = (e as unknown as FilaEventosDelGrupo[])[0]?.datos ?? eventos;
    equipos = eq as unknown as FilaEquipoDeLiga[];
    clasificacion = cl as unknown as FilaClasificacionPantalla[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Liga" motivo={error.message} />;
    throw error;
  }

  const resumen = agregaResumenDePartidos(partidos);
  const recientes = resultadosRecientes(partidos);
  const tramos = tramosDeLiga(eventos.tramos);

  return (
    <div className="flex flex-col gap-[18px]">
      <CabeceraLiga grupo={grupo} />
      {partidos.length === 0 && (
        <p className="m-0 text-tabla text-[var(--texto-suave)]">Sin partidos publicados para esta liga.</p>
      )}
      <CifrasDeLiga resumen={resumen} />
      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <ResultadosDeLiga resumen={resumen} />
        <ResultadosRecientes jornada={recientes.jornada} partidos={recientes.partidos} base={base} />
      </div>
      <GolesPorTramoDeLiga tramos={tramos} totalGoles={resumen.goles} />
      <CanteraDelGrupo filas={equipos} />
      <div className="grid items-start gap-[18px] lg:grid-cols-2">
        <ClasificacionResumida filas={clasificacion} base={base} />
        <DisciplinaDelGrupo filas={equipos} />
      </div>
      <EnlacesDeApoyo enlaces={[
        { texto: 'Competición', href: base },
        { texto: 'Calendario', href: `${base}/calendario` },
        { texto: 'Jornadas', href: `${base}/jornadas` },
        { texto: 'Estadísticas', href: `${base}/estadisticas` },
      ]} />
    </div>
  );
}
