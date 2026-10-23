import type { Consulta } from './contratos';

/**
 * Lo que cambia según la federación (migración 0038). La web NO decide por código de federación: pide los
 * avisos de la página y la ficha de la federación, y pinta lo que vuelve.
 *
 * Dónde se usan:
 *   · avisos-de-datos(federación, edición) → cabecera de competición, equipo, jugador (por temporada) y acta.
 *     Nivel 'limite' = banda visible arriba («La competición no apunta los cambios…»); 'nota' = texto pequeño
 *     junto al dato afectado o en «Sobre estos datos».
 *   · ficha-federacion(federación) → tarjeta «Qué datos hay» en la página de la federación y en el selector de
 *     federaciones del ojeo y del comparador (para no comparar a ciegas una liga completa con una de base).
 * Las dos leen tablas pequeñas y se cachean por la etiqueta `federacion:<codigo>` (cache.ts).
 */

export type FilaAvisoDatos = { codigo: string; nivel: 'limite' | 'nota'; texto: string };

/** Parámetros: (1) código de federación, (2) id de edición o null (página de la federación). */
export const AVISOS_DE_DATOS: Consulta<FilaAvisoDatos> = {
  nombre: 'avisos-de-datos',
  descripcion: 'Avisos de qué datos faltan o se tratan distinto en esta federación y competición.',
  plan: 'indexado',
  presupuestoMs: 50,
  columnas: ['codigo', 'nivel', 'texto'],
  sql: `select codigo, nivel, texto from analytics.avisos_de_datos($1, $2::bigint)`,
};

export type FilaFichaFederacion = {
  codigo: string; nombre_corto: string; comunidad: string; federacion_madre: string | null; plataforma: string;
  codigo_jugador: boolean | null; varios_arbitros: boolean | null; posiciones_desde: string | null; sistema_juego: boolean | null;
  capitan: boolean | null; medido_en: string | null; temporada: string | null; ediciones: number | null; partidos: number | null;
  pct_resultado: number | null; pct_alineacion: number | null; pct_cambios: number | null; pct_tarjetas: number | null;
  pct_minuto_gol: number | null; pct_posicion: number | null; ediciones_completas: number | null;
  ediciones_alineaciones: number | null; ediciones_solo_resultados: number | null;
};

/** Parámetros: (1) código de federación o null (todas, para el selector). */
export const FICHA_FEDERACION: Consulta<FilaFichaFederacion> = {
  nombre: 'ficha-federacion',
  descripcion: 'Perfil de la fuente de cada federación y lo medido en su temporada más reciente.',
  plan: 'agregado',
  // La vista calcula, por federación, lo medido en su última temporada (lateral sobre 12.700 ediciones):
  // 0,17 s medidos el 23/10/2026. Se cachea por etiqueta `federacion:<codigo>`; el tope refleja el coste.
  presupuestoMs: 300,
  columnas: ['codigo', 'nombre_corto', 'comunidad', 'federacion_madre', 'plataforma', 'codigo_jugador', 'varios_arbitros',
    'posiciones_desde', 'sistema_juego', 'capitan', 'medido_en', 'temporada', 'ediciones', 'partidos', 'pct_resultado',
    'pct_alineacion', 'pct_cambios', 'pct_tarjetas', 'pct_minuto_gol', 'pct_posicion', 'ediciones_completas',
    'ediciones_alineaciones', 'ediciones_solo_resultados'],
  sql: `
    select codigo, nombre_corto, comunidad, federacion_madre, plataforma, codigo_jugador, varios_arbitros, posiciones_desde,
           sistema_juego, capitan, medido_en::text, temporada, ediciones::int, partidos::int, pct_resultado, pct_alineacion,
           pct_cambios, pct_tarjetas, pct_minuto_gol, pct_posicion, ediciones_completas::int, ediciones_alineaciones::int,
           ediciones_solo_resultados::int
      from analytics.federacion_ficha
     where $1::text is null or codigo = $1
     order by comunidad, federacion_madre nulls first, nombre_corto`,
};

export type FilaEstadoSeccion = { seccion: string; estado: 'ok' | 'sin_datos' | 'pronto' | 'pendiente' | 'no_publica'; mensaje: string | null; fecha: string | null };

/**
 * Estados de página (0044). En competición y grupo: calendario, resultados, clasificacion, alineaciones,
 * goleadores, minutos, tarjetas, arbitros, campos. Si `estado` no es 'ok', la página pinta en el sitio de la
 * sección la tarjeta de estado con `mensaje` (ESTADOS-VACIOS.md), nunca una tabla vacía.
 * Parámetros: (1) id de edición, (2) id de grupo o null (toda la edición).
 */
export const ESTADO_SECCIONES: Consulta<FilaEstadoSeccion> = {
  nombre: 'estado-secciones',
  descripcion: 'Qué secciones de la competición o el grupo tienen datos y, si no, por qué (sin calendario, pronto, pendiente, no lo publica).',
  plan: 'indexado',
  presupuestoMs: 60,
  columnas: ['seccion', 'estado', 'mensaje', 'fecha'],
  sql: `select seccion, estado, mensaje, fecha::text from analytics.estado_secciones($1::bigint, $2::bigint)`,
};

/** Igual para la página de equipo (plantilla, partidos, clasificacion, goleadores, minutos, tarjetas). Parámetro: (1) id de team_entry. */
export const ESTADO_SECCIONES_EQUIPO: Consulta<FilaEstadoSeccion> = {
  nombre: 'estado-secciones-equipo',
  descripcion: 'Qué secciones de la página de equipo tienen datos y, si no, por qué.',
  plan: 'indexado',
  presupuestoMs: 60,
  columnas: ['seccion', 'estado', 'mensaje', 'fecha'],
  sql: `select seccion, estado, mensaje, fecha::text from analytics.estado_secciones_equipo($1::bigint)`,
};

export const PARAMETROS_FEDERACIONES: Record<string, readonly unknown[]> = {
  'avisos-de-datos': ['cataluna', null],
  'ficha-federacion': [null],
  'estado-secciones': [1, null],
  'estado-secciones-equipo': [1],
};

export const CONSULTAS_FEDERACIONES = [AVISOS_DE_DATOS, FICHA_FEDERACION, ESTADO_SECCIONES, ESTADO_SECCIONES_EQUIPO] as const;
