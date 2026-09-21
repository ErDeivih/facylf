// Selenium: cambia la temporada en el DESPLEGABLE y vuelca el HTML de cada una.
// (El histórico se puebla al cambiar el desplegable con ventana real; no en headless.)
// Luego procesamos cada html-<temp>.html con competicionesDeSelect (temporada → competiciones).
//
// Uso:  node scripts/selenium-html.mjs 22 18 8        (temporadas a volcar)
//       node scripts/selenium-html.mjs                (por defecto: 22 18 8)
// Escribe: descargas-federacion/selenium/html-<temp>.html

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const temporadas = args.length ? args : [22, 18, 8];
const carpeta = path.join(process.cwd(), 'descargas-federacion', 'selenium');
fs.mkdirSync(carpeta, { recursive: true });

const bot = `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;
const options = new chrome.Options();
// Ventana REAL: el sitio no puebla el histórico para headless.
options.addArguments('--window-size=1280,900', `--user-agent=${bot}`);
options.set('download.default_directory', carpeta);

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

async function indiceTemporada() {
  return await driver.executeScript(`
    return [...document.querySelectorAll('select')].findIndex(s => [...s.options].some(o => /^20\\d\\d-20\\d\\d$/.test(o.text)));
  `);
}
async function cambiaTemporada(idx, value) {
  await driver.executeScript(
    (i, v) => { const s = document.querySelectorAll('select')[i]; if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } },
    idx, value,
  );
}

try {
  console.log('→ Sesión …');
  await driver.get('https://www.rfcylf.es/');
  await driver.sleep(1500);
  for (const selector of ['text=Aceptar', 'text=Acepto', 'button:has-text("Aceptar")', '#accept', '[aria-label="Aceptar"]']) {
    try { const b = await driver.findElement({ css: selector }); await b.click(); await driver.sleep(400); break; } catch { /* no existe */ }
  }

  console.log('→ Cargando página (temporada actual) …');
  await driver.get('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22');
  await driver.sleep(3000);
  const iT = await indiceTemporada();

  for (const temp of temporadas) {
    console.log(`→ Cambiando a temporada ${temp} …`);
    if (iT >= 0) await cambiaTemporada(iT, String(temp));
    await driver.sleep(7000); // que el JS navegue y pueble
    const html = await driver.executeScript('return document.documentElement.outerHTML');
    const ruta = path.join(carpeta, `html-${temp}.html`);
    fs.writeFileSync(ruta, html, 'utf8');
    const nops = (html.match(/<option[^>]*value="\d{5,}"/g) || []).length;
    console.log(`  · temporada ${temp}: ${ruta} (${html.length} caracteres, ${nops} opciones de 5+ dígitos)`);
    await driver.sleep(2500);
  }
  console.log('\n✅ Listo. Yo proceso los html-*.html y saco las competiciones de cada temporada.');
} finally {
  await driver.quit();
}
