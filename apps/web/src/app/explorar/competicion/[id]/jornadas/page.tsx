import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION,
  type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { PARTIDOS_DE_GRUPO } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { ListadoJornadas } from '@/componentes/competicion/ListadoJornadas';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import { rutaDeActa, tieneActa } from '@/lib/acta';
import {
  agrupaJornadasConPartidos, fechaUltimaJugadaDePartidos, fechaUltimaJugadaDePortada, rutaDeJornada,
  tituloDeJornadas, type PartidoDeJornada,
} from '@/lib/jornadas';
import { temporadasPublicables } from '@/lib/pantalla-competicion';

/**
 * Pantalla de jornadas de un grupo: la pestaña «Jornadas» del prototipo de competición.
 *
 * Vive en `/explorar/competicion/[id]/jornadas`. La pestaña de `CabeceraCompeticion` apunta aquí
 * (`rutaBase + '/jornadas'`) y el detalle de cada jornada está en
 * `/explorar/competicion/[id]/jornada/[numero]`.
 *
 * Los datos salen de una sola consulta de partidos y se reparten por jornadas en el servidor
 * (`agrupaJornadasConPartidos`), sin una consulta por jornada. La cabecera de competición se comparte
 * con la clasificación para que las pestañas, el grupo y la temporada no se contradigan; su fecha
 * derecha es la de la última jornada JUGADA (de `GRUPO_POR_ID` y, mientras esa columna no esté, del
 * propio listado de partidos).
 *
 * La suspensión se ha quitado a propósito: la cabecera necesita las fechas de los partidos para no
 * enseñar como «última jornada» una fecha futura. Las dos consultas son indexadas y la página se sirve
 * en decenas de milisegundos; la validación del id sigue por encima de todo, así que un id inexistente
 * sigue siendo un 404 de verdad (no hay `loading.tsx` de ruta, SISTEMA-DISENO §5).
 */
export const revalidate = 60;

/** Un id de la URL sólo vale si es un entero positivo; cualquier otra cosa es una página que no existe. */
function idDeGrupo(crudo: string | undefined): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/** Portada del grupo, cacheada por React: la comparten `generateMetadata` y la página. */
const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

/** La pestaña del navegador dice la competición y el grupo, no el título genérico del sitio. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: idCrudo } = await params;
  const id = idDeGrupo(idCrudo);
  if (Number.isNaN(id)) return {};
  try {
    const portada = await portadaDe(id);
    return portada ? { title: tituloDeJornadas(portada) } : {};
  } catch {
    // Sin canónico la página ya enseña su estado de error; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PantallaJornadas({ params }: { params: Promise<{ id: string }> }) {
  const { id: idCrudo } = await params;
  const id = idDeGrupo(idCrudo);
  if (Number.isNaN(id)) notFound();

  let portada: FilaPortadaGrupo | undefined;
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  let partidos: PartidoDeJornada[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) {
      const [h, t, p] = await consultaEnUnaFoto([
        { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [portada.edicion_id] },
        { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [portada.grupo_id] },
        { sql: PARTIDOS_DE_GRUPO.sql, parametros: [portada.federacion, portada.grupo_codigo, 1000] },
      ]);
      hermanos = h as unknown as FilaGrupoDeLaEdicion[];
      // El desplegable no ofrece temporadas que el pie declara no publicadas (hallazgo I9 del QA).
      temporadas = temporadasPublicables(t as unknown as FilaEdicionDeLaCompeticion[], undefined, portada.edicion_id);
      partidos = p as unknown as PartidoDeJornada[];
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Jornadas" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;
  // La fuente definitiva es `GRUPO_POR_ID.fecha_ultima_jugada`; el listado de partidos es el respaldo
  // mientras la columna esté llegando al canónico.
  const fechaUltimaJugada = fechaUltimaJugadaDePortada(grupo) ?? fechaUltimaJugadaDePartidos(partidos);

  return (
    <div className="flex flex-col gap-[18px]">
      <MigaCompeticion grupo={grupo} tramos={[{ texto: 'Jornadas' }]} />
      <CabeceraCompeticion
        grupo={grupo}
        grupos={hermanos}
        temporadas={temporadas}
        rutaBase={`/explorar/competicion/${grupo.grupo_id}`}
        fechaInicio={grupo.fecha_inicio}
        fechaFin={grupo.fecha_fin}
        fechaUltimaJugada={fechaUltimaJugada}
        activa="jornadas"
      />
      <ListadoJornadas
        jornadas={agrupaJornadasConPartidos(partidos)}
        hrefJornada={(numero) => rutaDeJornada(grupo.grupo_id, numero)}
        hrefActa={(partido) => (tieneActa(partido.calidad_acta) ? rutaDeActa(partido.match_id) : null)}
      />
    </div>
  );
}
