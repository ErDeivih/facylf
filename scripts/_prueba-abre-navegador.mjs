/*
 * Abre un navegador como lo abre un recolector y lo mantiene abierto unos segundos (o hasta que lo maten).
 *
 * Es para las pruebas de limpieza: la herramienta `limpiar-chrome-huerfano.ps1` decide por la CADENA DE PADRES, así
 * que para probarla de verdad hace falta un Chrome colgando de un `node` (no un Chrome suelto, que sería huérfano
 * de verdad). Reproduce los mismos argumentos que usa el recolector (`--user-data-dir=<perfil-chrome>`), que son
 * los que la herramienta mira.
 *
 * Uso: node scripts/_prueba-abre-navegador.mjs <ruta-perfil-chrome> [segundos]
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const perfil = process.argv[2];
const segundos = Number(process.argv[3] ?? 120);
if (!perfil) { console.error('falta la ruta del perfil de Chrome'); process.exit(2); }

const opciones = new chrome.Options();
opciones.addArguments(
  '--window-size=1280,900',
  '--window-position=-32000,-32000',
  '--start-minimized',
  '--blink-settings=imagesEnabled=false',
  '--disable-extensions',
  '--disable-sync',
  '--disable-gpu',
  '--no-first-run',
  `--user-data-dir=${perfil}`,
  '--user-agent=FacylfBot/1.0 (prueba de limpieza)',
);

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
await driver.get('about:blank');
const capacidades = await driver.getCapabilities();
console.log(`navegador abierto (Chrome ${capacidades.getBrowserVersion()}) con el perfil ${perfil}; se queda ${segundos} s`);
await new Promise((resolve) => setTimeout(resolve, segundos * 1000));
try { await driver.quit(); } catch { /* si lo han matado, no hay nada que cerrar */ }
