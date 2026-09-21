import type { Competicion } from './catalogo.js';
import { parse } from 'node-html-parser';

/** Base de la sección de resultados de la federación. */
export const BASE = 'https://www.rfcylf.es/pnfg/NPcd';
/** Identificador fijo de la web de la federación (todo endpoint lo lleva). */
export const COD_PRIMARIA = '1000120';

/**
 * Página de una jornada (resultados en vivo). Confirmada: viene de la URL que nos pasa el
 * club. Es la que hay que mirar el fin de semana.
 */
export function urlJornada(c: Competicion, jornada: number): string {
  const q = new URLSearchParams({
    cod_primaria: COD_PRIMARIA,
    CodCompeticion: c.codCompeticion,
    CodGrupo: c.codGrupo,
    CodTemporada: c.codTemporada,
    CodJornada: String(jornada),
    Sch_Codigo_Delegacion: c.codDelegacion,
  });
  return `${BASE}/NFG_CmpJornada?${q}`;
}

/**
 * Página de calendario. Confirmada con F12 → Red. El Excel se descarga añadiendo
 * `excel=1&NPcd_File=1` (ver `urlCalendarioExcel`). Si quieres ver una jornada concreta,
 * pasa `jornada`; para el calendario completo no se pasa.
 */
export function urlCalendario(c: Competicion, jornada?: number): string {
  const q = new URLSearchParams({
    cod_primaria: COD_PRIMARIA,
    codtemporada: c.codTemporada,
    codcompeticion: c.codCompeticion,
    codgrupo: c.codGrupo,
  });
  if (jornada) q.set('CodJornada', String(jornada));
  return `${BASE}/NFG_VisCalendario_Vis?${q}`;
}

/** Descarga en Excel del calendario: la misma página con `excel=1&NPcd_File=1`. */
export function urlCalendarioExcel(c: Competicion): string {
  const u = new URL(urlCalendario(c));
  u.searchParams.set('excel', '1');
  u.searchParams.set('NPcd_File', '1');
  return u.toString();
}

/** Página de clasificación. Confirmada con F12 → Red. */
export function urlClasificacion(c: Competicion): string {
  const q = new URLSearchParams({
    cod_primaria: COD_PRIMARIA,
    codtemporada: c.codTemporada,
    codcompeticion: c.codCompeticion,
    codgrupo: c.codGrupo,
  });
  return `${BASE}/NFG_VisClasificacion?${q}`;
}

/** Descarga en Excel de la clasificación: misma página con `excel=1&NPcd_File=1`. */
export function urlClasificacionExcel(c: Competicion): string {
  const u = new URL(urlClasificacion(c));
  u.searchParams.set('excel', '1');
  u.searchParams.set('NPcd_File', '1');
  return u.toString();
}

/** Tabla cruzada (cuadrícula casa/fuera). Confirmada: `NFG_VisTablaCruzado`. */
export function urlTablaCruzada(c: Competicion): string {
  const q = new URLSearchParams({ cod_primaria: COD_PRIMARIA, CodGrupo: c.codGrupo });
  return `${BASE}/NFG_VisTablaCruzado?${q}`;
}

/** Ficha de partido / acta por su `CodActa`. Confirmada: `NFG_CmpPartido`. */
export function urlActa(codActa: string): string {
  const q = new URLSearchParams({ cod_primaria: COD_PRIMARIA, CodActa: codActa, cod_acta: codActa });
  return `${BASE}/NFG_CmpPartido?${q}`;
}

/** Desplegable de grupos de una competición (AJAX). Confirmada con F12 → Red. */
export function urlGrupos(codCompeticion: string): string {
  const q = new URLSearchParams({ codcompeticion: codCompeticion, N_Ajax: '1' });
  return `${BASE}/NFG_POR_Lst_Competiciones_Grupos?${q}`;
}

/** URLs de descarga que enlaza la propia página, por texto/atributo. Devuelve sólo
 *  lo que hay escrito en el HTML: no se inventa ninguna URL (CLAUDE.md). */
export interface UrlsExcel {
  calendario?: string;
  clasificacion?: string;
  otros: string[];
}

function absolutiza(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, `${BASE}/`).toString();
}

/**
 * Busca en el HTML de una página de la federación los enlaces a los `.xls`.
 *
 * Ya conocemos el patrón real (página + `?excel=1&NPcd_File=1`), así que normalmente se
 * usa `urlCalendarioExcel`/`urlClasificacionExcel`. Esta función queda como respaldo para
 * cuando un endpoint cambie o para inspeccionar una página desconocida.
 */
export function descubreUrlsExcel(html: string): UrlsExcel {
  const raiz = parse(html);
  const hrefs: { texto: string; href: string }[] = [];

  for (const a of raiz.querySelectorAll('a')) {
    const texto = (a.textContent ?? '').trim().toLowerCase();
    const href = a.getAttribute('href');
    // El Excel real es la página + `excel=1`/`NPcd_File` (no lleva `.xls`); también casan
    // los enlaces antiguos que sí terminaban en `.xls`.
    if (href && (/(^|[?&])excel=1/i.test(href) || /NPcd_File/i.test(href) || /\.xls/i.test(href))) {
      hrefs.push({ texto, href: absolutiza(href) });
    }
  }

  const resultado: UrlsExcel = { otros: [] };
  for (const { texto, href } of hrefs) {
    if (texto.includes('clasific')) resultado.clasificacion ??= href;
    else if (texto.includes('calendari')) resultado.calendario ??= href;
    else resultado.otros.push(href);
  }
  return resultado;
}
