import { cache, Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION,
  type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import {
  EVENTOS_DEL_GRUPO, GOLEADORES_DE_ESTADISTICAS,
  type EventosDelGrupo, type FilaEventosDelGrupo, type FilaGoleadorEstadisticas,
} from '@/consultas/estadisticas';
import { SinCanonico } from '@/componentes/SinCanonico';
import { Cifras } from '@/componentes/estadisticas/Cifras';
import { EsqueletoEstadisticas, SinDatos } from '@/componentes/estadisticas/Estados';
import { BarraReparto, GraficoBarras, GraficoLineas } from '@/componentes/estadisticas/Graficos';
import {
  EnlacesDeApoyo, ListaGoleadores, TablaCasaFuera, TablaDisciplina, TablaForma,
} from '@/componentes/estadisticas/Tablas';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { MigaCompeticion } from '@/componentes/competicion/MigaCompeticion';
import {
  agregaResumenDePartidos, casaFueraPorEquipo, conclusionDeGoleadores, conclusionDePuntos,
  conclusionDeResultados, conclusionDeTramos, decimal, golesPorPartido, goleadoresConAcumulado,
  idDeGrupoDeUrl, numero, porcentaje, puntosPorJornada, repartoDeResultados, temporadasParaCabecera,
  tituloDeEstadisticasGrupo, tramosCompletos, ultimosResultados,
} from '@/lib/estadisticas';
import { enVentana } from '@/lib/temporadas';

/**
 * Estadísticas de una competición (WALL objetivo 5): los gráficos del grupo con datos reales.
 *
 * Tres bloques, tres consultas (los partidos del grupo, los eventos agregados y los goleadores), sin
 * ninguna consulta por equipo ni por jornada. Los puntos acumulados, el casa/fuera y la forma se
 * calculan en el servidor a partir de los partidos ya publicados: no hay una tabla de hechos que
 * recorrer para eso.
 *
 * Sirve también para grupos históricos (30665, 2016-17): la temporada de la competición se conserva en
 * el desplegable de la cabecera aunque quede fuera de la ventana general, y lo que no está publicado
 * —las tarjetas de ese grupo— se dice, no se rellena con ceros.
 */
export const revalidate = 60;

const portadaDe = cache(async (id: number): Promise<FilaPortadaGrupo | undefined> => {
  const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
  return fila;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: idCrudo } = await params;
  const id = idDeGrupoDeUrl(idCrudo);
  if (id === null) return {};
  try {
    const portada = await portadaDe(id);
    return portada ? { title: tituloDeEstadisticasGrupo(portada) } : {};
  } catch {
    return {};
  }
}

export default async function PantallaEstadisticasCompeticion({ params }: { params: Promise<{ id: string }> }) {
  const { id: idCrudo } = await params;
  const id = idDeGrupoDeUrl(idCrudo);
  if (id === null) notFound();

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
      // La temporada que se está viendo se conserva aunque sea histórica (grupo 30665, 2016-17).
      temporadas = temporadasParaCabecera(
        t as unknown as FilaEdicionDeLaCompeticion[], portada.temporada, enVentana,
      );
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Estadísticas" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;
  /*
   * La cabecera todavía no tiene la pestaña «Estadísticas» (la integra la coordinación). El valor de
   * `activa` se pasa ya con el nombre definitivo para que, en cuanto exista la pestaña, quede marcada
   * sin tocar esta página; mientras tanto, ninguna pestaña aparece activa (mejor eso que marcar otra).
   */
  const activa = 'estadisticas' as unknown as 'jornadas';

  return (
    <div className="flex flex-col gap-[18px]">
      <MigaCompeticion grupo={grupo} tramos={[{ texto: 'Estadísticas' }]} />
      <CabeceraCompeticion
        grupo={grupo}
        grupos={hermanos}
        temporadas={temporadas}
        rutaBase={`/explorar/competicion/${grupo.grupo_id}`}
        fechaInicio={grupo.fecha_inicio}
        fechaFin={grupo.fecha_fin}
        activa={activa}
      />
      <Suspense fallback={<EsqueletoEstadisticas />}>
        <Contenido grupo={grupo} />
      </Suspense>
    </div>
  );
}

/** Los tres bloques del grupo: partidos (cuentas), eventos (goles por tramo y tarjetas) y goleadores. */
async function Contenido({ grupo }: { grupo: FilaPortadaGrupo }) {
  let partidos: FilaPartidoCanonico[] = [];
  let eventos: EventosDelGrupo = { tramos: [], tarjetas: [] };
  let goleadores: FilaGoleadorEstadisticas[] = [];
  try {
    const [p, e, g] = await consultaEnUnaFoto([
      { sql: PARTIDOS_DE_GRUPO.sql, parametros: [grupo.federacion, grupo.grupo_codigo, 1000] },
      { sql: EVENTOS_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      {
        sql: GOLEADORES_DE_ESTADISTICAS.sql,
        parametros: [grupo.federacion, grupo.temporada, grupo.grupo_id, 1, 10],
      },
    ]);
    partidos = p as unknown as FilaPartidoCanonico[];
    eventos = (e as unknown as FilaEventosDelGrupo[])[0]?.datos ?? eventos;
    goleadores = g as unknown as FilaGoleadorEstadisticas[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Estadísticas" motivo={error.message} />;
    }
    throw error;
  }

  if (partidos.length === 0) {
    return <SinDatos titulo="Sin datos">Sin partidos publicados.</SinDatos>;
  }

  const resumen = agregaResumenDePartidos(partidos);
  const puntos = puntosPorJornada(partidos);
  const casaFuera = casaFueraPorEquipo(partidos);
  const formas = ultimosResultados(partidos);
  const tramos = tramosCompletos(eventos.tramos);
  const goleadoresAcumulados = goleadoresConAcumulado(goleadores, resumen.goles);
  const totalTramos = tramos.reduce((suma, tramo) => suma + tramo.goles, 0);
  const reparto = repartoDeResultados(resumen);
  const clases: Record<string, string> = {
    local: 'bg-[var(--accion)]',
    empate: 'bg-[var(--texto-tenue)]',
    visitante: 'bg-[var(--zona-fase-ascenso)]',
  };
  const partes = reparto.map((parte) => ({ ...parte, clase: clases[parte.clave]! }));
  const lider = puntos.equipos[0] ?? null;

  const cifras = [
    { etiqueta: 'Partidos', valor: numero(resumen.con_resultado), nota: `de ${numero(resumen.partidos)} publicados` },
    { etiqueta: 'Goles', valor: numero(resumen.goles), nota: `${decimal(golesPorPartido(resumen))} por partido` },
    {
      etiqueta: 'Resultado',
      valor: porcentaje(resumen.local, resumen.con_resultado) === null
        ? '—' : `${porcentaje(resumen.local, resumen.con_resultado)} %`,
      nota: `${porcentaje(resumen.empate, resumen.con_resultado) ?? '—'} % empate · ${porcentaje(resumen.visitante, resumen.con_resultado) ?? '—'} % visitante`,
    },
    {
      etiqueta: 'Actas',
      valor: porcentaje(resumen.actas_correctas, resumen.actas) === null ? '—' : `${porcentaje(resumen.actas_correctas, resumen.actas)} %`,
      nota: `${numero(resumen.actas)} con acta`,
    },
  ];

  const series = puntos.equipos.map((equipo, indice) => ({
    nombre: equipo.nombre,
    valores: equipo.puntos,
    destacada: indice === 0,
  }));
  const tableHeaders = ['Equipo', ...puntos.jornadas.map((jornada) => `J${jornada}`), 'Total'];
  const tableRows = puntos.equipos.map((equipo) => [
    equipo.nombre,
    ...equipo.puntos.map((valor) => String(valor)),
    String(equipo.total),
  ]);
  const filasForma = casaFuera.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    forma: formas.get(fila.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-[18px]">
      <Cifras cifras={cifras} />

      <BarraReparto
        id="resultados"
        titulo={conclusionDeResultados(resumen)}
        subtitulo="Reparto de resultados de los partidos con marcador"
        resumen={`Reparto de resultados: ${partes.map((parte) => `${parte.etiqueta} ${parte.porcentaje} %`).join(', ')}`}
        partes={partes}
      />

      {puntos.jornadas.length > 0 && (
        <GraficoLineas
          id="puntos-por-jornada"
          titulo={conclusionDePuntos(puntos.equipos, puntos.jornadas.length)}
          subtitulo={lider !== null ? 'Puntos acumulados por jornada · el líder en color, el resto del grupo en gris' : 'Puntos acumulados por jornada'}
          resumen={`Puntos por jornada: ${puntos.equipos.slice(0, 6).map((equipo) => `${equipo.nombre} ${equipo.total}`).join('; ')}`}
          etiquetasX={puntos.jornadas.map((jornada) => String(jornada))}
          series={series}
          leyenda={[
            { etiqueta: lider?.nombre ?? 'Líder', color: 'var(--accion)' },
            { etiqueta: 'Resto del grupo', color: 'var(--borde-fuerte)' },
          ]}
          tableHeaders={tableHeaders}
          tableRows={tableRows}
        />
      )}

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
        <ListaGoleadores filas={goleadoresAcumulados} golesDelAmbito={resumen.goles}
          titulo={conclusionDeGoleadores(goleadoresAcumulados, resumen.goles)} />
        <TablaDisciplina filas={eventos.tarjetas} />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <TablaCasaFuera filas={casaFuera} />
        <TablaForma filas={filasForma} />
      </div>

      <EnlacesDeApoyo enlaces={[
        { texto: 'Clasificación', href: `/explorar/competicion/${grupo.grupo_id}` },
        { texto: 'Calendario', href: `/explorar/competicion/${grupo.grupo_id}/calendario` },
        { texto: 'Jornadas', href: `/explorar/competicion/${grupo.grupo_id}/jornadas` },
      ]} />
    </div>
  );
}
