/**
 * Catálogo de competiciones.
 *
 * Los códigos viven en la tabla `competiciones` de Supabase, **no en el código**:
 * cambian cada temporada y así se pueden añadir provincias sin tocar nada.
 * `bin/descubrir.ts` los rehace recorriendo los desplegables de la federación.
 */

import { parse } from 'node-html-parser';
import { normalizaTextoFederacion } from './texto.js';

/** Repara el mojibake latin-1/UTF-8 (p. ej. "FederaciÃ³n" → "Federación"). */
export function arreglaMojibake(s: string): string {
  return normalizaTextoFederacion(s);
}

export interface Competicion {
  id?: number;
  codCompeticion: string;
  codGrupo: string;
  codTemporada: string;
  codDelegacion: string;
  nombre: string;
  grupo?: string;      // p. ej. "Primera - Salamanca"
  ambito?: Ambito;     // provincial / regional / nacional / fase-ascenso
  categoria: Categoria;
  genero: 'm' | 'f';
  slug: string;
  activa: boolean;
}

export type Categoria =
  | 'aficionados' | 'juvenil' | 'cadete' | 'infantil' | 'alevin'
  | 'benjamin' | 'prebenjamin' | 'sala' | 'copa';

/** Categorías cuyos jugadores son menores. Marca dónde aplican las reglas del §9
 *  de PROYECTO.md: dorsal sí, nombre no. */
export const CATEGORIAS_DE_MENORES: readonly Categoria[] = [
  'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin',
];

export const esDeMenores = (c: Categoria): boolean => CATEGORIAS_DE_MENORES.includes(c);

/** Código de temporada de la federación a partir del año de inicio.
 *  Observado: 18=2022/23, 21=2025/26, 22=2026/27 → `añoInicio − 2004`. */
export function codTemporadaDe(anioInicio: number): string {
  return String(anioInicio - 2004);
}

/** Códigos de delegación confirmados desde el propio sitio (desplegable de la federación). */
export const DELEGACIONES: Record<string, string> = {
  '1000': 'Sede Central',
  '1002': 'Ávila', '1003': 'Burgos', '1004': 'León', '1005': 'Palencia',
  '1006': 'Salamanca', '1007': 'Segovia', '1008': 'Soria', '1009': 'Valladolid',
  '1010': 'Zamora', '9636101': 'El Bierzo',
};

export const nombreDeDelegacion = (cod: string): string => DELEGACIONES[cod] ?? cod;

/** Ámbito de una competición y cómo se organizan sus grupos. Basado en la estructura real
 *  de Castilla y León (aportada por el usuario): provincial = un grupo por provincia;
 *  regional cadete/infantil = Primera y Segunda; juvenil Recoletas = A y B + liga nacional;
 *  aficionados regional = A y B; Tercera = un solo grupo; fases de ascenso = grupos de 3. */
export type Ambito = 'provincial' | 'regional' | 'nacional' | 'fase-ascenso';
export type ModoGrupos = 'por-provincia' | 'primera-segunda' | 'a-b' | 'uno' | 'fase';

export interface Estructura {
  ambito: Ambito;
  grupos: ModoGrupos;
}

export function estructuraDe(nombre: string): Estructura {
  const n = nombre.toLowerCase();
  if (/fase|ascenso/.test(n)) return { ambito: 'fase-ascenso', grupos: 'fase' };
  if (/liga nacional/.test(n) || /tercera federaci/.test(n)) return { ambito: 'nacional', grupos: 'uno' };
  if (/provincial/.test(n)) return { ambito: 'provincial', grupos: 'por-provincia' };
  if (/regional/.test(n)) {
    if (/recoletas|juvenil/.test(n)) return { ambito: 'regional', grupos: 'a-b' };
    return { ambito: 'regional', grupos: 'primera-segunda' };
  }
  return { ambito: 'regional', grupos: 'uno' };
}

/** ¿Se puede guardar/mostrar el nombre de un jugador? En menores solo con consentimiento
 *  registrado (CLAUDE.md, PROYECTO.md §9). Fuera de menores, sí. */
export function puedeMostrarNombre(categoria: Categoria, consentimiento: boolean): boolean {
  return !esDeMenores(categoria) || consentimiento;
}

/**
 * Lee las opciones de los desplegables de la página de competiciones. Devuelve sólo lo
 * que hay escrito en el HTML (`texto` y `valor` de cada `<option>`), sin interpretarlo:
 * la correspondencia exacta entre el `valor` y `CodCompeticion`/`CodGrupo` hay que
 * confirmarla contra la URL de la jornada. No se adivina (CLAUDE.md).
 */
export interface OpcionCatalogo {
  texto: string;
  valor: string;
}

export function opcionesDeCatalogo(html: string): OpcionCatalogo[] {
  const raiz = parse(html);
  const out: OpcionCatalogo[] = [];
  for (const opt of raiz.querySelectorAll('option')) {
    const texto = (opt.textContent ?? '').trim();
    const valor = opt.getAttribute('value') ?? '';
    if (texto.length > 0) out.push({ texto, valor });
  }
  // deja solo únicos con valor (los "elige" o placeholders vienen sin valor) y texto
  const vistos = new Set<string>();
  return out.filter((o) => {
    if (o.valor === '' || o.texto === '') return false;
    const k = `${o.valor}|${o.texto}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

/**
 * Extrae una competición de una URL de jornada de la federación. Útil para montar el
 * catálogo pegando las URLs que sale de la barra del navegador (los códigos van en la URL).
 * Lee lo que hay escrito en la URL, no se inventa nada (CLAUDE.md). La `categoria` queda
 * a `aficionados` por defecto; se puede pasar por parámetro.
 */
export function competicionDeUrl(url: string, categoria: Categoria = 'aficionados'): Competicion {
  const u = new URL(url);
  const cod = u.searchParams.get('codcompeticion') ?? u.searchParams.get('CodCompeticion');
  const grupo = u.searchParams.get('codgrupo') ?? u.searchParams.get('CodGrupo');
  const temp = u.searchParams.get('codtemporada') ?? u.searchParams.get('CodTemporada');
  const deleg = u.searchParams.get('sch_codigo_delegacion') ?? u.searchParams.get('Sch_Codigo_Delegacion') ?? '0';
  if (!cod || !grupo || !temp) {
    throw new Error(`La URL no tiene codcompeticion/codgrupo/codtemporada: ${url}`);
  }
  return {
    codCompeticion: cod,
    codGrupo: grupo,
    codTemporada: temp,
    codDelegacion: deleg,
    nombre: `Competición ${cod} · grupo ${grupo}`,
    categoria,
    genero: 'm',
    slug: `comp-${cod}-gr-${grupo}`,
    activa: true,
  };
}

/** Deduplica y ordena por slug. */
export function competicionesDeUrls(urls: string[], categoria: Categoria = 'aficionados'): Competicion[] {
  const vistos = new Set<string>();
  const out: Competicion[] = [];
  for (const u of urls) {
    const c = competicionDeUrl(u, categoria);
    if (vistos.has(c.slug)) continue;
    vistos.add(c.slug);
    out.push(c);
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Competición detectada en el HTML de una lista (endpoint `NFG_Mov_LstCompeticiones`). */
export interface CompeticionDetectada {
  codCompeticion: string;
  nombre: string;
}

function valorDe(prop: string, url: string): string | null {
  const u = new URL(url, 'https://www.rfcylf.es/');
  const lower = prop.toLowerCase();
  for (const [k, v] of u.searchParams.entries()) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/**
 * Lista de competiciones a partir del HTML que devuelve `NFG_Mov_LstCompeticiones`.
 * Lee los `<a>`/`<option>` que llevan `codcompeticion` en la URL (o como valor) y el texto
 * como nombre. Sólo devuelve lo que está escrito en el HTML: no se inventa nada.
 */
export function parseaCompeticiones(html: string): CompeticionDetectada[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const out: CompeticionDetectada[] = [];

  const add = (cod: string | null | undefined, nombre: string) => {
    if (!cod || !nombre.trim()) return;
    const k = cod + '|' + nombre.trim();
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push({ codCompeticion: cod.replace(/["'<>]/g, ''), nombre: arreglaMojibake(nombre).trim() });
  };

  for (const a of raiz.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    const cod = valorDe('codcompeticion', href);
    add(cod, (a.textContent ?? '').trim());
  }
  for (const o of raiz.querySelectorAll('option')) {
    const valor = o.getAttribute('value') ?? '';
    const cod = valorDe('codcompeticion', valor);
    add(cod, (o.textContent ?? '').trim());
  }
  return out;
}

/** Competiciones leídas del `<select>` de la página de resultados (`NFG_CmpJornada_Exec`).
 *  Ese endpoint sí filtra por temporada. Los códigos de competición tienen 5+ dígitos
 *  (antiguo sistema: 12012, 11386…; actual: 24218932…). Se elige el `<select>` con más
 *  opciones de ese tipo (el de competición) y se limpia el nombre de `&nbsp;`/guiones. */
export function competicionesDeSelect(html: string): CompeticionDetectada[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const out: CompeticionDetectada[] = [];
  const esCod = (v: string | null | undefined) => !!v && /^\d{3,}$/.test(v.trim());
  const limpia = (t: string) => arreglaMojibake(t).replace(/&nbsp;/g, ' ').replace(/\s*(-|–|—)\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // el <select> "de competición" es el que más opciones de código largo tiene
  let mejorOptions: ReturnType<typeof raiz.querySelectorAll> | undefined;
  let mejorScore = 0;
  for (const sel of raiz.querySelectorAll('select')) {
    const ops = sel.querySelectorAll('option');
    const score = ops.filter((o) => esCod(o.getAttribute('value'))).length;
    if (score > mejorScore) { mejorScore = score; mejorOptions = ops; }
  }
  for (const o of mejorOptions ?? []) {
    const valor = (o.getAttribute('value') ?? '').trim();
    if (!esCod(valor) || vistos.has(valor)) continue;
    vistos.add(valor);
    out.push({ codCompeticion: valor, nombre: limpia(o.textContent ?? '') });
  }
  return out;
}

/** Grupo detectado en el HTML del desplegable de una competición.
 *  El endpoint AJAX (`NFG_POR_Lst_Competiciones_Grupos?codcompeticion=X&N_Ajax=1`) devuelve
 *  un `<select name=grupo>` con `<option value=codgrupo>nombre</option>` (o enlaces). */
export interface GrupoDetectado {
  codCompeticion: string;
  codGrupo: string;
  nombre: string;
}

export function parseaGrupos(html: string, codCompeticion: string): GrupoDetectado[] {
  const raiz = parse(html);
  const vistos = new Set<string>();
  const out: GrupoDetectado[] = [];

  const push = (codGrupo: string, nombre: string) => {
    const k = `${codCompeticion}|${codGrupo}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push({ codCompeticion, codGrupo, nombre: arreglaMojibake(nombre).trim() });
  };

  // 1) opciones del desplegable: <option value=codgrupo>Nombre</option>
  for (const o of raiz.querySelectorAll('option')) {
    const valor = (o.getAttribute('value') ?? '').trim();
    const nombre = (o.textContent ?? '').trim();
    if (!/^\d+$/.test(valor) || valor === '0' || !nombre) continue;
    push(valor, nombre);
  }

  // 2) enlaces NFG_CmpJornada (formato alternativo): llevan codcompeticion+codgrupo
  for (const a of raiz.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    const codComp = valorDe('codcompeticion', href);
    const codGrupo = valorDe('codgrupo', href);
    if (!codComp || !codGrupo) continue;
    push(codGrupo, (a.textContent ?? '').trim());
  }
  return out;
}
