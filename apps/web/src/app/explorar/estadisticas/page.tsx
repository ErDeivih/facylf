import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import {
  GOLEADORES_DE_ESTADISTICAS, OPCIONES_DE_ESTADISTICAS, RESUMEN_DE_ESTADISTICAS,
  type FilaGoleadorEstadisticas, type FilaOpcionesEstadisticas, type ResumenEstadisticas,
} from '@/consultas/estadisticas';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '@/consultas/catalogo-selector';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Cifras } from '@/componentes/estadisticas/Cifras';
import { EsqueletoEstadisticas, SinDatos } from '@/componentes/estadisticas/Estados';
import { FiltrosEstadisticas } from '@/componentes/estadisticas/FiltrosEstadisticas';
import { BarraReparto, GraficoBarras } from '@/componentes/estadisticas/Graficos';
import { ListaCompeticiones } from '@/componentes/estadisticas/ListaCompeticiones';
import { ListaGoleadores, TablaDisciplina } from '@/componentes/estadisticas/Tablas';
import {
  avisoDeFiltroInexistente, conclusionDeGoleadores, conclusionDeMes, conclusionDeResultados, conclusionDeTramos,
  decimal, etiquetaDeMesCorta, FEDERACION_POR_DEFECTO, golesPorMesOrdenados, golesPorPartido,
  goleadoresConAcumulado, leeFiltrosEstadisticas, numero, porcentaje, repartoDeResultados, TITULO_ESTADISTICAS,
  temporadaPorDefecto, tieneFiltrosEstadisticas, tokensDeBusqueda, tramosCompletos,
  type FiltrosEstadisticas as FiltrosEstadisticasTipo,
} from '@/lib/estadisticas';

/**
 * Estadísticas globales (WALL objetivo 5): una federación y una temporada, con sus cifras, resultados,
 * goles por jornada, goles por tramo, goleadores y disciplina.
 *
 * El estado vive en la URL (`fed`, `temp`, `q`). La página abre en Castilla y León y la temporada más
 * reciente publicada; no se inventa una competición ni una temporada que el catálogo no tenga.
 *
 * La búsqueda de competición no filtra las cifras: sirve para saltar a las estadísticas de un grupo
 * concreto, que es donde tienen sentido los puntos por jornada y el casa/fuera.
 */
export const metadata: Metadata = { title: TITULO_ESTADISTICAS };

export default async function PantallaEstadisticas({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leeFiltrosEstadisticas(await searchParams);

  let opciones: FilaOpcionesEstadisticas = { federaciones: null, temporadas: null };
  try {
    const [fila] = await consulta<FilaOpcionesEstadisticas>(OPCIONES_DE_ESTADISTICAS.sql, [],
      { presupuestoMs: OPCIONES_DE_ESTADISTICAS.presupuestoMs });
    opciones = fila ?? opciones;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Estadísticas" motivo={error.message} />;
    }
    throw error;
  }

  const federaciones = opciones.federaciones ?? [];
  const temporadas = (opciones.temporadas ?? []).map((t) => t.etiqueta);
  const federacionPedida = filtros.federacion;
  // Un filtro que no existe en el catálogo se ignora; el defecto de la plataforma es Castilla y León.
  const federacion = federacionPedida !== null && federaciones.some((f) => f.codigo === federacionPedida)
    ? federacionPedida
    : (federaciones.some((f) => f.codigo === FEDERACION_POR_DEFECTO)
      ? FEDERACION_POR_DEFECTO
      : (federaciones[0]?.codigo ?? null));
  const temporada = temporadaPorDefecto(temporadas, filtros.temporada);
  const aviso = avisoDeFiltroInexistente(filtros, federaciones.map((f) => f.codigo), temporadas);

  return (
    <div className="flex flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={'/' as Route}>Inicio</Link>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]" aria-current="page">Estadísticas</span>
      </nav>
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Estadísticas</h1>
      <FiltrosEstadisticas filtros={filtros} opciones={opciones} federacion={federacion} temporada={temporada} />
      {aviso !== null
        ? (
          <SinDatos titulo="Sin datos">
            {aviso}{' '}
            <Link href={'/explorar/estadisticas' as Route} className="font-semibold text-[var(--accion)] hover:underline">
              Ver la temporada publicada
            </Link>
          </SinDatos>
        )
        : (
          <Suspense fallback={<EsqueletoEstadisticas />}>
            <Contenido federacion={federacion} temporada={temporada} filtros={filtros} />
          </Suspense>
        )}
    </div>
  );
}

/** Las cifras del ámbito y, si se ha buscado, las competiciones que coinciden. */
async function Contenido({ federacion, temporada, filtros }: {
  federacion: string | null;
  temporada: string | null;
  filtros: FiltrosEstadisticasTipo;
}) {
  if (federacion === null || temporada === null) {
    return <SinDatos titulo="Sin datos">No hay federaciones o temporadas publicadas.</SinDatos>;
  }

  let resumen: ResumenEstadisticas | null = null;
  let goleadores: FilaGoleadorEstadisticas[] = [];
  let competiciones: FilaGrupoSelector[] = [];
  try {
    const [resumenFilas, goleadoresFilas] = await Promise.all([
      consulta<{ datos: ResumenEstadisticas | null }>(RESUMEN_DE_ESTADISTICAS.sql, [federacion, temporada],
        { presupuestoMs: RESUMEN_DE_ESTADISTICAS.presupuestoMs }),
      consulta<FilaGoleadorEstadisticas>(GOLEADORES_DE_ESTADISTICAS.sql, [federacion, temporada, null, 1, 10],
        { presupuestoMs: GOLEADORES_DE_ESTADISTICAS.presupuestoMs }),
    ]);
    resumen = resumenFilas[0]?.datos ?? null;
    goleadores = goleadoresFilas;
    if (filtros.texto !== null) {
      const tokens = tokensDeBusqueda(filtros.texto);
      if (tokens.length > 0) {
        competiciones = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
          federacion, temporada, null, null, null, null, null, tokens, 8, 0,
        ], { presupuestoMs: GRUPOS_DEL_SELECTOR.presupuestoMs });
      }
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Estadísticas" motivo={error.message} />;
    }
    throw error;
  }

  if (resumen === null || resumen.resumen.partidos === 0) {
    return (
      <>
        <SinDatos titulo="Sin datos">
          No hay partidos publicados para estos filtros.{' '}
          {tieneFiltrosEstadisticas(filtros) && (
            <Link href={'/explorar/estadisticas' as Route} className="font-semibold text-[var(--accion)] hover:underline">
              Quitar los filtros
            </Link>
          )}
        </SinDatos>
        {filtros.texto !== null && <ListaCompeticiones filas={competiciones} texto={filtros.texto} />}
      </>
    );
  }

  const r = resumen.resumen;
  const conResultado = r.con_resultado;
  const cifras = [
    { etiqueta: 'Partidos', valor: numero(r.con_resultado), nota: `de ${numero(r.partidos)} publicados` },
    { etiqueta: 'Goles', valor: numero(r.goles), nota: `${decimal(golesPorPartido(r))} por partido` },
    {
      etiqueta: 'Resultado',
      valor: porcentaje(r.local, conResultado) === null ? '—' : `${porcentaje(r.local, conResultado)} %`,
      nota: `${porcentaje(r.empate, conResultado) ?? '—'} % empate · ${porcentaje(r.visitante, conResultado) ?? '—'} % visitante`,
    },
    { etiqueta: 'Actas', valor: porcentaje(r.actas_correctas, r.actas) === null ? '—' : `${porcentaje(r.actas_correctas, r.actas)} %`, nota: `${numero(r.actas)} con acta` },
  ];

  const reparto = repartoDeResultados(r);
  const clases: Record<string, string> = {
    local: 'bg-[var(--accion)]',
    empate: 'bg-[var(--texto-tenue)]',
    visitante: 'bg-[var(--zona-fase-ascenso)]',
  };
  const partes = reparto.map((parte) => ({ ...parte, clase: clases[parte.clave]! }));
  const porMes = golesPorMesOrdenados(resumen.por_mes);
  const tramos = tramosCompletos(resumen.tramos);
  const goleadoresAcumulados = goleadoresConAcumulado(goleadores, r.goles);
  const totalTramos = tramos.reduce((suma, tramo) => suma + tramo.goles, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <Cifras cifras={cifras} />

      <BarraReparto
        id="resultados"
        titulo={conclusionDeResultados(r)}
        subtitulo="Reparto de resultados de los partidos con marcador"
        resumen={`Reparto de resultados: ${partes.map((parte) => `${parte.etiqueta} ${parte.porcentaje} %`).join(', ')}`}
        partes={partes}
      />

      <GraficoBarras
        id="goles-por-mes"
        titulo={conclusionDeMes(porMes)}
        subtitulo="Goles por mes del calendario"
        resumen={`Goles por mes: ${porMes.map((mes) => `${etiquetaDeMesCorta(mes.mes)}, ${mes.goles} goles`).join('; ')}`}
        datos={porMes.map((mes) => ({
          etiqueta: etiquetaDeMesCorta(mes.mes),
          valor: mes.goles,
          titulo: `${mes.mes}: ${mes.goles} goles en ${mes.partidos} partidos`,
        }))}
        tableHeaders={['Mes', 'Partidos', 'Goles']}
        tableRows={porMes.map((mes) => [mes.mes, String(mes.partidos), String(mes.goles)])}
      />

      <GraficoBarras
        id="goles-por-tramo"
        titulo={conclusionDeTramos(tramos)}
        subtitulo="Goles por tramo de quince minutos"
        resumen={`Goles por tramo: ${tramos.map((tramo) => `${tramo.etiqueta}, ${tramo.goles} goles`).join('; ')}`}
        datos={tramos.map((tramo) => ({
          etiqueta: tramo.etiqueta,
          valor: tramo.goles,
          titulo: `${tramo.etiqueta}: ${tramo.goles} goles`,
        }))}
        tableHeaders={['Tramo', 'Goles', '% del total']}
        tableRows={tramos.map((tramo) => [
          tramo.etiqueta,
          String(tramo.goles),
          totalTramos > 0 ? `${Math.round((100 * tramo.goles) / totalTramos)} %` : '—',
        ])}
      />

      <div className="grid gap-[18px] lg:grid-cols-2">
        <ListaGoleadores filas={goleadoresAcumulados} golesDelAmbito={r.goles} mostrarAcumulado={false} />
        <TablaDisciplina filas={resumen.tarjetas.slice(0, 8)} />
      </div>

      {filtros.texto !== null && <ListaCompeticiones filas={competiciones} texto={filtros.texto} />}
    </div>
  );
}
