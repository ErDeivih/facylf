/**
 * Qué sección de la navegación «Funciones» de la cabecera queda marcada para una ruta.
 *
 * Vive aparte del componente para poder probarla sin router: es una regla de producto, no un detalle
 * de presentación. La cabecera enseña cuatro funciones:
 *
 *  · **Explorar** — el catálogo (`/explorar/competiciones`) y todas las pantallas de exploración
 *    (competición, calendario, fichas…), que viven bajo `/explorar`. También la página vieja
 *    `/competiciones`, que sigue existiendo mientras se retira la web anterior.
 *  · **Rankings** — enlaza a la pantalla de estadísticas (`/explorar/estadisticas`) y, desde que existe
 *    la pantalla propia, a `/explorar/rankings`. Se comprueba **antes** que Explorar porque las dos
 *    empiezan por el mismo prefijo.
 *  · **Ojeo** — `/explorar/ojeo`, la pantalla de perfiles de jugadores, también antes que Explorar.
 *  · **Comparar** — `/explorar/comparar`, el comparador de jugadores, antes que Explorar.
 */
export type SeccionActiva = 'explorar' | 'rankings' | 'ojeo' | 'comparar' | null;

/** Rutas de la sección Explorar. Se comparan por segmento, no por prefijo de texto. */
const RUTAS_DE_EXPLORAR = ['/explorar', '/competiciones'] as const;

/** Rutas de la sección Rankings. */
const RUTAS_DE_RANKINGS = ['/explorar/estadisticas', '/explorar/rankings'] as const;

/** Rutas de la sección Ojeo. */
const RUTAS_DE_OJEO = ['/explorar/ojeo'] as const;

/** Rutas de la sección Comparar. */
const RUTAS_DE_COMPARAR = ['/explorar/comparar'] as const;

function esDeLaSeccion(ruta: string, bases: readonly string[]): boolean {
  return bases.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

export function seccionActiva(ruta: string | null | undefined): SeccionActiva {
  if (!ruta) return null;
  if (esDeLaSeccion(ruta, RUTAS_DE_RANKINGS)) return 'rankings';
  if (esDeLaSeccion(ruta, RUTAS_DE_OJEO)) return 'ojeo';
  if (esDeLaSeccion(ruta, RUTAS_DE_COMPARAR)) return 'comparar';
  if (esDeLaSeccion(ruta, RUTAS_DE_EXPLORAR)) return 'explorar';
  return null;
}
