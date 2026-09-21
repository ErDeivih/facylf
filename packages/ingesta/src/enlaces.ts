/**
 * Extracción del patrón de enlaces de la federación.
 *
 * La federación usa el mismo puñado de endpoints con parámetros que identifican a qué
 * apuntan: competición (`codcompeticion`), grupo (`codgrupo`), temporada (`codtemporada`),
 * jornada (`codjornada`), partido/acta (`CodActa`), equipo (`codequipo`) y jugador
 * (`jugador`). Esta función lee un HTML y normaliza cada enlace en su referencia, para
 * poder trazar competiciones → grupos → equipos → partidos → jugadores sin inventar nada.
 */

import { parse } from 'node-html-parser';

/** Parámetro de una URL, sin distinguir mayúsculas/minúsculas (la federación mezcla). */
export function paramDe(url: string, nombre: string): string | null {
  const u = new URL(url, 'https://www.rfcylf.es/');
  const lower = nombre.toLowerCase();
  for (const [k, v] of u.searchParams.entries()) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

export type TipoEnlace =
  | 'jornada' | 'partido' | 'jugador' | 'equipo'
  | 'competiciones-equipo' | 'lista-competiciones' | 'grupos' | 'otro';

export interface Referencia {
  tipo: TipoEnlace;
  url: string;
  texto: string;
  codCompeticion?: string;
  codGrupo?: string;
  codTemporada?: string;
  codJornada?: string;
  codActa?: string;
  codEquipo?: string;
  jugador?: string;
}

export function tipoDeEnlace(href: string): TipoEnlace {
  const p = new URL(href, 'https://www.rfcylf.es/').pathname;
  if (/NFG_CmpPartido/i.test(p)) return 'partido';
  if (/NFG_EstadisticasJugador/i.test(p)) return 'jugador';
  if (/NFG_VisCompeticiones_Equipo/i.test(p)) return 'competiciones-equipo';
  if (/NFG_Mov_LstCompeticiones/i.test(p)) return 'lista-competiciones';
  if (/NFG_Mov_ListGruposCompeticion/i.test(p)) return 'grupos';
  // un enlace con `codequipo` es la ficha de un equipo; con `CodActa`, el acta.
  if (paramDe(href, 'codequipo')) return 'equipo';
  if (paramDe(href, 'codacta')) return 'partido';
  if (/NFG_CmpJornada/i.test(p)) return 'jornada';
  return 'otro';
}

export function referenciaDe(href: string, texto: string): Referencia {
  const tipo = tipoDeEnlace(href);
  const r: Referencia = { tipo, url: href, texto: texto.trim() };
  if (tipo === 'jornada') {
    r.codCompeticion = paramDe(href, 'codcompeticion') ?? undefined;
    r.codGrupo = paramDe(href, 'codgrupo') ?? undefined;
    r.codTemporada = paramDe(href, 'codtemporada') ?? undefined;
    r.codJornada = paramDe(href, 'codjornada') ?? undefined;
  } else if (tipo === 'partido') {
    r.codActa = paramDe(href, 'codacta') ?? paramDe(href, 'cod_acta') ?? undefined;
    r.codCompeticion = paramDe(href, 'codcompeticion') ?? undefined;
    r.codGrupo = paramDe(href, 'codgrupo') ?? undefined;
  } else if (tipo === 'jugador') {
    r.jugador = paramDe(href, 'jugador') ?? undefined;
    r.codActa = paramDe(href, 'codacta') ?? undefined;
  } else if (tipo === 'competiciones-equipo' || tipo === 'equipo') {
    r.codEquipo = paramDe(href, 'codequipo') ?? undefined;
    r.codTemporada = paramDe(href, 'codtemporada') ?? undefined;
  }
  return r;
}

/** Todos los enlaces de la federación de una página, normalizados y deduplicados. */
export function extraeReferencias(html: string): Referencia[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const out: Referencia[] = [];
  for (const a of raiz.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (!/rfcylf\.es|\/pnfg\/NPcd/i.test(href)) continue;   // solo enlaces internos
    const ref = referenciaDe(href, a.textContent ?? '');
    const k = `${ref.tipo}|${ref.url}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(ref);
  }
  return out;
}
