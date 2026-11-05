/**
 * El tema claro/oscuro de la web, decidido en el servidor.
 *
 * La cookie `tema` es la única fuente de verdad: el layout raíz la lee en cada petición y escribe
 * `<html data-tema="claro|oscuro">`. Los tokens de `tokens.css` hacen el resto
 * (`:root[data-tema="oscuro"]`), así que el primer HTML ya sale con el tema correcto y no hace falta
 * un `useEffect` que lo aplique después (eso produce parpadeo y lo prohíbe SISTEMA-DISENO.md §2).
 *
 * Este módulo es lógica pura, sin Next ni DOM: se puede probar sin navegador y lo comparten el
 * servidor (layout) y el cliente (botón de la cabecera).
 */

export type Tema = 'claro' | 'oscuro';

/** Nombre de la cookie. El valor es exactamente uno de los dos `Tema`. */
export const TEMA_COOKIE = 'tema';

/**
 * Cabecera interna donde `src/proxy.ts` deja la ruta de la petición, para que el layout raíz —que no
 * recibe la ruta por props— pueda decidir si el tema se aplica. No viaja al navegador: es cabecera de
 * petición.
 */
export const CABECERA_RUTA = 'x-pathname';

/** Las zonas migradas al diseño nuevo hoy: el rediseño de competición y la entrada de usuarios. */
const RUTAS_CON_TEMA = ['/explorar', '/entrar'] as const;

/**
 * ¿Esta ruta admite el tema oscuro? Sólo las pantallas del rediseño (`/explorar…` y `/entrar`). Las
 * páginas viejas todavía tienen colores literales (`bg-white`, `#5C646C`…) que en oscuro quedan
 * ilegibles, así que allí se fuerza claro hasta que se migren. Se compara por segmento: `/explorarx`
 * no cuenta.
 */
export function esRutaConTema(ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  return RUTAS_CON_TEMA.some((base) => ruta === base || ruta.startsWith(`${base}/`));
}


/**
 * Traduce el valor crudo de la cookie a un tema. Cookie ausente, vacía o con un valor que no es
 * `oscuro` → claro: ante la duda, el tema de siempre y el que ya está probado, nunca uno inventado.
 */
export function temaDeCookie(valor: string | null | undefined): Tema {
  return valor === 'oscuro' ? 'oscuro' : 'claro';
}

/**
 * El tema que hay en la cookie tal y como la ve el navegador (`document.cookie`). Sólo se usa al
 * navegar entre rutas migradas y viejas: el primer render lo resuelve el servidor.
 */
export function temaDeCookies(cadena: string | null | undefined): Tema {
  if (!cadena) return 'claro';
  for (const trozo of cadena.split(';')) {
    const limpio = trozo.trim();
    if (limpio.startsWith(`${TEMA_COOKIE}=`)) return temaDeCookie(limpio.slice(TEMA_COOKIE.length + 1));
  }
  return 'claro';
}

/** El otro tema. */
export function temaSiguiente(tema: Tema): Tema {
  return tema === 'oscuro' ? 'claro' : 'oscuro';
}

/**
 * Nombre accesible del control que lleva la interfaz **a** ese tema: dice qué hará al pulsarlo, no
 * en qué estado está. En tema claro se anuncia «Cambiar a tema oscuro»; en oscuro, lo contrario.
 */
export function etiquetaDeTema(tema: Tema): string {
  return tema === 'oscuro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
}
