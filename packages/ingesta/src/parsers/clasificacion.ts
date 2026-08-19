import { clave } from '@fcylf/dominio';
import { decodifica, lineas } from '../texto.js';

/**
 * @experimental — NO usar para escribir en producción.
 *
 * El fichero de `datos-ejemplo/` es de pretemporada: todos los valores son 0, así que
 * no se puede saber qué columna es cuál por su contenido. `Puntos` además aparece dos
 * veces (una es la sanción). En cuanto haya una jornada jugada hay que coger el fichero
 * real, compararlo con la clasificación de la web y fijar el mapeo con un test.
 *
 * Y ojo: para la clasificación **no hace falta parsear nada**. Se calcula desde
 * `partidos` con `@fcylf/dominio`. Este parser sirve sólo para **verificar** que
 * nuestro cálculo coincide con el oficial; si no coincide, casi siempre es una sanción
 * de puntos que la federación aplicó y nosotros no tenemos.
 */
export interface FilaOficial {
  equipo: string;
  /** Los 9 numéricos de la fila, en el orden en que vienen. Sin interpretar. */
  valores: number[];
}

const RE_NUM = /^-?\d+$/;

export function parseaClasificacionCruda(entrada: string | Buffer | Uint8Array): FilaOficial[] {
  const html = typeof entrada === 'string' ? entrada : decodifica(entrada);
  const ls = lineas(html);
  const filas: FilaOficial[] = [];

  for (let i = 0; i < ls.length; i++) {
    // patrón de fila: <posición> <nombre de equipo> <9 numéricos>
    if (!RE_NUM.test(ls[i] ?? '')) continue;
    const nombre = ls[i + 1];
    if (!nombre || RE_NUM.test(nombre)) continue;
    const valores = ls.slice(i + 2, i + 11);
    if (valores.length !== 9 || !valores.every((v) => RE_NUM.test(v))) continue;
    filas.push({ equipo: nombre, valores: valores.map(Number) });
    i += 10;
  }
  return filas;
}

/** Comparación entre lo que calculamos y lo que publica la federación.
 *  Devuelve los equipos cuya diferencia de puntos no cuadra. */
export function contrasta(
  calculado: { equipo: string; puntos: number }[],
  oficial: FilaOficial[],
  indicePuntos: number,
): { equipo: string; nuestro: number; suyo: number }[] {
  const mapa = new Map(oficial.map((f) => [clave(f.equipo), f.valores[indicePuntos] ?? 0]));
  return calculado
    .map((c) => ({ equipo: c.equipo, nuestro: c.puntos, suyo: mapa.get(clave(c.equipo)) ?? 0 }))
    .filter((x) => x.nuestro !== x.suyo);
}
