import { cache, Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CALIDAD_DEL_GRUPO, CLASIFICACION_CALCULADA, CLASIFICACION_POR_CONDICION, FRESCURA_DEL_GRUPO, EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION,
  type FilaClasificacionPantalla, type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { ARRASTRES_DEL_GRUPO, RANKING_GOLEADORES, ZONAS_DEL_GRUPO, type FilaArrastre, type FilaRanking, type FilaZonas } from '@/consultas/paneles';
import { PROXIMA_JORNADA_DEL_GRUPO, type FilaCruceDelGrupo } from '@/consultas/evolucion';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { Clasificacion } from '@/componentes/competicion/Clasificacion';
import { EsqueletoContenido } from '@/componentes/competicion/EsqueletoContenido';
import { Goleadores } from '@/componentes/competicion/Goleadores';
import { UltimoYProximo } from '@/componentes/competicion/UltimoYProximo';
import { Jornada } from '@/componentes/competicion/Jornada';
import { CrucesPrevistos } from '@/componentes/partidos/CrucesPrevistos';
import { etiquetaZona, formaHasta, temporadasPublicables, tituloDeCompeticion, zonaDe } from '@/lib/pantalla-competicion';
import { descensosDirectos } from '@/lib/reglamento';
import { decimal2 } from '@/lib/formato';
import { IndicadoresGrupo } from '@/componentes/competicion/IndicadoresGrupo';
import { fechaUltimaJugadaDePartidos, fechaUltimaJugadaDePortada } from '@/lib/jornadas';
import { rutaDeActa, tieneActa } from '@/lib/acta';
import { etiquetaCategoria, etiquetaDivision } from '@/lib/vocabulario-pantalla';

/**
 * Pantalla 2 del prototipo: competición, clasificación y jornada. Datos reales del canónico.
 *
 * La ruta lleva el id del grupo (`core.phase_group.id`) porque es lo único que identifica una pantalla
 * de competición sin depender de los slugs de la web vieja. Vive en `/explorar/...` mientras la web
 * vieja siga sirviendo `/competicion/[slug]` (se retira en W9 del encargo de la web).
 *
 * Reglas que aplica la página, no la consulta:
 *  · un `null` no se convierte en cero, y un partido sin marcador se pinta «—»;
 *  · el nombre de un menor de edad no se publica;
 *  · lo que no está proyectado o no está publicado se dice, no se rellena.
 *
 * La suspensión va DENTRO de la página, por debajo de la validación del id: así la cabecera se envía
 * mientras se resuelven la tabla y la jornada, pero un id inexistente sigue siendo un 404 de verdad.
 * No hay `loading.tsx` de ruta: un límite por encima de la validación convertiría el 404 en un 200 con
 * cuerpo de 404 (SISTEMA-DISENO §5).
 */
export const revalidate = 60;

/** Un id de la URL sólo vale si es un entero positivo; cualquier otra cosa es una página que no existe. */
function idDeGrupo(crudo: string | undefined): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/**
 * Portada de un grupo, cacheada por React: la comparten `generateMetadata` y la página para no pedir la
 * misma fila dos veces en la misma petición.
 */
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
    return portada ? { title: tituloDeCompeticion(portada) } : {};
  } catch {
    // Sin canónico la página ya enseña su estado de error; el título por defecto del sitio vale.
    return {};
  }
}

export default async function PantallaCompeticion({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jornada?: string; vista?: string }>;
}) {
  const { id: idCrudo } = await params;
  const { jornada: jornadaPedida, vista } = await searchParams;
  const id = idDeGrupo(idCrudo);
  if (Number.isNaN(id)) notFound();

  // 1. Validación + portada: sin esto no hay página (ni 404 correcto ni cabecera que enseñar).
  let portada: FilaPortadaGrupo | undefined;
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  let partidos: FilaPartidoCanonico[] = [];
  try {
    portada = await portadaDe(id);
    if (portada) {
      // Los desplegables de la cabecera y los partidos van arriba: la fecha derecha de la barra es la
      // de la última jornada JUGADA y hay que saberla antes de pintar la cabecera.
      const [h, t, p] = await consultaEnUnaFoto([
        { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [portada.edicion_id] },
        { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [portada.grupo_id] },
        { sql: PARTIDOS_DE_GRUPO.sql, parametros: [portada.federacion, portada.grupo_codigo, 400] },
      ]);
      hermanos = h as unknown as FilaGrupoDeLaEdicion[];
      // El desplegable no ofrece temporadas que el pie declara no publicadas (hallazgo I9 del QA).
      temporadas = temporadasPublicables(t as unknown as FilaEdicionDeLaCompeticion[], undefined, portada?.edicion_id);
      partidos = p as unknown as FilaPartidoCanonico[];
    }
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competición" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;
  const ruta = `/explorar/competicion/${grupo.grupo_id}`;
  const fechaUltimaJugada = fechaUltimaJugadaDePortada(grupo) ?? fechaUltimaJugadaDePartidos(partidos);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link className="hover:underline" href={`/federaciones?federacion=${grupo.federacion}` as Route}>
          {grupo.federacion_corta ?? grupo.federacion_nombre}
        </Link>
        <span aria-hidden="true">›</span>
        <span>{etiquetaCategoria(grupo.categoria)}</span>
        <span aria-hidden="true">›</span>
        <span>{grupo.division !== 'desconocida' ? etiquetaDivision(grupo.division) : grupo.edicion}</span>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--texto)]">{grupo.grupo}</span>
      </nav>

      <CabeceraCompeticion
        grupo={grupo}
        grupos={hermanos}
        temporadas={temporadas}
        rutaBase={ruta}
        fechaInicio={grupo.fecha_inicio}
        fechaFin={grupo.fecha_fin}
        fechaUltimaJugada={fechaUltimaJugada}
      />

      <Suspense fallback={<EsqueletoContenido filas={Math.max(1, grupo.equipos)} />}>
        <Contenido grupo={grupo} jornadaPedida={jornadaPedida} partidos={partidos} vista={vista} hermanos={hermanos} />
      </Suspense>
    </div>
  );
}

/**
 * Todo lo que va debajo de la cabecera. Se lee en UNA sola foto del canónico: así la tabla, la forma, la
 * jornada y los goleadores no se contradicen si el importador escribe justo en ese momento.
 */
async function Contenido({ grupo, jornadaPedida, partidos, vista, hermanos }: {
  grupo: FilaPortadaGrupo;
  jornadaPedida: string | undefined;
  vista: string | undefined;
  hermanos: readonly FilaGrupoDeLaEdicion[];
  /** Los partidos ya se pidieron arriba: los necesita la fecha de la barra y la forma de la tabla. */
  partidos: readonly FilaPartidoCanonico[];
}) {
  let clasificacion: FilaClasificacionPantalla[] = [];
  let zonas: FilaZonas[] = [];
  let goleadores: FilaRanking[] = [];
  let arrastres: FilaArrastre[] = [];
  let frescura: { con_resultado: number; partidos: number; actas: number; ultimo: string | null } | null = null;
  let calidad: {
    partidos: number; con_resultado: number; con_acta: number; actas: number; goles: number;
    victorias_local: number; empates: number; victorias_visitante: number; equipos: number;
    suma_pj: number; descuadre_pj: number; descuadre_puntos: number; descuadre_goles: number;
  } | null = null;
  try {
    const [c, z, g, f, k, arr] = await consultaEnUnaFoto([
      { sql: (vista === 'local' || vista === 'fuera') ? CLASIFICACION_POR_CONDICION.sql : CLASIFICACION_CALCULADA.sql, parametros: (vista === 'local' || vista === 'fuera') ? [grupo.grupo_id, vista] : [grupo.grupo_id] },
      { sql: ZONAS_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      {
        sql: RANKING_GOLEADORES.sql,
        parametros: [grupo.federacion, grupo.temporada, null, null, grupo.grupo_id, 1, 8, null, null],
      },
      { sql: FRESCURA_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      { sql: CALIDAD_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      { sql: ARRASTRES_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
    ]);
    clasificacion = c as unknown as FilaClasificacionPantalla[];
    zonas = z as unknown as FilaZonas[];
    goleadores = g as unknown as FilaRanking[];
    frescura = (f as unknown as Array<{ con_resultado: number; partidos: number; actas: number; ultimo: string | null }>)[0] ?? null;
    arrastres = arr as unknown as FilaArrastre[];
    calidad = (k as unknown as Array<{ partidos: number; con_resultado: number; con_acta: number; actas: number; goles: number; victorias_local: number; empates: number; victorias_visitante: number; equipos: number; suma_pj: number; descuadre_pj: number; descuadre_puntos: number; descuadre_goles: number }>)[0] ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competición" motivo={error.message} />;
    }
    throw error;
  }

  // La forma se calcula de los partidos del grupo y se corta en la MISMA jornada que la tabla: la
  // consulta `rachas-del-grupo` cuenta todos los resultados jugados y en una tabla publicada hasta la
  // jornada 2 mezclaba dos coberturas (PJ=2 con cuatro insignias; hallazgo I2 del QA).
  const rachasPorEquipo = new Map(
    clasificacion.map((f) => [f.equipo_id, formaHasta(partidos, f.equipo_id, f.jornada).join('')]),
  );
  const equipos = grupo.equipos || clasificacion.length;
  const directos = descensosDirectos({
    federacion: grupo.federacion, categoria: grupo.categoria, division: grupo.division,
    grupo: grupo.grupo, equipos: equipos,
  });
  const zone = zonas[0]
    ? {
      ascensos: zonas[0].ascensos, promocion: zonas[0].promocion,
      descensos: directos ?? zonas[0].descensos,
      promocion_permanencia: zonas[0].promocion_permanencia,
      origen: directos !== null && directos !== zonas[0].descensos ? 'reglamento' : zonas[0].origen,
      confianza: zonas[0].confianza, temporadas: zonas[0].temporadas,
    }
    : null;

  // Próxima jornada según el calendario previsto (0067). Va aparte: sin esa tabla, o si la consulta
  // falla, la pantalla sigue como estaba.
  let proximaJornada: FilaCruceDelGrupo[] = [];
  try {
    proximaJornada = await consulta<FilaCruceDelGrupo>(PROXIMA_JORNADA_DEL_GRUPO.sql, [grupo.grupo_id],
      { presupuestoMs: PROXIMA_JORNADA_DEL_GRUPO.presupuestoMs });
  } catch { proximaJornada = []; }

  // Jornada que se enseña: la pedida en la URL si existe; si no, la última con resultados.
  const jornadasConPartidos = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  const pedida = Number(jornadaPedida);
  const jornada = Number.isInteger(pedida) && jornadasConPartidos.includes(pedida)
    ? pedida
    : (grupo.jornada_actual ?? jornadasConPartidos.at(-1) ?? null);
  const partidosDeLaJornada = jornada === null ? [] : partidos.filter((p) => p.jornada === jornada);
  const anterior = jornada === null ? null : jornadasConPartidos.filter((n) => n < jornada).at(-1) ?? null;
  const siguiente = jornada === null ? null : jornadasConPartidos.find((n) => n > jornada) ?? null;
  const ruta = `/explorar/competicion/${grupo.grupo_id}`;
  const conJornada = (n: number) => `${ruta}?jornada=${n}`;

  const vistaParcial = vista === 'local' || vista === 'fuera';
  const etiquetasDeZona = new Map<number,string>();
  if (zone && !vistaParcial) {
    for (const f of clasificacion) {
      const z = zonaDe(f.posicion, equipos, zone);
      if (z) etiquetasDeZona.set(f.equipo_id, etiquetaZona(z));
    }
  }
  // ¿La tabla oficial publicada coincide con la calculada? Si está desfasada se dice, y no se publica la oficial.
  const oficialDesfasada = clasificacion.some((f) => f.oficial_jornada != null
    && (f.oficial_jugados !== f.jugados || f.oficial_puntos !== f.puntos));
  // Motivo del «por conciliar»: la tabla oficial publicada es de otra jornada que los resultados.
  const oficialJornada = clasificacion.find((f) => f.oficial_jornada != null)?.oficial_jornada ?? null;
  const jornadaResultados = clasificacion[0]?.jornada ?? null;
  const motivoConciliar = oficialJornada !== null && jornadaResultados !== null && oficialJornada !== jornadaResultados
    ? `la federación publicó su tabla de la jornada ${oficialJornada} y los resultados llegan a la ${jornadaResultados}`
    : 'la tabla oficial publicada no coincide con los resultados';
  let quintos: { grupo: string; equipo: string; puntos: number; jugados: number }[] = [];
  if (!vistaParcial && grupo.categoria === 'juvenil' && grupo.division === 'primera' && grupo.federacion === 'castilla-leon' && hermanos.length === 2 && clasificacion.length >= 5) {
    try {
      const tablas = await Promise.all(hermanos.map(async (h) => ({
        grupo: h.grupo,
        filas: await consulta<FilaClasificacionPantalla>(CLASIFICACION_CALCULADA.sql, [h.grupo_id]),
      })));
      quintos = tablas.map((t) => {
        const quinto = t.filas.length >= 5 ? t.filas[t.filas.length - 5] : null;
        return quinto ? { grupo: t.grupo, equipo: quinto.equipo, puntos: quinto.puntos, jugados: quinto.jugados } : null;
      }).filter((q): q is { grupo: string; equipo: string; puntos: number; jugados: number } => q !== null);
    } catch { quintos = []; }
  }
  const conDatos = quintos.filter((q) => q.jugados > 0);
  const ordenados = conDatos.slice().sort((a, b) => (a.puntos / a.jugados) - (b.puntos / b.jugados));
  const peorQuinto = ordenados.length === 2
    && ordenados[0].puntos / ordenados[0].jugados < ordenados[1].puntos / ordenados[1].jugados
    ? ordenados[0] : null;
  const idsDescenso = new Set(vistaParcial ? [] : clasificacion.filter((f) => zonaDe(f.posicion, equipos, zone) === 'desciende').map((f) => f.equipo_id));
  const arrastresPosibles = arrastres.filter((a) => idsDescenso.has(a.equipo_id));
  const fechaActualizado = frescura && frescura.ultimo
    ? (() => { const d = new Date(frescura.ultimo); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); })()
    : null;
  const jornadasTotales = grupo.jornadas_previstas ?? null;
  const jornadaActual = grupo.jornada_actual ?? null;
  const trozosFrescura = [
    jornadaActual !== null && jornadasTotales !== null ? `J${jornadaActual}/${jornadasTotales}` : null,
    fechaActualizado === null ? null : `actualizado ${fechaActualizado}`,
    frescura === null ? null : `actas ${frescura.actas}/${frescura.con_resultado} (${frescura.con_resultado === 0 ? 0 : Math.round((100 * frescura.actas) / frescura.con_resultado)} %)`,
  ].filter((x): x is string => x !== null);
  const lineaFrescura = trozosFrescura.length ? trozosFrescura.join(' · ') : null;

  // KPIs de la ficha (siempre desde los partidos).
  const kpi = calidad === null || calidad.con_resultado === 0 ? null : {
    golesPorPartido: decimal2(calidad.goles / calidad.con_resultado),
    porcentajeLocal: Math.round((calidad.victorias_local / calidad.con_resultado) * 100),
    porcentajeActas: Math.round((calidad.con_acta / calidad.con_resultado) * 100),
    actas: `${calidad.con_acta}/${calidad.con_resultado}`,
  };
  const descuadres = calidad === null ? null : { pj: calidad.descuadre_pj, puntos: calidad.descuadre_puntos, goles: calidad.descuadre_goles };
  const incoherencia = descuadres !== null
    && (Number(descuadres.pj) !== 0 || Number(descuadres.puntos) !== 0 || Number(descuadres.goles) !== 0);
  return (
    <div className="flex flex-wrap items-start gap-4">
      <UltimoYProximo partidos={partidos} />
      {/* Cobertura, comprobaciones y descarga: siguen aquí, pero plegadas. Lo primero que se ve es la tabla. */}
      <details className="basis-full rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-tabla font-semibold text-[var(--texto)]">
          Datos del grupo{fechaActualizado === null ? '' : ` · actualizado el ${fechaActualizado}`}
        </summary>
        <div className="flex flex-wrap items-start gap-4 border-t border-[var(--fondo-sutil)] px-4 py-3">
          {lineaFrescura && (
            <p className="m-0 basis-full text-nota text-[var(--texto-suave)]">
              {lineaFrescura}
            </p>
          )}
          {kpi && <IndicadoresGrupo {...kpi} />}
          <p className="m-0 basis-full text-nota text-[var(--texto-suave)]">
            <a className="underline decoration-dotted" href={`${ruta}/partidos/descarga`} download>
              Descargar los partidos jugados{frescura === null ? '' : ` (${frescura.con_resultado})`} en CSV
            </a>
          </p>
        </div>
      </details>
      <nav aria-label="Vista de la clasificación" className="flex flex-wrap gap-1.5">
        {[['total','Total'],['local','Casa'],['fuera','Fuera']].map(([clave, texto]) => (
          <Link key={clave} href={`${ruta}${clave === 'total' ? '' : `/${clave}`}` as Route}
            aria-current={((vista ?? 'total') === clave) ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-tabla font-semibold ${((vista ?? 'total') === clave) ? 'border-[var(--accion)] text-[var(--accion)]' : 'border-[var(--borde)] text-[var(--texto-suave)]'}`}>
            {texto}
          </Link>
        ))}
      </nav>
      <Clasificacion filas={clasificacion} rachas={rachasPorEquipo} zonas={vistaParcial ? null : zone} equipos={equipos} hrefFinal={`${ruta}/proyeccion`} />
      {!vistaParcial && arrastresPosibles.length > 0 && (
        <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3">
          <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Posibles arrastres</h2>
          <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">Mismo club con otro equipo en una categoría inferior. Es un candidato, no una plaza confirmada: falta el reglamento y la inscripción.</p>
          <ul className="m-0 mt-2 list-none divide-y divide-[var(--fondo-sutil)] p-0">
            {arrastresPosibles.map((a) => (
              <li key={`${a.equipo_id}-${a.filial_id}`} className="py-1.5 text-tabla text-[var(--texto)]">
                <b>{a.equipo}</b> · {a.filial} <span className="text-nota text-[var(--texto-suave)]">(nivel {a.nivel})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!vistaParcial && quintos.length === 2 && (
        <section className="rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3">
          <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Peor quinto</h2>
          <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">Comparación entre los dos grupos; desciende el peor quinto. Criterio provisional hasta confirmar el reglamento.</p>
          {peorQuinto === null && <p className="m-0 mt-1 text-nota font-semibold text-[var(--texto-suave)]">Sin determinar: empate o faltan partidos.</p>}
          <ul className="m-0 mt-2 list-none divide-y divide-[var(--fondo-sutil)] p-0">
            {quintos.map((q) => (
              <li key={q.grupo} className="flex justify-between gap-2 py-1.5 text-tabla">
                <span className="text-[var(--texto)]">{q.grupo}: <b>{q.equipo}</b></span>
                <span className={peorQuinto?.grupo === q.grupo ? 'font-bold text-[var(--derrota)]' : 'text-[var(--texto-suave)]'}>
                  {q.puntos} pts / {q.jugados} PJ
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        {proximaJornada.length > 0 && (
          <CrucesPrevistos titulo={`Próxima jornada · ${proximaJornada[0].jornada}`} cruces={proximaJornada} />
        )}
        <Jornada
          numero={jornada}
          partidos={partidosDeLaJornada}
          hrefAnterior={anterior === null ? null : conJornada(anterior)}
          hrefSiguiente={siguiente === null ? null : conJornada(siguiente)}
          hrefActa={(partido) => (tieneActa(partido.calidad_acta) ? rutaDeActa(partido.match_id) : null)}
          etiquetas={etiquetasDeZona}
        />
        <Goleadores filas={goleadores} />
      </aside>
    </div>
  );
}
