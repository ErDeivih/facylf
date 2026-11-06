/**
 * Reglas de la pantalla de jornadas (prototipo «Competición», pestaña Jornadas).
 *
 * Son funciones puras para poder probarlas sin renderizar ni consultar: cuántas jornadas hay, qué
 * fechas abarca cada una, cuántos de sus partidos tienen resultado y cuáles son la anterior y la
 * siguiente. La pantalla sólo pinta lo que sale de aquí.
 *
 * Reglas de producto que se respetan en todo el fichero:
 *  · un partido sin marcador NO está jugado y nunca se convierte en un 0-0;
 *  · una fecha que la fuente no publicó no se inventa (ni se rellena con la de otro partido);
 *  · una jornada sin partidos no se inventa por numeración: sólo existen las jornadas que tienen
 *    algún partido en el canónico.
 */

import type { FilaPartidoCanonico } from '@/consultas/partidos';
import type { FilaPortadaGrupo } from '@/consultas/competiciones';
import { fechaCorta } from './vocabulario-pantalla';

/**
 * Un partido del grupo, tal y como lo devuelve `partidos-de-grupo`.
 *
 * La fila trae dos fechas: `fecha` (la del partido jugado, de `played_at`) y `fecha_prevista` (la que la
 * federación publicó en el calendario). Un grupo con calendario y sin resultados llega con la primera
 * nula y la segunda no. `fechaDePartido` decide cuál se enseña; el resto de la pantalla no tiene que
 * saber de dónde viene cada una.
 */
export type PartidoDeJornada = FilaPartidoCanonico;

/** Lo que la lista y la cabecera del detalle necesitan saber de una jornada. */
export type JornadaResumen = {
  numero: number;
  /** Partidos publicados en esa jornada (conocidos, no «previstos»). */
  partidos: number;
  /** Partidos con marcador publicado. Un partido programado no cuenta como jugado. */
  jugados: number;
  /** Primera y última fecha publicada del calendario de la jornada, o `null` si no hay ninguna. */
  desde: string | null;
  hasta: string | null;
};

/**
 * La portada con el campo que añade `GRUPO_POR_ID` para la fecha derecha de la barra. El tipo lo deja
 * opcional para que las pruebas de render con una portada construida a mano sigan valiendo.
 */
export type PortadaConFechaUltimaJugada = FilaPortadaGrupo;

/** La fecha de la última jornada jugada tal y como la sirve `GRUPO_POR_ID`, o `null` si aún no está. */
export function fechaUltimaJugadaDePortada(portada: FilaPortadaGrupo): string | null {
  const limpia = (portada.fecha_ultima_jugada ?? '').slice(0, 10);
  return limpia === '' ? null : limpia;
}

/** La fecha que se enseña de un partido: la jugada y, si aún no se jugó, la prevista publicada. */
export function fechaDePartido(p: { fecha: string | null; fecha_prevista?: string | null }): string | null {
  const jugada = (p.fecha ?? '').slice(0, 10);
  if (jugada !== '') return jugada;
  const prevista = (p.fecha_prevista ?? '').slice(0, 10);
  return prevista !== '' ? prevista : null;
}

/**
 * La fecha de la última jornada JUGADA del grupo: la mayor fecha de los partidos con resultado.
 *
 * No es la última fecha del calendario (`fecha_fin`), que incluye los partidos programados y puede
 * estar meses por delante. Un grupo con calendario pero sin resultados devuelve `null`, no la fecha
 * prevista: no se ha jugado nada. Se usa como respaldo de `GRUPO_POR_ID.fecha_ultima_jugada` y en las
 * páginas que ya tienen los partidos delante.
 */
export function fechaUltimaJugadaDePartidos(
  partidos: readonly { fecha: string | null; fecha_prevista?: string | null; goles_local: number | null; goles_visitante: number | null }[],
): string | null {
  let ultima: string | null = null;
  for (const p of partidos) {
    if (p.goles_local === null || p.goles_visitante === null) continue;
    const fecha = fechaDePartido(p);
    if (fecha !== null && (ultima === null || fecha > ultima)) ultima = fecha;
  }
  return ultima;
}

/** Lo que se sabe de una jornada del listado: el resumen y sus partidos, en orden de publicación. */
export type JornadaConPartidos = JornadaResumen & { lista: readonly PartidoDeJornada[] };

/** Las jornadas con sus partidos, en una pasada y sin una consulta por jornada. */
export function agrupaJornadasConPartidos(partidos: readonly PartidoDeJornada[]): JornadaConPartidos[] {
  const porNumero = new Map<number, JornadaConPartidos>();
  for (const p of partidos) {
    const numero = Number(p.jornada);
    if (!Number.isInteger(numero) || numero <= 0) continue;
    const fila = porNumero.get(numero) ?? { numero, partidos: 0, jugados: 0, desde: null, hasta: null, lista: [] };
    fila.partidos += 1;
    if (p.goles_local !== null && p.goles_visitante !== null) fila.jugados += 1;
    const fecha = fechaDePartido(p);
    if (fecha !== null) {
      if (fila.desde === null || fecha < fila.desde) fila.desde = fecha;
      if (fila.hasta === null || fecha > fila.hasta) fila.hasta = fecha;
    }
    (fila.lista as PartidoDeJornada[]).push(p);
    porNumero.set(numero, fila);
  }
  const jornadas = [...porNumero.values()].sort((a, b) => a.numero - b.numero);
  for (const jornada of jornadas) {
    (jornada.lista as PartidoDeJornada[]).sort((a, b) => a.orden - b.orden);
  }
  return jornadas;
}

/** El estado que se lee en la cabecera de una tabla de jornada. */
export type EstadoDeJornada = { clave: 'jugada' | 'parcial' | 'programada' | 'sin-fecha'; etiqueta: string };

/**
 * Jugada, parcial, programada o sin fecha. Sólo cuenta como jugado un partido con los dos goles
 * publicados; un `0` no se interpreta como «sin dato».
 */
export function estadoDeJornada(jornada: JornadaResumen): EstadoDeJornada {
  if (jornada.partidos === 0) return { clave: 'sin-fecha', etiqueta: 'Sin partidos' };
  if (jornada.jugados >= jornada.partidos) return { clave: 'jugada', etiqueta: 'Jugada' };
  if (jornada.jugados > 0) return { clave: 'parcial', etiqueta: 'Parcial' };
  return jornada.desde !== null
    ? { clave: 'programada', etiqueta: 'Programada' }
    : { clave: 'sin-fecha', etiqueta: 'Sin fecha' };
}

/**
 * Agrupa los partidos del grupo en jornadas, de la primera a la última.
 *
 * Una sola pasada: la página pide los partidos UNA vez y reparte aquí, sin una consulta por jornada.
 * Se descarta una jornada sin número válido en vez de inventarle un hueco.
 */
export function agrupaJornadas(partidos: readonly PartidoDeJornada[]): JornadaResumen[] {
  const porNumero = new Map<number, JornadaResumen>();
  for (const p of partidos) {
    const numero = Number(p.jornada);
    if (!Number.isInteger(numero) || numero <= 0) continue;
    const fila = porNumero.get(numero) ?? { numero, partidos: 0, jugados: 0, desde: null, hasta: null };
    fila.partidos += 1;
    if (p.goles_local !== null && p.goles_visitante !== null) fila.jugados += 1;
    const fecha = fechaDePartido(p);
    if (fecha !== null) {
      if (fila.desde === null || fecha < fila.desde) fila.desde = fecha;
      if (fila.hasta === null || fecha > fila.hasta) fila.hasta = fecha;
    }
    porNumero.set(numero, fila);
  }
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

/** Lo que necesita el detalle de una jornada: ella misma, sus partidos y sus vecinas. */
export type DetalleDeJornada = {
  jornada: JornadaResumen;
  partidos: readonly PartidoDeJornada[];
  anterior: number | null;
  siguiente: number | null;
};

/**
 * Detalle de una jornada concreta, o `null` si el grupo no tiene partidos en esa jornada.
 *
 * Las vecinas son las jornadas que EXISTEN en el grupo, no `numero ± 1`: si la jornada 3 no tiene
 * partidos publicados, la anterior a la 4 es la 2. Un enlace «‹» que lleva a una página que no
 * existe es peor que no tener enlace.
 */
export function detalleDeJornada(
  partidos: readonly PartidoDeJornada[],
  numero: number,
): DetalleDeJornada | null {
  const jornadas = agrupaJornadas(partidos);
  const jornada = jornadas.find((j) => j.numero === numero);
  if (!jornada) return null;
  return {
    jornada,
    partidos: partidos.filter((p) => p.jornada === numero),
    anterior: jornadas.filter((j) => j.numero < numero).at(-1)?.numero ?? null,
    siguiente: jornadas.find((j) => j.numero > numero)?.numero ?? null,
  };
}

/**
 * El rango de fechas de una jornada en castellano, o `null` si no hay ninguna fecha publicada.
 *
 * Cuando los dos extremos caen en el mismo mes se comparte el mes («12–13 sept»), que es como se lee
 * una jornada de fin de semana; si no, se escriben los dos («27 sept – 4 oct»). Nunca se añade un año
 * que no hace falta: la temporada está en la cabecera.
 */
export function rangoDeFechas(desde: string | null, hasta: string | null): string | null {
  const primera = fechaCorta(desde);
  const ultima = fechaCorta(hasta);
  if (primera === null && ultima === null) return null;
  if (primera === null) return ultima;
  if (ultima === null) return primera;
  const dia = (fecha: string) => Number(fecha.slice(8, 10));
  if (desde !== null && hasta !== null && desde === hasta) return primera;
  if (desde !== null && hasta !== null && desde.slice(0, 7) === hasta.slice(0, 7)) {
    return `${dia(desde)}–${ultima}`;
  }
  return `${primera} – ${ultima}`;
}

/** Un número de jornada de la URL sólo vale si es un entero positivo; lo demás no es una página. */
export function numeroDeJornada(crudo: string | undefined): number | null {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** La ruta de la pantalla de jornadas de un grupo. La usan las dos pantallas y sus pruebas. */
export const rutaDeJornadas = (grupoId: number): string => `/explorar/competicion/${grupoId}/jornadas`;

/** La ruta del detalle de una jornada. La lista va en plural (`/jornadas`) y el detalle en singular. */
export const rutaDeJornada = (grupoId: number, numero: number): string =>
  `/explorar/competicion/${grupoId}/jornada/${numero}`;

/** Título de la pestaña del navegador para el listado de jornadas (hallazgo C7 del QA). */
export function tituloDeJornadas(x: { edicion: string; grupo: string }): string {
  return `Jornadas · ${x.edicion} · ${x.grupo} — Fondo Popular`;
}

/** Título de la pestaña del navegador para el detalle de una jornada. */
export function tituloDeJornada(x: { numero: number; edicion: string; grupo: string }): string {
  return `Jornada ${x.numero} · ${x.edicion} · ${x.grupo} — Fondo Popular`;
}
