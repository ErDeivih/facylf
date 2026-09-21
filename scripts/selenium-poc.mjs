// Prueba de concepto: Selenium (navegador real) para acceder a la federación.
//
// Teoría: el sitio usa una compuerta anti-bot que se resuelve por JS (cookie de sesión) y
// carga los grupos por AJAX. Un navegador real (Selenium) ejecuta ese JS y lo resuelve
// solo, a diferencia del cliente HTTP puro.
//
// Uso (en la máquina con navegador y red):
//   pnpm add selenium-webdriver        # una vez
//   node scripts/selenium-poc.mjs                          # grupo AJAX de una competición
//   node scripts/selenium-poc.mjs "https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24218963&CodGrupo=24218968&CodTemporada=22&CodJornada=1"
//
// Identidad: usa el User-Agent honesto (FacylfBot/1.0 con URL y contacto), que es lo que
// exige el proyecto: NO se suplanta a Chrome ni a Googlebot.

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const url =
  process.argv[2] ||
  'https://www.rfcylf.es/pnfg/NPcd/NFG_POR_Lst_Competiciones_Grupos?codcompeticion=24218963&N_Ajax=1';
const salida = path.join(process.cwd(), 'descargas-federacion', 'selenium');
fs.mkdirSync(salida, { recursive: true });

// Identidad honesta del bot (URL + contacto). Ponlos en .env como BOT_URL/BOT_CONTACTO.
const bot =
  `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;

const options = new chrome.Options();
options.addArguments(
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1280,900',
  `--user-agent=${bot}`, // honesto, no suplanta a Chrome
);
options.set('download.default_directory', salida);
options.set('prefs', { 'download.directory_upgrade': true, 'download.prompt_for_download': false });

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
try {
  console.log('→ Entrando en rfcylf.es …');
  await driver.get('https://www.rfcylf.es/');
  await driver.sleep(1500);

  // Intenta aceptar el aviso de cookies (best-effort; cada sitio usa un botón distinto).
  for (const selector of ['text=Aceptar', 'text=Acepto', 'button:has-text("Aceptar")', '#accept', '[aria-label="Aceptar"]']) {
    try {
      const boton = await driver.findElement({ css: selector });
      await boton.click();
      await driver.sleep(400);
      break;
    } catch {
      /* no existe ese botón; seguimos */
    }
  }

  console.log('→ Abriendo', url);
  await driver.get(url);
  await driver.sleep(1200);

  console.log('· Título:', await driver.getTitle());

  // Texto visible (aparición de "No se ha aceptado el cookie" = la compuerta no se pasó).
  const cuerpo = (await driver.executeScript('return document.body ? document.body.innerText : ""')) || '';
  console.log('· Texto (recortado):', cuerpo.replace(/\s+/g, ' ').slice(0, 300));

  // Extrae las opciones de los <select> (los grupos, p. ej. "Primera - Salamanca").
  const selects = await driver.findElements({ css: 'select' });
  for (const sel of selects) {
    const ops = await sel.findElements({ css: 'option' });
    const valores = [];
    for (const o of ops) valores.push({ value: await o.getAttribute('value'), texto: await o.getText() });
    console.log('· Select grupos:', JSON.stringify(valores.filter((v) => /^\d+$/.test(String(v.value))).slice(0, 15)));
  }

  console.log('\n✅ POC terminado (si ves el texto y los grupos, Selenium puede acceder).');
} finally {
  await driver.quit();
}
