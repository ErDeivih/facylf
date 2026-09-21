/**
 * Fila de `scrape_log` (supabase/migrations/0008_operacion.sql) para cada petición a la
 * federación. Es la que permite darse cuenta de que han cambiado el formato: si un parseo
 * devuelve 0 partidos donde antes devolvía 182, salta aquí. Función pura: se prueba sola.
 */

import type { Respuesta } from './cliente.js';

export interface FilaLog {
  competicion_id: number | null;
  url: string;
  etag: string | null;
  hash_contenido: string | null;
  estado: number;
  filas: number | null;
  cambios: number;
  ms: number;
  error: string | null;
}

export interface ExtrasLog {
  filas?: number;
  cambios?: number;
  hash_contenido?: string | null;
  error?: string | null;
}

/** Fila a partir de una respuesta HTTP ya leída. `hash_contenido`, `filas` y `cambios`
 *  los rellena quien parsea, porque dependen del contenido. */
export function filaDeRespuesta(
  url: string,
  competicionId: number | null,
  r: Respuesta,
  extras: ExtrasLog = {},
): FilaLog {
  return {
    competicion_id: competicionId,
    url,
    etag: r.etag,
    estado: r.estado,
    ms: Math.round(r.ms),
    filas: extras.filas ?? null,
    cambios: extras.cambios ?? 0,
    hash_contenido: extras.hash_contenido ?? null,
    error: extras.error ?? null,
  };
}

/** Fila para un fallo (error de red, 5xx repetido, parseo roto). */
export function filaDeError(
  url: string,
  competicionId: number | null,
  error: string,
): FilaLog {
  return {
    competicion_id: competicionId,
    url,
    etag: null,
    hash_contenido: null,
    estado: 0,
    filas: null,
    cambios: 0,
    ms: 0,
    error,
  };
}
