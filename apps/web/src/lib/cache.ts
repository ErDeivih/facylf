/**
 * Caché de la API pública por etiquetas (`ops.invalidacion`, migración 0036).
 *
 * La idea está fijada en `RENDIMIENTO-BASE.md` §4 y en `docs/plataforma-web/codigo/cache.ts`: lo público
 * se guarda en la caché de Next con las etiquetas de lo que enseña (`grupo:12`, `equipo:345`,
 * `persona:789`…). El proyector, al proyectar un grupo, apunta las etiquetas afectadas en
 * `ops.invalidacion`; la web las consume (`POST /api/revalidar` y cada minuto en `instrumentation.ts`) y
 * llama a `revalidateTag`. Mientras nada cambie, la respuesta sale de la caché sin tocar PostgreSQL.
 *
 * Reglas:
 *  · Sólo se cachea lo PÚBLICO. Esta API no lee consultas de cuenta (`rol: 'app'` sólo se usa para
 *    consumir la cola de invalidaciones, que es una operación de servicio).
 *  · Las etiquetas de recurso son las que emite `ops.invalida_grupo`, más dos etiquetas amplias
 *    (`acta`, `calendario`) que se refrescan cuando cambia cualquier grupo, edición, federación, equipo,
 *    club o persona. Es menos preciso que etiquetar cada acta por su grupo, pero no se puede saber el
 *    grupo de un acta sin consultarla; a cambio, nunca sirve datos viejos de un partido que ha cambiado.
 *  · Hay una caducidad de 5 minutos como red de seguridad: si el proyector no llamara nunca a la
 *    invalidación, la API no se quedaría congelada para siempre. Es la única diferencia con el diseño de
 *    `cache.ts` del documento, que la dejaba sin caducidad.
 */

import { revalidateTag, unstable_cache } from 'next/cache';
import type { Consulta } from '@/consultas/contratos';
import { consulta, type RolWeb } from '@/consultas/adaptadores/postgres/conexion';

/** Caducidad de seguridad de una entrada cacheada (segundos). */
export const CADUCIDAD_CACHE_SEGUNDOS = 300;

/**
 * Etiquetas que declara cada recurso cacheado de la API. La clave es el nombre del recurso, no el de la
 * consulta: se cachea la respuesta entera (varias consultas en una foto), no cada consulta suelta.
 */
export const ETIQUETAS: Record<string, (params: readonly unknown[]) => string[]> = {
  'grupo-por-id': ([id]) => [`grupo:${id}`],
  'acta-del-partido': () => ['acta'],
  'partidos-del-calendario': () => ['calendario'],
  'equipo-por-id': ([id]) => [`equipo:${id}`],
  'persona-por-id': ([id]) => [`persona:${id}`],
  'club-por-id': ([id]) => [`club:${id}`],
  'plantilla-del-equipo': ([id]) => [`equipo:${id}`],
  'partidos-del-equipo': ([id]) => [`equipo:${id}`],
  'goles-por-tramo': ([id]) => [`equipo:${id}`],
  'escudo-del-club': ([id]) => [`club:${id}`],
  'trayectoria-de-persona': ([id]) => [`persona:${id}`],
  'partidos-de-persona': ([id]) => [`persona:${id}`],
  'opciones-del-calendario': () => ['calendario'],
  // Ampliación v1: estadísticas, historiales y oficiales.
  'resumen-de-estadísticas': ([id]) => [`grupo:${id}`, 'estadisticas'],
  'historial-de-jugador': ([id]) => [`persona:${id}`, 'historiales'],
  'historial-del-equipo': ([id]) => [`equipo:${id}`, 'historiales'],
  'historial-del-club': ([id]) => [`club:${id}`, 'historiales'],
  'arbitro-por-id': ([id]) => [`persona:${id}`, 'oficiales'],
  'entrenador-por-id': ([id]) => [`persona:${id}`, 'oficiales'],
  'delegado-por-id': ([id]) => [`persona:${id}`, 'oficiales'],
};

/**
 * Etiquetas que hay que refrescar ADEMÁS de las que llegan en la cola. El calendario y el acta dependen
 * de partidos, equipos y clubes, y el proyector apunta esas entidades pero no una etiqueta por partido.
 * Las estadísticas, los historiales y las fichas de oficiales dependen de grupos enteros o de líneas de
 * equipo, así que se refrescan con las mismas señales y se acepta que el refresco sea amplio: mejor
 * recalcular que servir un dato viejo.
 */
const DERIVADAS: Array<[RegExp, readonly string[]]> = [
  [/^(grupo|grupo-externo|edicion|federacion):/, [
    'calendario', 'acta', 'estadisticas', 'historiales', 'oficiales',
  ]],
  [/^(equipo|club|persona):/, ['calendario', 'acta', 'historiales', 'oficiales']],
];

/** Etiquetas amplias que hay que invalidar cuando cambia alguna de las recibidas. */
export function etiquetasDerivadas(etiquetas: Iterable<string>): string[] {
  const derivadas = new Set<string>();
  for (const etiqueta of etiquetas) {
    for (const [patron, extras] of DERIVADAS) {
      if (patron.test(etiqueta)) for (const extra of extras) derivadas.add(extra);
    }
  }
  return [...derivadas].sort();
}

/** Una respuesta de caché y de dónde salió (para la cabecera `X-Cache` y para medir hit/miss). */
export type ResultadoCache<T> = {
  datos: T;
  origen: 'cache' | 'calculado';
};

/**
 * Ejecuta `calcular` a través de la caché de Next con etiquetas.
 *
 * Fuera de una petición de Next (pruebas, scripts) `unstable_cache` lanza `Invariant: incrementalCache
 * missing`; en ese caso se calcula directamente y se dice que el origen es `calculado`. Es el único
 * error que se traga: un fallo de la base o de la consulta se propaga tal cual.
 */
export async function cacheado<T>(
  clave: readonly string[],
  etiquetas: readonly string[],
  calcular: () => Promise<T>,
): Promise<ResultadoCache<T>> {
  let calculado = false;
  const conMarca = async (): Promise<T> => {
    calculado = true;
    return calcular();
  };
  try {
    const datos = await unstable_cache(conMarca, [...clave], {
      tags: ['todo', ...etiquetas],
      revalidate: CADUCIDAD_CACHE_SEGUNDOS,
    })();
    return { datos, origen: calculado ? 'calculado' : 'cache' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('incrementalCache missing in unstable_cache')) {
      return { datos: await calcular(), origen: 'calculado' };
    }
    throw error;
  }
}

/** La consulta que consume la cola de invalidaciones. Es una función del canónico, no una tabla. */
const CONSUME_INVALIDACIONES = {
  nombre: 'consume-invalidaciones',
  descripcion: 'Toma las etiquetas pendientes de ops.invalidacion y las marca consumidas.',
  plan: 'agregado',
  presupuestoMs: 200,
  rol: 'app',
  columnas: ['etiqueta'],
  sql: `select etiqueta from ops.consume_invalidaciones($1::int) etiqueta`,
} satisfies Consulta<{ etiqueta: string }>;

/**
 * Consume hasta `maximo` etiquetas pendientes y llama a `revalidateTag` con cada una y con las
 * derivadas. Devuelve cuántas etiquetas se refrescaron (incluidas las derivadas).
 *
 * Usa el rol `app` (`DATABASE_URL_APP`) porque `ops.invalidacion` sólo da `select, update` a ese rol;
 * el rol de lectura público no puede ni leerla. No es una consulta de datos de usuario.
 */
export async function consumeInvalidaciones(maximo = 2000, rol: RolWeb = 'app'): Promise<number> {
  const filas = await consulta<{ etiqueta: string }>(CONSUME_INVALIDACIONES.sql, [maximo], {
    rol,
    presupuestoMs: CONSUME_INVALIDACIONES.presupuestoMs,
  });
  const recibidas = filas.map((f) => f.etiqueta).filter((e) => typeof e === 'string' && e !== '');
  const todas = [...new Set([...recibidas, ...etiquetasDerivadas(recibidas)])];
  let refrescadas = 0;
  for (const etiqueta of todas) {
    try {
      // `revalidateTag` pide el perfil de vida de la caché en Next 16; `max` es el que corresponde a
      // una entrada que sólo cambia cuando llega la etiqueta (y como red, 5 minutos).
      revalidateTag(etiqueta, 'max');
      refrescadas += 1;
    } catch {
      // Fuera de una petición de Next (pruebas y scripts) revalidateTag no tiene contexto: se cuenta
      // igualmente porque la etiqueta SÍ se ha consumido de la cola.
      refrescadas += 1;
    }
  }
  return refrescadas;
}
