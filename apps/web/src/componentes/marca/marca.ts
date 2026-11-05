/**
 * La marca del producto, en un solo sitio.
 *
 * `Cantera` es el nombre adoptado el 05/11/2026 (sustituye a FACYLF y a la propuesta provisional
 * Cantera en la interfaz; el repositorio, las rutas internas y los nombres de paquete siguen siendo
 * `facylf`). Vive aquí y no escrito a mano en cada pantalla para que el nombre y la tagline cambien
 * una vez. David propuso también *Grada* y *Tercera*; se elige **Cantera** por ser corto, español y
 * de fútbol formativo, que es el corazón del archivo.
 *
 * La tagline dice **qué es** el producto, sin marketing: fútbol federado, temporada a temporada.
 */
export const NOMBRE_PRODUCTO = 'Cantera';

/** Qué es el producto, en una línea. Sin promesas ni mercadotecnia. */
export const TAGLINE = 'fútbol federado, temporada a temporada';

/**
 * La tagline partida donde se lee bien: en la cabecera ocupa dos líneas cortas («fútbol federado,» /
 * «temporada a temporada») para no robarle ancho al buscador. El texto completo es `TAGLINE`.
 */
export const TAGLINE_LINEAS = ['fútbol federado,', 'temporada a temporada'] as const;

/** Título de la pestaña por defecto (layout raíz). Las páginas concretas pueden afinarlo. */
export const TITULO_POR_DEFECTO = `${NOMBRE_PRODUCTO} — ${TAGLINE}`;
