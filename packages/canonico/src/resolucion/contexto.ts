/**
 * Contexto del lote: federación, temporada, normalización de nombres y construcción de
 * `context_key` para `source.external_ref`.
 *
 * Regla 4 del encargo: ninguna clave externa se usa sin su federación y su contexto. El
 * `context_key` es la tupla completa del ámbito (temporada, competición, grupo, jornada), nunca una
 * parte suelta.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import type { FilaTemporada } from '../origen/cola.js';

export type FuenteFederacion = { codigo: string; nombre: string; portal: string; adaptador: string; estado: string };

export function leeFederaciones(raiz: string): FuenteFederacion[] {
  const crudo = JSON.parse(readFileSync(join(raiz, 'config', 'federaciones-espana.json'), 'utf8').replace(/^\uFEFF/, ''));
  // `nacionales` (27/10/2026): la RFEF como fuente de las competiciones nacionales. Va aparte de `fuentes` para que
  // las pantallas y la flota sigan contando las 19 territoriales y sus 5 provinciales.
  const lista = [...(crudo?.fuentes ?? []), ...(crudo?.nacionales ?? [])] as FuenteFederacion[];
  return lista.filter((f) => f && typeof f.codigo === 'string');
}

export function fuenteDeFederacion(raiz: string, codigo: string): FuenteFederacion {
  const fuente = leeFederaciones(raiz).find((f) => f.codigo === codigo);
  if (!fuente) throw new Error(`La federación «${codigo}» no está en config/federaciones-espana.json`);
  return fuente;
}

/* ---------- context_key ---------- */

export type Ambito = {
  etiquetaTemporada: string;
  competicion?: string;
  grupo?: string;
  jornada?: number;
};

export function contextoDe(ambito: Ambito): string {
  const partes = [`temporada=${ambito.etiquetaTemporada}`];
  if (ambito.competicion !== undefined) partes.push(`competicion=${ambito.competicion}`);
  if (ambito.grupo !== undefined) partes.push(`grupo=${ambito.grupo}`);
  if (ambito.jornada !== undefined) partes.push(`jornada=${ambito.jornada}`);
  return partes.join(';');
}

/**
 * Formato EXACTO que exige la migración 0008 para una persona sin código federativo:
 * `rol=<rol normalizado>;temporada=<AAAA-AA>;ambito=<edicion|equipo>:<id>;nombre=<normalizado>`
 * Nunca `partido` ni `acta`: multiplicaría personas fantasma.
 */
export function contextoNominal(rolNormalizado: string, etiquetaTemporada: string, ambito: 'edicion' | 'equipo', id: number, nombreNormalizado: string): string {
  return `rol=${rolNormalizado};temporada=${etiquetaTemporada};ambito=${ambito}:${id};nombre=${nombreNormalizado}`;
}

/**
 * Ámbito de una persona del cuerpo técnico sin código. Con el lado del acta conocido, su EQUIPO; sin
 * él, la EDICIÓN — y declarado como edición. Antes se escribía `ambito=equipo:<id de la edición>`:
 * mezclaba dos espacios de identificadores, así que un técnico sin lado en la edición 123 y otro
 * homónimo, con el mismo rol y la misma temporada, del equipo 123 compartían contexto y se fundían en
 * una sola persona. Es exactamente la fusión silenciosa que ADR-0011 prohíbe.
 */
export function ambitoNominalTecnico(teamEntryId: number | null, edicionId: number): { ambito: 'edicion' | 'equipo'; id: number } {
  return teamEntryId !== null ? { ambito: 'equipo', id: teamEntryId } : { ambito: 'edicion', id: edicionId };
}

/* ---------- federación y temporada ---------- */

export async function resuelveFederacion(cliente: ClienteCanonico, repo: Repositorio, fuente: FuenteFederacion): Promise<number> {
  const { rows } = await cliente.query<{ id: number }>('select id from core.federation where codigo = $1', [fuente.codigo]);
  if (rows[0]) return Number(rows[0].id);
  const adaptador = ['pnfg', 'isquad', 'fcf'].includes(fuente.adaptador) ? fuente.adaptador : 'ninguno';
  return repo.upsert(
    'core.federation',
    { codigo: fuente.codigo, nombre: fuente.nombre, adaptador, portal_url: fuente.portal ?? null },
    ['codigo'],
  );
}

export async function resuelveTemporada(cliente: ClienteCanonico, repo: Repositorio, temporada: FilaTemporada): Promise<number> {
  const etiqueta = temporada.etiqueta.trim();
  const anioInicio = Number(etiqueta.slice(0, 4));
  /*
   * ── SE BUSCA PRIMERO, IGUAL QUE LA FEDERACIÓN (medido el 25/09/2026) ──────────────────────────────────
   *
   * `core.season.id` es un `smallint` con identidad, máximo 32767, y esta función se llama una vez por
   * grupo importado. Con el `upsert` a secas —un `insert ... on conflict (etiqueta) do update`, que CONSUME
   * un `nextval` aunque acabe en conflicto— la secuencia se agotó con 25 temporadas de verdad y 3.750
   * grupos fallaron con «nextval: reached maximum value of sequence season_id_seq».
   */
  const { rows } = await cliente.query<{ id: number }>('select id from core.season where etiqueta = $1', [etiqueta]);
  if (rows[0] !== undefined) {
    await cliente.query(
      `update core.season set anio_inicio = $2, orden = $3
        where id = $1 and (anio_inicio, orden) is distinct from ($2, $3)`,
      [rows[0].id, anioInicio, anioInicio],
    );
    return Number(rows[0].id);
  }
  return repo.upsert(
    'core.season',
    { etiqueta, anio_inicio: anioInicio, orden: anioInicio },
    ['etiqueta'],
  );
}

/**
 * Normalizador de nombres con la MISMA función que usa la base (`core.normaliza_nombre`), cacheado.
 *
 * Se calcula en PostgreSQL y no en TypeScript a propósito: si el importador normalizara por su
 * cuenta, el `context_key` de una persona nominal podría no coincidir con el que espera la web al
 * buscar, y la restricción de formato no lo detectaría (las dos formas pasan el patrón).
 */
export class Normalizador {
  private readonly cache = new Map<string, string>();

  constructor(private readonly cliente: ClienteCanonico) {}

  async normaliza(texto: string): Promise<string> {
    const clave = String(texto ?? '');
    const cacheado = this.cache.get(clave);
    if (cacheado !== undefined) return cacheado;
    const { rows } = await this.cliente.query<{ n: string }>('select core.normaliza_nombre($1) as n', [clave]);
    const normalizado = String(rows[0]?.n ?? '');
    this.cache.set(clave, normalizado);
    return normalizado;
  }

  /** Normaliza una lista en una sola consulta (los nombres de una federación se repiten mucho). */
  async normalizaVarios(textos: string[]): Promise<Map<string, string>> {
    const faltan = [...new Set(textos.map((t) => String(t ?? '')))].filter((t) => !this.cache.has(t));
    if (faltan.length > 0) {
      const { rows } = await this.cliente.query<{ original: string; n: string }>(
        'select original, core.normaliza_nombre(original) as n from unnest($1::text[]) as original',
        [faltan],
      );
      for (const fila of rows) this.cache.set(String(fila.original), String(fila.n));
    }
    return new Map(textos.map((t) => [String(t ?? ''), this.cache.get(String(t ?? '')) ?? '']));
  }
}
