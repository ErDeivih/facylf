/**
 * Qué sección de la navegación «Funciones» de la cabecera queda marcada para una ruta.
 *
 * Vive aparte del componente para poder probarla sin router: es una regla de producto, no un detalle
 * de presentación. La cabecera enseña cuatro funciones:
 *
 *  · **Explorar** — el catálogo (`/explorar/competiciones`) y todas las pantallas de exploración
 *    (competición, calendario, fichas…), que viven bajo `/explorar`. También la página vieja
 *    `/competiciones`, que sigue existiendo mientras se retira la web anterior.
 *  · **Rankings** — enlaza a la pantalla de estadísticas (`/explorar/estadisticas`), que es la que hoy
 *    enseña goleadores y cifras de la temporada. Se comprueba **antes** que Explorar porque
 *    `/explorar/estadisticas` empieza por el mismo prefijo.
 *  · **Ojeo** y **Comparar** — todavía no tienen pantalla; no hay ruta que marcar y por eso no se
 *    marcan nunca.
 */
export type SeccionActiva = 'explorar' | 'rankings' | 'ojeo' | 'comparar' | null;

/** Rutas de la sección Explorar. Se comparan por segmento, no por prefijo de texto. */
const RUTAS_DE_EXPLORAR = ['/explorar', '/competiciones'] as const;

/** Rutas de la sección Rankings. */
const RUTAS_DE_RANKINGS = ['/explorar/estadisticas'] as const;

function esDeLaSeccion(ruta: string, bases: readonly string[]): boolean {
  return bases.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

export function seccionActiva(ruta: string | null | undefined): SeccionActiva {
  if (!ruta) return null;
  if (esDeLaSeccion(ruta, RUTAS_DE_RANKINGS)) return 'rankings';
  if (esDeLaSeccion(ruta, RUTAS_DE_EXPLORAR)) return 'explorar';
  return null;
}
