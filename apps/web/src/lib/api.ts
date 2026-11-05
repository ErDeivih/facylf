/**
 * Piezas comunes de la API pública v1 (WALL objetivo 6).
 *
 * Tres cosas que centraliza, para que ningún endpoint las reinvente distinto:
 *  · el sobre de respuesta (`api.version`, `datos`, `enlaces`) y el ETag calculado del cuerpo, con 304
 *    para `If-None-Match`;
 *  · las cabeceras de caché (pública para lo que se puede compartir, `no-store` para errores) y
 *    `X-Cache: HIT|MISS`, que es lo que permite medir aciertos sin mirar dentro de Next;
 *  · el límite por IP y los errores con código estable, nunca con trazas ni SQL.
 *
 * Nada de esto toca datos de sesión: la API pública no lee cookies ni consultas de cuenta.
 */

import { createHash } from 'node:crypto';
import { limitePorIp } from './limite-api';

/** Versión del contrato. Un cambio incompatible estrena `v2`, no cambia esta. */
export const API_VERSION = 'v1';

/** Cabecera de caché de un recurso público de datos (60 s de navegador/proxy y 5 min de revalidación). */
export const CABECERA_CACHE_PUBLICA = 'public, max-age=60, stale-while-revalidate=300';

/** El índice de la API cambia muy poco: una hora. */
export const CABECERA_CACHE_INDICE = 'public, max-age=3600, stale-while-revalidate=86400';

export type MetodoApi = 'GET' | 'POST';

export type EndpointPublico = {
  metodo: MetodoApi;
  ruta: string;
  recurso: string;
  descripcion: string;
  /** `planeado` se anuncia en el índice pero todavía no responde. */
  estado: 'disponible' | 'planeado';
};

/** El índice: lo que la API anuncia como disponible o planeado. */
export const ENDPOINTS_PUBLICOS: readonly EndpointPublico[] = [
  { metodo: 'GET', ruta: '/api/v1', recurso: 'indice', descripcion: 'Este índice de la API.', estado: 'disponible' },
  {
    metodo: 'GET', ruta: '/api/v1/competiciones/{id}', recurso: 'competicion',
    descripcion: 'Contexto y cobertura de un grupo de competición (federación, temporada, edición, grupo y estado de los datos).',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/acta/{id}', recurso: 'acta',
    descripcion: 'Acta completa de un partido: contexto, marcador, eventos, alineaciones, árbitros, cuerpo técnico y enfrentamientos anteriores.',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/calendario', recurso: 'calendario',
    descripcion: 'Partidos del canónico, filtrables por federación, temporada, jornada, rango de fechas y texto; paginados.',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/ficha/equipo/{id}', recurso: 'ficha-equipo',
    descripcion: 'Ficha de una inscripción de equipo: cabecera, plantilla, últimos partidos y goles por tramo.',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/ficha/jugador/{id}', recurso: 'ficha-jugador',
    descripcion: 'Ficha de una persona: cabecera, trayectoria por temporada y últimos partidos.',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/ficha/club/{id}', recurso: 'ficha-club',
    descripcion: 'Ficha de un club: cabecera, equipos inscritos y presencia de escudo.',
    estado: 'disponible',
  },
  {
    metodo: 'GET', ruta: '/api/v1/estadisticas/competicion/{id}', recurso: 'estadisticas-competicion',
    descripcion: 'Estadísticas y gráficos de una competición (WALL objetivo 5). Contrato reservado; aún no responde.',
    estado: 'planeado',
  },
];

/** Operaciones de servicio: no son datos públicos y piden secreto. */
export const OPERACIONES_API: readonly EndpointPublico[] = [
  {
    metodo: 'POST', ruta: '/api/revalidar', recurso: 'revalidar',
    descripcion: 'Consume las etiquetas pendientes de ops.invalidacion y refresca la caché. Requiere Authorization: Bearer.',
    estado: 'disponible',
  },
];

/** Cuerpo de error: `{ api, error: { codigo, mensaje, detalles? } }`. */
export type CuerpoError = {
  api: { version: typeof API_VERSION };
  error: { codigo: string; mensaje: string; detalles?: unknown };
};

/** Respuesta de error con código estable. Nunca incluye trazas, SQL ni rutas internas. */
export function errorApi(status: number, codigo: string, mensaje: string, detalles?: unknown): Response {
  const cuerpo: CuerpoError = {
    api: { version: API_VERSION },
    error: detalles === undefined ? { codigo, mensaje } : { codigo, mensaje, detalles },
  };
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: cabecerasBase({ cache: 'no-store' }),
  });
}

type OpcionesRespuesta = {
  /** Política de caché HTTP; por defecto pública de datos. */
  cache?: 'publica' | 'indice' | 'no-store';
  /** De dónde salió el dato (`X-Cache`). */
  origen?: 'cache' | 'calculado';
};

/**
 * Respuesta JSON con ETag. Si el cliente manda `If-None-Match` con el ETag vigente, contesta 304 sin
 * cuerpo (mismas cabeceras de caché y `X-Cache`).
 */
export function respuestaJson(datos: unknown, req: Request, opciones: OpcionesRespuesta = {}): Response {
  const cuerpo = JSON.stringify(datos);
  const etag = etagDe(cuerpo);
  const cache = opciones.cache ?? 'publica';
  const cabeceras = cabecerasBase({ cache, origen: opciones.origen });
  cabeceras.set('ETag', etag);
  cabeceras.set('X-API-Version', API_VERSION);

  if (cache !== 'no-store' && etagCoincide(req.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers: cabeceras });
  }
  return new Response(cuerpo, { status: 200, headers: cabeceras });
}

function cabecerasBase(opciones: OpcionesRespuesta): Headers {
  const cabeceras = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  if (opciones.cache === 'indice') cabeceras.set('Cache-Control', CABECERA_CACHE_INDICE);
  else if (opciones.cache === 'no-store') cabeceras.set('Cache-Control', 'no-store');
  else cabeceras.set('Cache-Control', CABECERA_CACHE_PUBLICA);
  if (opciones.origen !== undefined) cabeceras.set('X-Cache', opciones.origen === 'cache' ? 'HIT' : 'MISS');
  return cabeceras;
}

/** ETag fuerte del cuerpo: dos respuestas con los mismos datos comparten ETag. */
function etagDe(cuerpo: string): string {
  return `"${createHash('sha256').update(cuerpo, 'utf8').digest('base64url').slice(0, 32)}"`;
}

/**
 * ¿El `If-None-Match` del cliente incluye este ETag? Se admite la forma débil (`W/"…"`), las listas
 * separadas por comas y `*`.
 */
export function etagCoincide(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false;
  const buscado = etag.replace(/^W\//, '');
  return ifNoneMatch.split(',').some((parte) => {
    const limpio = parte.trim();
    if (limpio === '*') return true;
    return limpio.replace(/^W\//, '') === buscado;
  });
}

/** La IP del cliente según el proxy; sin cabecera no se inventa una: se agrupa como `desconocida`. */
export function ipDePeticion(req: Request): string {
  const reenviada = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim();
  if (reenviada) return reenviada;
  const real = (req.headers.get('x-real-ip') ?? '').trim();
  return real !== '' ? real : 'desconocida';
}

/**
 * Aplica el límite por IP a una petición. Devuelve la respuesta 429 si se pasa, o `null` si sigue.
 * Se llama al principio de cada endpoint público.
 */
export function conLimiteDePeticiones(req: Request): Response | null {
  const limite = limitePorIp(ipDePeticion(req));
  if (limite.permitido) return null;
  const respuesta = errorApi(
    429,
    'demasiadas_peticiones',
    'Se ha superado el límite de peticiones por IP. Espera y vuelve a intentarlo.',
  );
  respuesta.headers.set('Retry-After', String(limite.retryAfterSegundos));
  return respuesta;
}

/** El sobre común de un recurso: versión, datos y enlaces a la pantalla web equivalente. */
export function sobreRecurso<T>(recurso: string, datos: T, enlaces: Record<string, string>) {
  return { api: { version: API_VERSION, recurso }, datos: normalizaIdentificadores(datos), enlaces };
}

/** Un campo que es un identificador (`id`, `grupo_id`, `partido_id`…). */
const CLAVE_ID = /(^|_)id$/i;

/**
 * Normaliza los identificadores que PostgreSQL devuelve como texto.
 *
 * `bigint` viaja por el protocolo como cadena (`"3769"`) aunque en el JSON signifique un número; en una
 * API eso obliga a cada cliente a convertirlo. Se convierten sólo los campos cuyo nombre acaba en `id`
 * o es `id`, y sólo si el valor es una cadena de dígitos: una fecha o un código no se tocan.
 */
export function normalizaIdentificadores<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((elemento) => normalizaIdentificadores(elemento)) as unknown as T;
  }
  if (valor !== null && typeof valor === 'object') {
    // Un `timestamptz` llega como `Date` del cálculo y como cadena ISO si viene de la caché de Next:
    // hay que dejar el Date tal cual (JSON.stringify lo serializa igual) y no recorrerlo, o se
    // convertiría en `{}` y el ETag cambiaría entre el cálculo y el acierto de caché.
    const prototipo = Object.getPrototypeOf(valor);
    if (prototipo !== Object.prototype && prototipo !== null) return valor;
    const salida: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      const esId = CLAVE_ID.test(clave) && typeof contenido === 'string' && /^\d+$/.test(contenido);
      salida[clave] = esId ? Number(contenido) : normalizaIdentificadores(contenido);
    }
    return salida as T;
  }
  return valor;
}

/** Contexto de la ruta dinámica de un route handler de Next (params es una promesa en Next 16). */
export type ContextoRuta = { params: Promise<Record<string, string>> };
