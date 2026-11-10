/**
 * La nota que distingue las DOS caras de Fondo Popular: la demo pública y la app completa.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────────────────────────────
 *
 * La demo pública (`urlDemo`) es una **foto estática** de la web con sólo la temporada 2026-27: no tiene
 * API ni base de datos detrás y las páginas son ficheros del propio sitio. La **app completa** es esta
 * misma aplicación (raíz) y en el servidor propio: tiene todas las temporadas del canónico, búsqueda,
 * selector, actas, historial y panel. Se llaman igual y es fácil confundirlas, así que el pie lo dice.
 *
 * ── UNA SOLA FUENTE ────────────────────────────────────────────────────────────────────────────────────
 *
 * El texto y las dos URL viven aquí y sólo aquí: el componente `NotaDemo` los pinta y no repite ni una
 * palabra. **Si cambia una URL, se cambia en este fichero** y no en ningún otro sitio.
 *
 * No se inventa ninguna URL: la demo es la que está publicada en GitHub Pages y la app completa es esta
 * misma aplicación en su raíz (`/`). El servidor propio se sirve por túnel con URL efímera, así que no
 * se escribe un host que no se pueda sostener.
 */

/** Las piezas del texto, para poder enlazar cada parte sin duplicar el texto. */
const PARTES = {
  demo: 'Demo pública',
  temporada: 'datos de la temporada 2026-27',
  completa: 'app completa',
  servidor: 'en el servidor propio',
} as const;

export const NOTA_DEMO = {
  ...PARTES,
  /** El texto completo, tal cual se lee. Se construye con las partes: no hay dos versiones. */
  texto: `${PARTES.demo}: ${PARTES.temporada} · ${PARTES.completa} ${PARTES.servidor}`,
  /** Demo pública (foto estática de la 2026-27). Cambiar aquí si cambia el repositorio de Pages. */
  urlDemo: 'https://erdeivih.github.io/fondo-popular-demo/',
  /** App completa: esta misma aplicación. Cambiar aquí si algún día se sirve en otro host. */
  urlCompleta: '/',
} as const;
