/**
 * Qué sección de la navegación «Funciones» de la cabecera queda marcada para una ruta.
 *
 * Vive aparte del componente para poder probarla sin router: es una regla de producto, no un detalle
 * de presentación. La cabecera enseña cuatro secciones, pero sólo **Explorar** tiene pantalla hoy; su
 * catálogo real es `/competiciones` y las fichas nuevas viven bajo `/explorar`. Las otras tres
 * (Rankings, Ojeo, Comparar) todavía no existen y por eso no se marcan nunca.
 */
export type SeccionActiva = 'explorar' | 'rankings' | 'ojeo' | 'comparar' | null;

/** Rutas que pertenecen a la sección Explorar. Se comparan por segmento, no por prefijo de texto. */
const RUTAS_DE_EXPLORAR = ['/explorar', '/competiciones'] as const;

export function seccionActiva(ruta: string | null | undefined): SeccionActiva {
  if (!ruta) return null;
  const esDeExplorar = RUTAS_DE_EXPLORAR.some(
    (base) => ruta === base || ruta.startsWith(`${base}/`),
  );
  return esDeExplorar ? 'explorar' : null;
}
