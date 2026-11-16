/**
 * ── BANDERAS DE CHROME: lo que se le pide al navegador de cada recolector ──────────────────────────────
 *
 * Estaban repartidas entre los dos recolectores que abren navegador (`recolector-local.mjs` para las PNFG y
 * `recolector-cataluna-datos.mjs` para la FCF), cada uno con su lista copiada. Aquí viven una sola vez, con
 * el motivo de cada grupo de banderas, para que un recorte se aplique a los dos y se pueda probar sin abrir
 * nada.
 *
 * ── LO QUE SE INTENTÓ Y NO SIRVIÓ (medido el 21/09/2026, y se deja escrito para no repetirlo) ────────────
 *
 * Con la flota en marcha, el navegador de UNA federación cuesta ~480-630 MB residentes en 7 procesos
 * (2 renderers, raíz, gpu, 2 utility, crashpad). Para bajarlo se probaron, con la MISMA página y en A/B con
 * el orden alternado (`scripts/prueba-banderas-chrome.mjs`):
 *
 *   · `--js-flags=--max-old-space-size=128` (techo del montón de V8);
 *   · apagar servicios auxiliares que este proyecto no usa (`AudioServiceOutOfProcess`, `MediaRouter`,
 *     `Translate`, `BackForwardCache`, `OptimizationHints`, `SpareRendererForSitePerProcess`);
 *   · `--disable-component-update`.
 *
 * Resultado medido sobre dos actas reales de Navarra: **4 MB residentes y 2 MB privados de diferencia**
 * (ruido), los mismos 7 procesos y los mismos 2 renderers; el contenido, idéntico. El tamaño lo manda la
 * página y el coste fijo de Chrome, no el montón de JavaScript. Se retiraron las tres: no se deja en el
 * código una bandera que no ahorra nada sólo porque suena razonable. El A/B está guardado en
 * `pruebas/reconstruccion/banderas-chrome.json` y se puede repetir con
 * `node scripts/prueba-banderas-chrome.mjs --federacion navarra --actas 2`.
 *
 * Lo que SÍ bajó de verdad el consumo fue quitar la capa de supervisores de Windows (ver
 * `docs/plataforma-web/RECOLECCION-10GB.md`, apartado del 21/09/2026): 1,1 GB de 37 procesos a uno solo.
 */

/**
 * Techo del montón de JavaScript de cada proceso de Chrome, en MB. **No está en uso**: el A/B del
 * 21/09/2026 demostró que no ahorra memoria en estos portales. Se conserva el número para no perder la
 * referencia de lo que se probó.
 */
export const MB_MONTON_V8_PROBADO = 128;

/**
 * Funciones de Chrome que este proyecto no usa... salvo las dos primeras, que son las que importan.
 *
 * Las dos primeras son el aislamiento de sitios (medido el 19/09/2026: sin ellas cada dominio acababa en su
 * propio renderer y un navegador llegaba a 36 renderers y 3.279 MB). Las demás se probaron el 21/09/2026 y
 * **no aportaron nada medible**, así que no se incluyen: apagarlas no cambia ni el número de procesos.
 *
 * IMPORTANTE: van en UNA sola bandera. Repetir `--disable-features` no acumula: Chrome se queda con la
 * última, así que separarlas en dos sería perder silenciosamente las primeras. Hay una prueba que lo vigila.
 */
export const FUNCIONES_QUE_NO_SE_USAN = [
  'IsolateOrigins',
  'site-per-process',
];

/**
 * Las banderas comunes a los dos recolectores: las que ahorran memoria sin tocar el contenido.
 */
function banderasDeAhorro() {
  return [
    // Cada worker usa UNA pestaña y sólo necesita HTML.
    '--blink-settings=imagesEnabled=false',
    // ── TERCEROS QUE NO RESUELVEN (medido el 16/11/2026) ────────────────────────────────────────────
    // El acta tarda 47-67 s con el servidor al 75 % de CPU ociosa y las imágenes ya apagadas. El portal
    // responde en 0,45 s, así que la espera es de los subrecursos de publicidad/consentimiento: dominios
    // que no resuelven y que Chrome espera hasta agotar el tiempo. Aquí se fuerza a que TODO lo que no sea
    // el portal y su CDN falle al instante (NOTFOUND), sin esperar. Solo se pide HTML, así que no se pierde
    // nada del acta.
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE *.rfcylf.es, EXCLUDE filesrfcylf.filesnovanet.es',
    '--disable-domain-reliability',
    '--no-pings',
    '--disable-extensions',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-application-cache',
    '--disk-cache-size=1',
    '--media-cache-size=1',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--renderer-process-limit=1',
    `--disable-features=${FUNCIONES_QUE_NO_SE_USAN.join(',')}`,
    '--disable-site-isolation-trials',
    '--process-per-site',
  ];
}

/**
 * La lista de argumentos del navegador para un recolector.
 *
 *   · `variante: 'pnfg'`  — en el PC la ventana se abre fuera de la vista (el portal no ve nada raro y el
 *     usuario no ve nada); dentro de Docker va sin cabeza porque no hay servidor gráfico.
 *   · `variante: 'cataluna'` — siempre sin cabeza, en catalán y con ventana más grande (su portal mide así).
 *
 * `perfil` e `identidad` se añaden sólo si llegan: son datos de cada federación, no banderas fijas.
 */
export function banderasDeChrome({ variante = 'pnfg', perfil = null, identidad = null, headless = false, lang = null } = {}) {
  const banderas = [];
  const sinCabeza = headless || variante === 'cataluna';

  if (sinCabeza) {
    // Sin servidor gráfico: `--no-sandbox` porque el contenedor ya está aislado y `--disable-dev-shm-usage`
    // porque el /dev/shm de Docker son 64 MB y Chrome se queda sin memoria compartida a la tercera página.
    banderas.push('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox');
    banderas.push('--window-size=1600,1600');
  } else {
    banderas.push('--window-size=1280,900', '--window-position=-32000,-32000', '--start-minimized');
  }

  banderas.push(...banderasDeAhorro());
  if (lang) banderas.push(`--lang=${lang}`);
  if (perfil) banderas.push(`--user-data-dir=${perfil}`);
  if (identidad) banderas.push(`--user-agent=${identidad}`);
  return banderas;
}

/**
 * El techo de memoria del navegador a partir del cual el recolector lo recicla.
 *
 * 900 MB es el valor de siempre y sigue siendo el que se usa: bajar el tope se probó el 21/09/2026 y **no
 * compensa**, porque el navegador ya se queda en ~480-630 MB en cuanto carga unas páginas, así que un tope
 * de 500 MB reciclaría casi en cada trabajo (más arranques de Chrome que memoria ahorrada). La variable
 * `FACYLF_TOPE_NAVEGADOR_MB` existe para poder ajustarlo por máquina sin tocar el código, y un valor ausente
 * o mal escrito no cambia nada: manda el 900 de siempre.
 */
export function topeDeNavegadorMb(valor, porDefecto = 900) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto;
}
