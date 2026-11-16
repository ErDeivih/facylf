/*
 * renderiza-dom.mjs — deja en tmp/dom-render el DOM completo de las rutas de la foto pública.
 *
 * Por qué: Next sirve el contenido de las pantallas con datos por streaming; el HTML crudo trae el
 * esqueleto de carga. `espeja-para-pages.mjs` quita el JavaScript para publicar una foto estática, así
 * que sin este paso la clasificación y las jornadas se publicaban vacías («Cargando…»). Esto abre cada
 * ruta con Chromium (Playwright), espera a que la red quede quieta y guarda el DOM ya renderizado con el
 * nombre que espera el espejo (`<ruta_con_guiones_bajos>.html`, la raíz es `root.html`).
 *
 * Uso (con la app sirviendo en :3001):
 *   node scripts/claude/renderiza-dom.mjs
 *   node scripts/claude/renderiza-dom.mjs http://127.0.0.1:3002
 *
 * Después:
 *   node scripts/claude/espeja-para-pages.mjs <origen> tmp/site-pages /fondo-popular-demo
 */
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const requerir = createRequire(resolve('apps/web/package.json'));
const { chromium } = requerir('@playwright/test');
const origen = process.argv[2] ?? 'http://127.0.0.1:3001';
const raiz = 'tmp/site-pages';
const salida = 'tmp/dom-render';
mkdirSync(salida, { recursive: true });

const nombreDom = (ruta) => (ruta === '/'
  ? 'root'
  : ruta.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '') || 'root');

/** Rutas = los index.html que ya tiene la foto anterior; así se cubren también las páginas enlazadas. */
const rutas = [];
function recorre(dir) {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) recorre(p);
    else if (entrada === 'index.html') {
      const rel = dir.slice(raiz.length).replaceAll('\\', '/');
      rutas.push(rel === '' ? '/' : rel);
    }
  }
}
recorre(raiz);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
let ok = 0;
for (const ruta of rutas) {
  try {
    const respuesta = await pagina.goto(`${origen}${ruta}`, { waitUntil: 'networkidle', timeout: 60000 });
    if (!respuesta || respuesta.status() >= 400) { console.log(`✗ ${ruta} ${respuesta?.status()}`); continue; }
    await pagina.waitForTimeout(300);
    writeFileSync(join(salida, `${nombreDom(ruta)}.html`), await pagina.content(), 'utf8');
    ok += 1;
    if (ok % 25 === 0) console.log(`  ${ok}/${rutas.length}`);
  } catch (error) {
    console.log(`✗ ${ruta} ${String(error.message).slice(0, 100)}`);
  }
}
await navegador.close();
console.log(`renderizadas ${ok}/${rutas.length} rutas en ${salida}`);
