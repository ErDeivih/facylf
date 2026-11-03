/**
 * Navegación principal, en un solo sitio.
 *
 * La usan el armazón (`layout.tsx`), el menú móvil y el estado activo. Tener la lista duplicada en dos
 * sitios hacía que un enlace nuevo apareciera en el escritorio y no en el móvil.
 *
 * `primario: true` son los que caben en la barra móvil; el resto vive bajo «Más». No se decide por
 * longitud del texto sino por frecuencia de uso: orientarse, ver resultados y mirar una competición.
 */
export const NAVEGACION = [
  { href: '/', texto: 'Resumen', primario: true },
  { href: '/competiciones', texto: 'Competiciones', primario: true },
  { href: '/partidos', texto: 'Partidos', primario: true },
  { href: '/equipos', texto: 'Equipos', primario: true },
  { href: '/federaciones', texto: 'Federaciones', primario: false },
  { href: '/estadisticas', texto: 'Estadísticas', primario: false },
  { href: '/jugadores', texto: 'Jugadores', primario: false },
  { href: '/tecnicos', texto: 'Técnicos', primario: false },
  { href: '/arbitros-campos', texto: 'Árbitros y campos', primario: false },
  // Estado del canónico: qué hay importado y hasta dónde llega cada grupo. Es la página que evita
  // leer un listado parcial como si fuera definitivo.
  { href: '/canonico', texto: 'Canónico', primario: false },
] as const;

/** `true` si la ruta actual está dentro de la sección del enlace. */
export function esActiva(rutaActual: string, href: string): boolean {
  if (href === '/') return rutaActual === '/';
  return rutaActual === href || rutaActual.startsWith(`${href}/`);
}
