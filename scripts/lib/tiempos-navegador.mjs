/*
 * tiempos-navegador.mjs — los tiempos que se le dan a Selenium para una página.
 *
 * POR QUÉ EXISTE (09/11/2026). Estaban escritos a mano en `recolector-local.mjs` con
 * `pageLoad: 30_000, script: 15_000`. Medido en el servidor: las peticiones de Castilla y León que
 * salían bien tardaban 18-20 s de media (el 28-30/10 eran 11-12 s), así que una de cada cinco se
 * quedaba pegada al límite y el 83 % de las peticiones del día se perdía con «Timed out receiving
 * message from renderer» a los ~30 s. El `pageLoad` de 30 s no protegía de nada: sólo tiraba trabajo ya
 * hecho a medias y volvía a poner el trabajo en la cola. Los demás recolectores de navegador
 * (`recolector-cataluna.mjs`, `sondeo-navegador.mjs`, las diag de la FCF) ya usan 60 s.
 *
 * El valor es un TIEMPO DE ESPERA, no un ritmo: subirlo hace que el recolector aguante una página lenta,
 * no que pida más. La pausa entre peticiones y el tope diario no se tocan aquí.
 *
 * Se puede cambiar sin desplegar código con `FACYLF_PAGELOAD_MS` y `FACYLF_SCRIPT_MS` (útil para una
 * federación concreta sin tocar el resto), pero los valores absurdos se ignoran: un 0 o un negativo
 * dejaría al recolector fallando todas las páginas, que es peor que el problema que se arregla.
 */

/** Margen para que la página termine de cargar. Medido: 18-20 s de media en CyL el 09/11/2026. */
export const TIMEOUT_CARGA_MS = 60_000;

/** Margen para los scripts de la página (los portales PNFG cargan datos con JavaScript). */
export const TIMEOUT_SCRIPT_MS = 15_000;

const MINIMO_CARGA_MS = 10_000;
const MINIMO_SCRIPT_MS = 1_000;
const MAXIMO_MS = 300_000;

function leeTiempo(entorno, nombre, porDefecto, minimo) {
  const bruto = entorno?.[nombre];
  if (bruto === undefined || bruto === null) return porDefecto;
  const texto = String(bruto).trim();
  if (texto === '') return porDefecto;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || !Number.isInteger(numero)) return porDefecto;
  if (numero < minimo || numero > MAXIMO_MS) return porDefecto;
  return numero;
}

/**
 * Tiempos de Selenium para una sesión de navegador.
 * @param {Record<string, string|undefined>} [entorno] normalmente `process.env` (se inyecta en las pruebas)
 * @returns {{ pageLoad: number, script: number }}
 */
export function tiemposNavegador(entorno = process.env) {
  return {
    pageLoad: leeTiempo(entorno, 'FACYLF_PAGELOAD_MS', TIMEOUT_CARGA_MS, MINIMO_CARGA_MS),
    script: leeTiempo(entorno, 'FACYLF_SCRIPT_MS', TIMEOUT_SCRIPT_MS, MINIMO_SCRIPT_MS),
  };
}
