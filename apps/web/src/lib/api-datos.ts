/**
 * Lectura y validación de los parámetros de la API pública, y traducción de fallos a respuestas HTTP.
 *
 * La diferencia con las pantallas es deliberada: una página ignora un filtro mal escrito y enseña la
 * vista sin él (es más amable), pero una API tiene que decir **400** y qué parámetro está mal. Callar un
 * filtro inválido devolvería datos que el cliente no ha pedido.
 */

import { CanonicoNoDisponible } from '@/consultas/adaptadores/postgres/conexion';
import {
  enteroDeFiltro, fechaDeFiltro, federacionDeFiltro, temporadaDeFiltro,
} from '@/lib/calendario';
import { errorApi } from '@/lib/api';

/** Tamaño de página por defecto y máximo de la API del calendario. */
export const API_PAGINA_POR_DEFECTO = 60;
export const API_PAGINA_MAXIMA = 100;
/** Tope de páginas: el catálogo puede ser grande, pero no se sirve la página un millón. */
export const API_PAGINA_TOPE = 10_000;

export type FiltrosCalendarioApi = {
  federacion: string | null;
  temporada: string | null;
  jornada: number | null;
  desde: string | null;
  hasta: string | null;
  texto: string | null;
  pagina: number;
  porPagina: number;
  desplazamiento: number;
};

export type LecturaFiltros =
  | { ok: true; filtros: FiltrosCalendarioApi }
  | { ok: false; parametro: string; mensaje: string };

/** Un id de ruta de la API: entero positivo o `null`. */
export function idDeApi(crudo: string | undefined): number | null {
  // Sólo dígitos decimales: `Number` aceptaría `0x10`, `1e3` o perdería precisión en un bigint.
  if (crudo === undefined || !/^[1-9][0-9]{0,15}$/.test(crudo)) return null;
  const n = Number(crudo);
  return Number.isSafeInteger(n) ? n : null;
}

/** Un parámetro de la URL, recortado; ausente o vacío es «sin filtro». */
function valorDe(parametros: URLSearchParams, nombre: string): string | null {
  const crudo = parametros.get(nombre);
  if (crudo === null) return null;
  const limpio = crudo.trim();
  return limpio === '' ? null : limpio;
}

/**
 * Lee los filtros del calendario. Devuelve el parámetro culpable para que el 400 diga cuál es, en vez
 * de un «parámetros inválidos» que obliga a adivinar.
 */
export function leeFiltrosCalendarioApi(parametros: URLSearchParams): LecturaFiltros {
  const federacionCruda = valorDe(parametros, 'federacion');
  const federacion = federacionCruda === null ? null : federacionDeFiltro(federacionCruda);
  if (federacionCruda !== null && federacion === null) {
    return { ok: false, parametro: 'federacion', mensaje: 'La federación debe ser un código como «castilla-leon».' };
  }

  const temporadaCruda = valorDe(parametros, 'temporada');
  const temporada = temporadaCruda === null ? null : temporadaDeFiltro(temporadaCruda);
  if (temporadaCruda !== null && temporada === null) {
    return { ok: false, parametro: 'temporada', mensaje: 'La temporada debe tener la forma AAAA-AA, por ejemplo 2026-27.' };
  }

  const jornadaCruda = valorDe(parametros, 'jornada');
  const jornada = jornadaCruda === null ? null : enteroDeFiltro(jornadaCruda, 500);
  if (jornadaCruda !== null && jornada === null) {
    return { ok: false, parametro: 'jornada', mensaje: 'La jornada debe ser un entero entre 1 y 500.' };
  }

  const desdeCrudo = valorDe(parametros, 'desde');
  const desde = desdeCrudo === null ? null : fechaDeFiltro(desdeCrudo);
  if (desdeCrudo !== null && desde === null) {
    return { ok: false, parametro: 'desde', mensaje: 'La fecha «desde» debe ser una fecha real AAAA-MM-DD.' };
  }

  const hastaCrudo = valorDe(parametros, 'hasta');
  const hasta = hastaCrudo === null ? null : fechaDeFiltro(hastaCrudo);
  if (hastaCrudo !== null && hasta === null) {
    return { ok: false, parametro: 'hasta', mensaje: 'La fecha «hasta» debe ser una fecha real AAAA-MM-DD.' };
  }
  if (desde !== null && hasta !== null && desde > hasta) {
    return { ok: false, parametro: 'desde', mensaje: 'La fecha «desde» no puede ser posterior a «hasta».' };
  }

  const textoCrudo = valorDe(parametros, 'texto');
  if (textoCrudo !== null && textoCrudo.length > 80) {
    return { ok: false, parametro: 'texto', mensaje: 'El texto de búsqueda no puede pasar de 80 caracteres.' };
  }

  const paginaCruda = valorDe(parametros, 'pagina');
  const pagina = paginaCruda === null ? 1 : enteroDeFiltro(paginaCruda, API_PAGINA_TOPE);
  if (pagina === null) {
    return { ok: false, parametro: 'pagina', mensaje: `La página debe ser un entero entre 1 y ${API_PAGINA_TOPE}.` };
  }

  const porPaginaCrudo = valorDe(parametros, 'porPagina');
  const porPagina = porPaginaCrudo === null ? API_PAGINA_POR_DEFECTO : enteroDeFiltro(porPaginaCrudo, API_PAGINA_MAXIMA);
  if (porPagina === null) {
    return { ok: false, parametro: 'porPagina', mensaje: `Cada página admite entre 1 y ${API_PAGINA_MAXIMA} partidos.` };
  }

  return {
    ok: true,
    filtros: {
      federacion,
      temporada,
      jornada,
      desde,
      hasta,
      texto: textoCrudo,
      pagina,
      porPagina,
      desplazamiento: (pagina - 1) * porPagina,
    },
  };
}

/**
 * Traduce un fallo de una consulta a una respuesta HTTP.
 *
 * `CanonicoNoDisponible` es 503 (el servicio del que dependemos no está) con `Retry-After`; cualquier
 * otra cosa es 500 y **no** se copia el mensaje del error al cliente: puede llevar detalles internos.
 */
export function respuestaDeFallo(error: unknown): Response {
  if (error instanceof CanonicoNoDisponible) {
    // El mensaje del adaptador puede contener nombres de tablas o detalles de PostgreSQL: se registra
    // en el servidor y al cliente se le da un texto fijo.
    console.error('[api-v1] canónico no disponible:', error.message);
    const respuesta = errorApi(503, 'canonico_no_disponible', 'El servicio de datos no está disponible en este momento.');
    respuesta.headers.set('Retry-After', '30');
    return respuesta;
  }
  console.error('[api-v1] fallo inesperado:', error);
  return errorApi(500, 'error_interno', 'No se ha podido completar la petición. Vuelve a intentarlo más tarde.');
}

/** Los enlaces de un recurso de competición (pantalla web y otros recursos de la API). */
export function enlacesDeCompeticion(grupoId: number): Record<string, string> {
  return {
    web: `/explorar/competicion/${grupoId}`,
    api: `/api/v1/competiciones/${grupoId}`,
    clasificacion: `/explorar/competicion/${grupoId}`,
    jornadas: `/explorar/competicion/${grupoId}/jornadas`,
    calendario: `/explorar/competicion/${grupoId}/calendario`,
  };
}
