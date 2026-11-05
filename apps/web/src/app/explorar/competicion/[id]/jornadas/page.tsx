import { cache, Suspense } from 'react';
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
import { EsqueletoJornadas, ListadoJornadas } from '@/componentes/competicion/ListadoJornadas';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import {
  agrupaJornadas, rutaDeJornada, tituloDeJornadas, type PartidoDeJornada,
} from '@/lib/jornadas';
import { temporadasPublicables } from '@/lib/pantalla-competicion';

/**
 * Pantalla de jornadas de un grupo: la pestaña «Jornadas» del prototipo de competición.
 *
 * Vive en `/explorar/competicion/[id]/jornadas`. La pestaña de `CabeceraCompeticion` apuntará aquí
 * (`rutaBase + '/jornadas'`, con `rutaBase = /explorar/competicion/[id]`), que es el contrato que deja
 * preparado esta ruta. El detalle de cada jornada está en `/explorar/competicion/[id]/jornada/[numero]`
 * (en singular, como el prototipo: la lista es «jornadas» y una jornada es «jornada»).
 *
 * Los datos salen de una sola consulta de partidos; el reparto por jornadas se hace en el servidor
 * (`lib/jornadas.ts`), sin una consulta por jornada. La cabecera de competición se comparte con la
 * pantalla de clasificación para que las pestañas, el grupo y la temporada no se contradigan.
 *
 * La suspensión va DENTRO de la página, por debajo de la validación del id: así la cabecera se envía
 * mientras se resuelven los partidos, pero un id inexistente sigue siendo un 404 de verdad (no hay
 * `loading.tsx` de ruta, SISTEMA-DISENO §5).
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

  // 1. Validación + portada: sin esto no hay página ni cabecera que enseñar.
  let portada: FilaPortadaGrupo | undefined;
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) {
      // Los desplegables de la cabecera se resuelven antes del límite de suspensión.
      const [h, t] = await consultaEnUnaFoto([
        { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [portada.edicion_id] },
        { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [portada.grupo_id] },
      ]);
      hermanos = h as unknown as FilaGrupoDeLaEdicion[];
      // El desplegable no ofrece temporadas que el pie declara no publicadas (hallazgo I9 del QA).
      temporadas = temporadasPublicables(t as unknown as FilaEdicionDeLaCompeticion[], undefined, portada?.edicion_id);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Jornadas" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;

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
        activa="jornadas"
      />
      {/*
        El esqueleto mide lo que el contenido: las jornadas publicadas suelen ser las que llegan hasta
        la última con resultado, no las previstas de toda la temporada (`jornadas_previstas` es 30 en
        un grupo que lleva 4). Se acota a 8 filas para no pintar una tarjeta larguísima.
      */}
      <Suspense fallback={<EsqueletoJornadas filas={Math.min(8, Math.max(1, grupo.jornada_actual ?? 4))} />}>
        <Contenido grupo={grupo} />
      </Suspense>
    </div>
  );
}

/**
 * El listado. Pide los partidos del grupo UNA vez (el tope es de sobra para una liga: el grupo más
 * grande no llega a 500 partidos) y reparte por jornadas en el servidor.
 */
async function Contenido({ grupo }: { grupo: FilaPortadaGrupo }) {
  let partidos: PartidoDeJornada[] = [];
  try {
    partidos = await consulta<PartidoDeJornada>(PARTIDOS_DE_GRUPO.sql,
      [grupo.federacion, grupo.grupo_codigo, 1000]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Jornadas" motivo={error.message} />;
    }
    throw error;
  }

  const jornadas = agrupaJornadas(partidos);
  return (
    <ListadoJornadas
      jornadas={jornadas}
      hrefJornada={(numero) => rutaDeJornada(grupo.grupo_id, numero)}
    />
  );
}
