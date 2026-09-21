import { clave } from '@facylf/dominio';
import { parse } from 'node-html-parser';
import { decodifica, lineas } from '../texto.js';
import { decodificaHtml, normalizaTextoFederacion } from '../texto.js';

/**
 * @experimental — NO usar para escribir en producción.
 *
 * El fichero de `datos-ejemplo/` es de pretemporada: todos los valores son 0, así que
 * no se puede saber qué columna es cuál por su contenido. `Puntos` además aparece dos
 * veces (una es la sanción). En cuanto haya una jornada jugada hay que coger el fichero
 * real, compararlo con la clasificación de la web y fijar el mapeo con un test.
 *
 * Y ojo: para la clasificación **no hace falta parsear nada**. Se calcula desde
 * `partidos` con `@facylf/dominio`. Este parser sirve sólo para **verificar** que
 * nuestro cálculo coincide con el oficial; si no coincide, casi siempre es una sanción
 * de puntos que la federación aplicó y nosotros no tenemos.
 */
export interface FilaOficial {
  equipo: string;
  /** Los 9 numéricos de la fila, en el orden en que vienen. Sin interpretar. */
  valores: number[];
}

/** Fila de la tabla resumen que publica la federacion en
 * `NFG_VisClasificacion`. A diferencia del antiguo volcado pseudo-XLS, esta
 * estructura tiene un encabezado inequivoco y permite usar la clasificacion
 * oficial (incluidas sanciones) sin hacer otra peticion. */
export interface ClasificacionOficialHtml {
  posicion: number;
  equipoCodigo: string | null;
  equipo: string;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  ultimos: string[];
  sancion: number;
}

const entero = (valor: string): number | null => {
  const limpio = valor.replace(/[^\d-]/g, '');
  return /^-?\d+$/.test(limpio) ? Number(limpio) : null;
};

function parametroEquipo(href: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, '&'), 'https://www.rfcylf.es/pnfg/NPcd/');
    for (const [nombre, valor] of url.searchParams) {
      if (['codequipo', 'codigo_equipo'].includes(nombre.toLowerCase())) return valor;
    }
  } catch { /* enlace incompleto */ }
  return null;
}

/** Lee la tabla oficial visible. Ignora la tabla detallada casa/fuera y los
 * resultados que aparecen debajo. Devuelve [] para una pagina sin tabla. */
export function parseaClasificacionHtml(entrada: string | Buffer | Uint8Array): ClasificacionOficialHtml[] {
  const html = typeof entrada === 'string' ? entrada : decodificaHtml(entrada);
  const raiz = parse(html);
  for (const tabla of raiz.querySelectorAll('table')) {
    const filas = tabla.querySelectorAll('tr');
    // No dependemos de los espacios que haya entre las etiquetas: algunos
    // portales/minificadores concatenan el textContent de los <th>.
    const cabecera = filas.slice(0, 2).flatMap((fila) =>
      fila.querySelectorAll('th,td').map((celda) => normalizaTextoFederacion(celda.textContent)))
      .join(' ').replace(/\s+/g, ' ');
    if (!/\bPts\b/.test(cabecera) || !/\bJ\b/.test(cabecera) || !/Sanci[oó]n/i.test(cabecera)) continue;
    // La pagina incluye antes otra tabla con el desglose casa/fuera. La fila
    // secundaria del resumen tiene exactamente ocho encabezados.
    if ((filas[1]?.querySelectorAll('th,td').length ?? 0) !== 8) continue;

    const salida: ClasificacionOficialHtml[] = [];
    for (const fila of filas.slice(2)) {
      const celdas = fila.querySelectorAll('th,td');
      // La tabla resumen contiene: celda decorativa, posicion, equipo,
      // puntos, J, G, E, P, ultimos y sancion.
      if (celdas.length < 10) continue;
      const posicion = entero(celdas[1]?.textContent ?? '');
      const puntos = entero(celdas[3]?.textContent ?? '');
      const jugados = entero(celdas[4]?.textContent ?? '');
      const ganados = entero(celdas[5]?.textContent ?? '');
      const empatados = entero(celdas[6]?.textContent ?? '');
      const perdidos = entero(celdas[7]?.textContent ?? '');
      const equipo = normalizaTextoFederacion(celdas[2]?.textContent ?? '');
      if (posicion == null || puntos == null || jugados == null || ganados == null ||
          empatados == null || perdidos == null || !equipo) continue;
      const enlace = celdas[2]?.querySelector('a')?.getAttribute('href') ?? '';
      const ultimos = normalizaTextoFederacion(celdas[8]?.textContent ?? '')
        .split(/\s+/).filter((x) => /^[GEP]$/i.test(x)).map((x) => x.toUpperCase());
      salida.push({ posicion, equipoCodigo: parametroEquipo(enlace), equipo, puntos, jugados,
        ganados, empatados, perdidos, ultimos, sancion: entero(celdas[9]?.textContent ?? '') ?? 0 });
    }
    if (salida.length) return salida;
  }
  return [];
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
