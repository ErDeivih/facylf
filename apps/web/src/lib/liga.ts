/**
 * Reglas de la página de liga: lo que se calcula fuera del JSX.
 *
 * La página es la del prototipo `Liga`: resultados recientes, cuándo se marcan los goles, minutos de
 * cantera, disciplina por equipo y una clasificación resumida. Los agregados de eventos y tarjetas
 * vienen ya contados de PostgreSQL (`EVENTOS_DEL_GRUPO`, `DISCIPLINA_Y_CANTERA_DEL_GRUPO`); aquí se
 * ordenan, se cruzan y se convierten en algo que se pueda enseñar.
 *
 * Las tres reglas de siempre: un `null` es «no se sabe» y no un cero; un partido sin resultado no
 * cuenta como 0-0; un porcentaje sin denominador no se pinta.
 */
import type { FilaClasificacionPantalla } from '@/consultas/competiciones';
import type { FilaEquipoDeLiga } from '@/consultas/liga';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import type { TramoDeGoles } from '@/consultas/estadisticas';
import { etiquetaDeTramo, tramosCompletos } from './estadisticas';
import { golesDeLaFila, publicaGoles } from './pantalla-competicion';

/** Un tramo del partido con su etiqueta y sus goles, ya completo. */
export type TramoDeLiga = { orden: number; etiqueta: string; goles: number };

/**
 * Los tramos de quince minutos de los goles de la liga. Además de los seis tramos, incluye el tiempo
 * añadido («90+») cuando hay goles ahí y, si el acta no trae minuto, un grupo «sin minuto» al final.
 *
 * El tiempo añadido no se puede esconder: en la liga 797 son 39 goles sobre 743, y un gráfico que los
 * reparte en el último cuarto mentiría sobre cuándo se marcan.
 */
export function tramosDeLiga(tramos: readonly TramoDeGoles[]): TramoDeLiga[] {
  // `tramosCompletos` ya incluye 0-15…75-90 y 90+; añadirlo otra vez duplicaba los goles del tiempo añadido.
  return tramosCompletos(tramos);
}

/** Los partidos de la última jornada jugada: lo que se entiende por «resultados recientes». */
export type ResultadosRecientes = {
  /** Número de la última jornada con algún resultado. `null` si no hay ninguno. */
  jornada: number | null;
  partidos: FilaPartidoCanonico[];
};

/**
 * La última jornada jugada y sus partidos, ordenados como se publicaron.
 *
 * Se toma la jornada con el número más alto que tenga AL MENOS un resultado, no la última que exista:
 * una jornada con el calendario puesto y sin marcadores no es una jornada «reciente». Los partidos de
 * esa jornada que aún no tienen resultado se omiten, porque un hueco se lee mejor que un 0-0 falso.
 */
export function resultadosRecientes(
  partidos: readonly FilaPartidoCanonico[],
  limite = 10,
): ResultadosRecientes {
  const conResultado = partidos.filter((partido) =>
    partido.goles_local !== null && partido.goles_visitante !== null && partido.jornada !== null);
  if (conResultado.length === 0) return { jornada: null, partidos: [] };
  const jornada = Math.max(...conResultado.map((partido) => Number(partido.jornada)));
  return {
    jornada,
    partidos: conResultado
      .filter((partido) => Number(partido.jornada) === jornada)
      .sort((a, b) => Number(a.orden) - Number(b.orden) || Number(a.match_id) - Number(b.match_id))
      .slice(0, limite),
  };
}

/** Un equipo con su porcentaje de minutos de cantera, ya calculado. */
export type CanteraDeEquipo = {
  fila: FilaEquipoDeLiga;
  /** Porcentaje con un decimal (14,2 %). Sólo se construye con minutos publicados. */
  porcentaje: number;
};

/**
 * Porcentaje de minutos del equipo jugados por futbolistas que también han jugado en un equipo de
 * categoría inferior del mismo club esta temporada. Sin minutos publicados no hay porcentaje.
 */
export function porcentajeDeCantera(fila: Pick<FilaEquipoDeLiga, 'minutos' | 'minutos_inferiores'>): number | null {
  if (fila.minutos === null || fila.minutos <= 0 || fila.minutos_inferiores === null) return null;
  return Math.round((1000 * fila.minutos_inferiores) / fila.minutos) / 10;
}

/** Los equipos con cantera, de más a menos porcentaje. */
export function equiposConCantera(filas: readonly FilaEquipoDeLiga[]): CanteraDeEquipo[] {
  return filas
    .map((fila) => ({ fila, porcentaje: porcentajeDeCantera(fila) }))
    .filter((equipo): equipo is CanteraDeEquipo =>
      equipo.porcentaje !== null && (equipo.fila.jugadores_inferiores ?? 0) > 0)
    .sort((a, b) => b.porcentaje - a.porcentaje
      || (b.fila.minutos_inferiores ?? 0) - (a.fila.minutos_inferiores ?? 0)
      || a.fila.equipo.localeCompare(b.fila.equipo, 'es'));
}

/** Equipos con minutos publicados pero sin ningún futbolista de categoría inferior. */
export function equiposSinCantera(filas: readonly FilaEquipoDeLiga[]): number {
  return filas.filter((fila) => porcentajeDeCantera(fila) !== null && (fila.jugadores_inferiores ?? 0) === 0).length;
}

/** Equipos sin minutos publicados: el porcentaje no se puede afirmar. */
export function equiposSinMinutos(filas: readonly FilaEquipoDeLiga[]): number {
  return filas.filter((fila) => fila.minutos === null).length;
}

/** ¿Hay algún dato de cantera que enseñar? */
export function hayCantera(filas: readonly FilaEquipoDeLiga[]): boolean {
  return equiposConCantera(filas).length > 0;
}

/**
 * La disciplina ordenada por amarillas (y después expulsiones y sanciones). Los equipos sin resumen
 * (`null`) van al final: no se mezclan con los que tienen un 0 medido.
 */
export function disciplinaOrdenada(filas: readonly FilaEquipoDeLiga[]): FilaEquipoDeLiga[] {
  const valor = (n: number | null) => (n === null ? Number.NEGATIVE_INFINITY : n);
  return [...filas].sort((a, b) =>
    valor(b.amarillas) - valor(a.amarillas)
    || valor(b.rojas) - valor(a.rojas)
    || valor(b.partidos_sancion) - valor(a.partidos_sancion)
    || a.equipo.localeCompare(b.equipo, 'es'));
}

/** ¿Hay resumen de disciplina en algún equipo? */
export function hayDisciplina(filas: readonly FilaEquipoDeLiga[]): boolean {
  return filas.some((fila) => fila.partidos_con_acta > 0 && fila.amarillas !== null);
}

/** Texto de una cifra que puede faltar: un guion, nunca un cero. */
export function cifraOTexto(valor: number | null): string {
  return valor === null ? '—' : new Intl.NumberFormat('es-ES').format(valor);
}

/** Una fila de la clasificación resumida de la pantalla de liga. */
export type FilaClasificacionResumida = {
  posicion: number;
  equipo_id: number;
  equipo: string;
  /** Nombre corto si el canónico lo trae; si no, el publicado. */
  nombre: string;
  jugados: number;
  goles: string;
  puntos: number;
};

/**
 * La clasificación resumida: posición, equipo, partidos jugados, goles y puntos.
 *
 * Los goles salen de la tabla oficial si la publica; si la federación los guarda a cero (pasa en CyL),
 * se usan los calculados con los resultados. La pantalla dice cuál de las dos cosas está enseñando.
 */
export function clasificacionResumida(filas: readonly FilaClasificacionPantalla[]): {
  filas: FilaClasificacionResumida[];
  usaReconstruccion: boolean;
} {
  const origen = filas[0]?.origen ?? null;
  const usaReconstruccion = !publicaGoles(filas, origen);
  return {
    usaReconstruccion,
    filas: filas.map((fila) => ({
      posicion: fila.posicion,
      equipo_id: Number(fila.equipo_id),
      equipo: fila.equipo,
      nombre: fila.equipo_corto ?? fila.equipo,
      jugados: fila.jugados,
      goles: golesDeLaFila(fila, usaReconstruccion),
      puntos: fila.puntos,
    })),
  };
}
