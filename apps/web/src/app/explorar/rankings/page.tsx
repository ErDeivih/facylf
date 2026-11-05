import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DE_LA_EDICION, type FilaGrupoDeLaEdicion } from '@/consultas/competiciones';
import { OPCIONES_DE_ESTADISTICAS, type FilaOpcionesEstadisticas } from '@/consultas/estadisticas';
import {
  EDICIONES_DEL_RANKING, RANKING_DE_JUGADORES,
  type FilaEdicionRanking, type FilaRankingJugador,
} from '@/consultas/rankings';
import { SinCanonico } from '@/componentes/SinCanonico';
import { FiltrosRanking } from '@/componentes/rankings/FiltrosRanking';
import { PaginacionRanking } from '@/componentes/rankings/PaginacionRanking';
import { TablaRanking } from '@/componentes/rankings/TablaRanking';
import { EsqueletoTabla, SinResultados } from '@/componentes/listados/Estados';
import { TARJETA } from '@/componentes/listados/controles';
import { NOMBRE_PRODUCTO } from '@/componentes/marca/marca';
import {
  FEDERACION_POR_DEFECTO, MINIMO_PARTIDOS_POR_DEFECTO, RUTA_RANKINGS, TAMANO_PAGINA_RANKING, TIPOS_RANKING,
  avisoDeFiltro, leeFiltrosRanking, parametrosDeRanking, temporadaPorDefecto,
  urlDeRanking, type FiltrosRanking as FiltrosRankingTipo,
} from '@/lib/rankings';
import { numero } from '@/lib/estadisticas';

/**
 * Rankings (WALL, pantallas restantes): goleadores y tarjetas con datos reales del canónico.
 *
 * Por defecto Castilla y León y la temporada más reciente publicada. Los filtros —federación,
 * temporada, competición, grupo y mínimo de partidos— viven en la URL, y la pestaña (`tipo`) también.
 * La tabla enlaza a la ficha del jugador, a la del equipo y a la competición del grupo.
 *
 * Lo que no se hace: no se convierte lo no medido en cero (min/gol ausente es «—»), no se inventan
 * competiciones en el desplegable y el total que se enseña es el que cuenta la consulta. Los nombres
 * de menores se publican, como en el resto de la plataforma desde el 05/11/2026.
 */
export const metadata: Metadata = { title: `Rankings — ${NOMBRE_PRODUCTO}` };
export const dynamic = 'force-dynamic';

type Parametros = Record<string, string | string[] | undefined>;

export default async function PantallaRankings({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;

  let opciones: FilaOpcionesEstadisticas = { federaciones: null, temporadas: null };
  try {
    const [fila] = await consulta<FilaOpcionesEstadisticas>(OPCIONES_DE_ESTADISTICAS.sql, [],
      { presupuestoMs: OPCIONES_DE_ESTADISTICAS.presupuestoMs });
    opciones = fila ?? opciones;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Rankings" motivo={error.message} />;
    }
    throw error;
  }

  const federaciones = opciones.federaciones ?? [];
  const temporadas = (opciones.temporadas ?? []).map((t) => t.etiqueta);
  const pedidos = leeFiltrosRanking(parametros);
  const aviso = avisoDeFiltro(pedidos.federacion, pedidos.temporada, federaciones.map((f) => f.codigo), temporadas);

  const federacionDefecto = federaciones.some((f) => f.codigo === FEDERACION_POR_DEFECTO)
    ? FEDERACION_POR_DEFECTO
    : (federaciones[0]?.codigo ?? null);
  const temporadaDefecto = temporadaPorDefecto(temporadas, null);
  const federacion = pedidos.federacion !== null && federaciones.some((f) => f.codigo === pedidos.federacion)
    ? pedidos.federacion
    : federacionDefecto;
  const temporada = temporadaPorDefecto(temporadas, pedidos.temporada);
  const federacionNombre = federaciones.find((f) => f.codigo === federacion)?.nombre_corto
    ?? federaciones.find((f) => f.codigo === federacion)?.nombre
    ?? federacion;

  let ediciones: FilaEdicionRanking[] = [];
  if (federacion !== null && temporada !== null) {
    try {
      ediciones = await consulta<FilaEdicionRanking>(EDICIONES_DEL_RANKING.sql, [federacion, temporada],
        { presupuestoMs: EDICIONES_DEL_RANKING.presupuestoMs });
    } catch (error) {
      if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Rankings" motivo={error.message} />;
      throw error;
    }
  }
  const edicion = pedidos.edicion !== null && ediciones.some((e) => Number(e.edicion_id) === pedidos.edicion)
    ? pedidos.edicion
    : null;

  let grupos: FilaGrupoDeLaEdicion[] = [];
  if (edicion !== null) {
    try {
      grupos = await consulta<FilaGrupoDeLaEdicion>(GRUPOS_DE_LA_EDICION.sql, [edicion],
        { presupuestoMs: GRUPOS_DE_LA_EDICION.presupuestoMs });
    } catch (error) {
      if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Rankings" motivo={error.message} />;
      throw error;
    }
  }
  const grupo = pedidos.grupo !== null && grupos.some((g) => Number(g.grupo_id) === pedidos.grupo)
    ? pedidos.grupo
    : null;

  const filtros: FiltrosRankingTipo = { ...pedidos, federacion, temporada, edicion, grupo };
  const porDefecto: FiltrosRankingTipo = {
    federacion: federacionDefecto, temporada: temporadaDefecto, tipo: 'goles',
    edicion: null, grupo: null, minimoPartidos: MINIMO_PARTIDOS_POR_DEFECTO, desplazamiento: 0,
  };
  const etiquetaTipo = TIPOS_RANKING.find((t) => t.valor === filtros.tipo)?.etiqueta ?? 'Goleadores';
  const contexto = `${etiquetaTipo} · ${federacionNombre ?? 'todas las federaciones'}${temporada ? ` · ${temporada}` : ''}`;

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Rankings</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Rankings</h1>
        <nav aria-label="Tipo de ranking"
          className="flex w-fit gap-1 rounded-[var(--radius-lg)] bg-[var(--fondo-sutil)] p-[3px]">
          {TIPOS_RANKING.map((tipo) => {
            const activa = filtros.tipo === tipo.valor;
            return (
              <Link key={tipo.valor}
                href={urlDeRanking({ ...filtros, tipo: tipo.valor, desplazamiento: 0 }) as Route}
                aria-current={activa ? 'page' : undefined}
                className={`inline-flex h-11 items-center rounded-[var(--radius-md)] px-3.5 text-tabla font-semibold ${
                  activa
                    ? 'bg-[var(--fondo-elevado)] text-[var(--texto)]'
                    : 'text-[var(--texto-suave)] hover:text-[var(--texto)]'
                }`}>
                {tipo.etiqueta}
              </Link>
            );
          })}
        </nav>
      </div>

      <FiltrosRanking filtros={filtros} opciones={opciones} ediciones={ediciones} grupos={grupos} porDefecto={porDefecto} />

      {aviso && (
        <p role="status" className="m-0 text-nota text-[var(--texto-suave)]">{aviso}</p>
      )}

      <Suspense fallback={<EsqueletoTabla filas={8} />}>
        <Contenido filtros={filtros} contexto={contexto} />
      </Suspense>
    </div>
  );
}

/** La tabla. Una sola consulta: una página de 25 filas como mucho. */
async function Contenido({ filtros, contexto }: { filtros: FiltrosRankingTipo; contexto: string }) {
  let filas: FilaRankingJugador[] = [];
  try {
    filas = await consulta<FilaRankingJugador>(RANKING_DE_JUGADORES.sql,
      parametrosDeRanking(filtros, TAMANO_PAGINA_RANKING),
      { presupuestoMs: RANKING_DE_JUGADORES.presupuestoMs });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Rankings" motivo={error.message} />;
    throw error;
  }

  if (filas.length === 0) {
    const titulo = filtros.tipo === 'goles' ? 'Sin goleadores' : 'Sin tarjetas';
    return (
      <SinResultados titulo={titulo} quitarHref={RUTA_RANKINGS}>
        No hay jugadores con estos filtros.{filtros.minimoPartidos > 0 ? ' Prueba a bajar el mínimo de partidos.' : ''}
      </SinResultados>
    );
  }

  const total = Number(filas[0]?.total ?? 0);
  const anterior = filtros.desplazamiento > 0
    ? urlDeRanking(filtros, { desplazamiento: Math.max(0, filtros.desplazamiento - TAMANO_PAGINA_RANKING) })
    : null;
  const siguiente = filtros.desplazamiento + TAMANO_PAGINA_RANKING < total
    ? urlDeRanking(filtros, { desplazamiento: filtros.desplazamiento + TAMANO_PAGINA_RANKING })
    : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <section className={TARJETA} aria-label={contexto}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
          <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">{contexto}</h2>
          <p className="m-0 text-nota text-[var(--texto-suave)]">
            {numero(total)} {total === 1 ? 'jugador' : 'jugadores'}
          </p>
        </div>
        <TablaRanking filas={filas} tipo={filtros.tipo} contexto={contexto} />
      </section>
      <PaginacionRanking
        total={total}
        desplazamiento={filtros.desplazamiento}
        tamano={TAMANO_PAGINA_RANKING}
        anterior={anterior}
        siguiente={siguiente}
      />
    </div>
  );
}
