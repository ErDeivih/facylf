import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CLASIFICACION_DE_LA_PANTALLA, EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID, GRUPOS_DE_LA_EDICION,
  type FilaClasificacionPantalla, type FilaEdicionDeLaCompeticion, type FilaGrupoDeLaEdicion, type FilaPortadaGrupo,
} from '@/consultas/competiciones';
import { RACHAS_DEL_GRUPO, type FilaRachaGrupo } from '@/consultas/analisis';
import { RANKING_GOLEADORES, ZONAS_DEL_GRUPO, type FilaRanking, type FilaZonas } from '@/consultas/paneles';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CabeceraCompeticion } from '@/componentes/competicion/CabeceraCompeticion';
import { Clasificacion } from '@/componentes/competicion/Clasificacion';
import { Goleadores } from '@/componentes/competicion/Goleadores';
import { Jornada } from '@/componentes/competicion/Jornada';
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
 */
export const revalidate = 60;

/** Un id de la URL sólo vale si es un entero positivo; cualquier otra cosa es una página que no existe. */
function idDeGrupo(crudo: string | undefined): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

export default async function PantallaCompeticion({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jornada?: string }>;
}) {
  const { id: idCrudo } = await params;
  const { jornada: jornadaPedida } = await searchParams;
  const id = idDeGrupo(idCrudo);
  if (Number.isNaN(id)) notFound();

  let portada: FilaPortadaGrupo | undefined;
  try {
    portada = (await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]))[0];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competición" motivo={error.message} />;
    }
    throw error;
  }
  if (!portada) notFound();
  const grupo = portada;

  // Todo lo demás se lee en UNA sola foto del canónico: así la tabla, la forma, la jornada y los
  // goleadores no se contradicen si el importador escribe justo en ese momento.
  let clasificacion: FilaClasificacionPantalla[] = [];
  let rachas: FilaRachaGrupo[] = [];
  let zonas: FilaZonas[] = [];
  let goleadores: FilaRanking[] = [];
  let partidos: FilaPartidoCanonico[] = [];
  let hermanos: FilaGrupoDeLaEdicion[] = [];
  let temporadas: FilaEdicionDeLaCompeticion[] = [];
  try {
    const [c, r, z, g, p, h, t] = await consultaEnUnaFoto([
      { sql: CLASIFICACION_DE_LA_PANTALLA.sql, parametros: [grupo.grupo_id] },
      { sql: RACHAS_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      { sql: ZONAS_DEL_GRUPO.sql, parametros: [grupo.grupo_id] },
      {
        sql: RANKING_GOLEADORES.sql,
        parametros: [grupo.federacion, grupo.temporada, null, null, grupo.grupo_id, 1, 8],
      },
      { sql: PARTIDOS_DE_GRUPO.sql, parametros: [grupo.federacion, grupo.grupo_codigo, 400] },
      { sql: GRUPOS_DE_LA_EDICION.sql, parametros: [grupo.edicion_id] },
      { sql: EDICIONES_DE_LA_COMPETICION.sql, parametros: [grupo.grupo_id] },
    ]);
    clasificacion = c as unknown as FilaClasificacionPantalla[];
    rachas = r as unknown as FilaRachaGrupo[];
    zonas = z as unknown as FilaZonas[];
    goleadores = g as unknown as FilaRanking[];
    partidos = p as unknown as FilaPartidoCanonico[];
    hermanos = h as unknown as FilaGrupoDeLaEdicion[];
    temporadas = t as unknown as FilaEdicionDeLaCompeticion[];
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return <SinCanonico titulo="Competición" motivo={error.message} />;
    }
    throw error;
  }

  const rachasPorEquipo = new Map(rachas.map((r) => [r.team_entry_id, r.ultimos5]));
  const zone = zonas[0]
    ? {
      ascensos: zonas[0].ascensos, promocion: zonas[0].promocion, descensos: zonas[0].descensos,
      promocion_permanencia: zonas[0].promocion_permanencia, origen: zonas[0].origen,
      confianza: zonas[0].confianza, temporadas: zonas[0].temporadas,
    }
    : null;

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

  // Extremos de la temporada para la barra: la primera y la última fecha publicadas del grupo.
  const fechas = partidos.map((p) => p.fecha).filter((f): f is string => Boolean(f)).sort();
  const fechaInicio = fechas.at(0) ?? null;
  const fechaFin = fechas.at(-1) ?? null;

  const equipos = grupo.equipos || clasificacion.length;
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-[18px]">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-[13px] text-[var(--texto-suave)]">
        <Link className="hover:underline" href={`/federaciones?federacion=${grupo.federacion}` as Route}>
          {grupo.federacion_nombre}
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
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
      />

      <div className="flex flex-wrap items-start gap-[18px]">
        <Clasificacion filas={clasificacion} rachas={rachasPorEquipo} zonas={zone} equipos={equipos} />
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px]">
          <Jornada
            numero={jornada}
            partidos={partidosDeLaJornada}
            hrefAnterior={anterior === null ? null : conJornada(anterior)}
            hrefSiguiente={siguiente === null ? null : conJornada(siguiente)}
          />
          <Goleadores filas={goleadores} />
        </aside>
      </div>
    </div>
  );
}
