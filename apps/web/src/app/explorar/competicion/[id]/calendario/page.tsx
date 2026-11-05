import { cache, Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION,
  type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CalendarioDeGrupo } from '@/componentes/calendario/CalendarioDeGrupo';
import { EsqueletoCalendario, SinPartidos } from '@/componentes/calendario/EstadosCalendario';
import { FiltrosCalendarioGrupo } from '@/componentes/calendario/FiltrosCalendarioGrupo';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import {
  equiposDelCalendario, filtraPartidosDeGrupo, idDeGrupoDeUrl, jornadasDelCalendario, leeFiltrosCalendarioGrupo,
  rutaDeActaDePartido, rutaDeCalendario, tieneFiltrosDeGrupo, tituloDeCalendarioGrupo,
} from '@/lib/calendario';
import type { FiltrosCalendarioGrupo as FiltrosDeGrupo } from '@/lib/calendario';
import { temporadasPublicables } from '@/lib/pantalla-competicion';

/**
 * Calendario de un grupo: todas sus jornadas y sus partidos, agrupados por jornada.
 *
 * Vive en `/explorar/competicion/[id]/calendario`, al lado de la ficha del grupo y del detalle de
 * jornada. La pestaña de la cabecera la integra la coordinación; esta pantalla no edita la cabecera.
 *
 * Tres decisiones que se ven en la página:
 *  · los filtros (jornada, equipo, estado) se aplican en el servidor sobre los partidos del grupo, que
 *    están acotados: no hay una consulta por combinación de filtros;
 *  · un partido sin marcador se pinta «—», nunca 0-0; sin fecha publicada no se coloca en un día;
 *  · el enlace al acta sólo aparece en los partidos con acta analizada (`calidad_acta`).
 *
 * La suspensión va dentro de la página, debajo de la validación del id: un id inexistente sigue siendo
 * un 404 de verdad (no hay `loading.tsx` de ruta, SISTEMA-DISENO §5).
 */
export const revalidate = 60;

/** Portada del grupo, cacheada por React: la comparten `generateMetadata` y la página. */
const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

/** La pestaña del navegador dice la competición y el grupo, no el título genérico del sitio. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: idCrudo } = await params;
  const id = idDeGrupoDeUrl(idCrudo);
  if (id === null) return {};
  try {
    const portada = await portadaDe(id);
    return portada ? { title: tituloDeCalendarioGrupo(portada) } : {};
  } catch {
    // Sin canónico la página ya enseña su estado de error; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PantallaCalendario({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: idCrudo } = await params;
  const id = idDeGrupoDeUrl(idCrudo);
  if (id === null) notFound();
  const filtros = leeFiltrosCalendarioGrupo(await searchParams);

  // 1. Validación + portada: sin esto no hay página ni cabecera que enseñar.
  let portada: FilaPortadaGrupo | undefined;
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) {
      const [h, t] = await consultaEnUnaFoto([
        { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [portada.edicion_id] },
        { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [portada.grupo_id] },
      ]);
      hermanos = h as unknown as FilaGrupoDeLaEdicion[];
      temporadas = temporadasPublicables(t as unknown as FilaEdicionDeLaCompeticion[], undefined, portada?.edicion_id);
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Calendario" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;

  return (
    <div className="flex flex-col gap-[18px]">
      <MigaCompeticion grupo={grupo} tramos={[{ texto: 'Calendario' }]} />
      <CabeceraCompeticion
        grupo={grupo}
        grupos={hermanos}
        temporadas={temporadas}
        rutaBase={`/explorar/competicion/${grupo.grupo_id}`}
        fechaInicio={grupo.fecha_inicio}
        fechaFin={grupo.fecha_fin}
        activa="calendario"
      />
      <Suspense fallback={<div className="flex flex-col gap-[18px]"><EsqueletoCalendario filas={8} /></div>}>
        <Contenido grupo={grupo} filtros={filtros} />
      </Suspense>
    </div>
  );
}

/**
 * El calendario. Pide los partidos del grupo UNA vez (el grupo más grande no llega a 500 partidos) y
 * reparte por jornadas en el servidor; los filtros se aplican sobre esa lista.
 */
async function Contenido({ grupo, filtros }: { grupo: FilaPortadaGrupo; filtros: FiltrosDeGrupo }) {
  let partidos: FilaPartidoCanonico[] = [];
  try {
    partidos = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql,
      [grupo.federacion, grupo.grupo_codigo, 1000]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Calendario" motivo={error.message} />;
    }
    throw error;
  }

  const todasLasJornadas = jornadasDelCalendario(partidos);
  const equipos = equiposDelCalendario(partidos);
  const filtrados = filtraPartidosDeGrupo(partidos, filtros);
  const jornadas = jornadasDelCalendario(filtrados);
  const hayFiltros = tieneFiltrosDeGrupo(filtros);

  if (partidos.length === 0) {
    return (
      <div className="flex flex-col gap-[18px]">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Calendario</h2>
        <SinPartidos>No hay partidos publicados.</SinPartidos>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Calendario</h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {jornadas.length === 1 ? '1 jornada' : `${jornadas.length} jornadas`}
          {' · '}
          {filtrados.length === 1 ? '1 partido' : `${filtrados.length} partidos`}
        </p>
      </div>
      <FiltrosCalendarioGrupo
        grupoId={grupo.grupo_id}
        filtros={filtros}
        jornadas={todasLasJornadas.map((jornada) => jornada.numero)}
        equipos={equipos}
      />
      {jornadas.length === 0
        ? (
          <SinPartidos>
            No hay partidos con estos filtros.{' '}
            <Link href={rutaDeCalendario(grupo.grupo_id) as Route} className="font-semibold text-[var(--accion)] hover:underline">
              Quitar los filtros
            </Link>
          </SinPartidos>
        )
        : (
          <CalendarioDeGrupo
            jornadas={jornadas}
            hrefJornada={(numero) => `/explorar/competicion/${grupo.grupo_id}/jornada/${numero}`}
            hrefActa={(partido) => (partido.calidad_acta !== null ? rutaDeActaDePartido(partido.partido_id) : null)}
          />
        )}
    </div>
  );
}
