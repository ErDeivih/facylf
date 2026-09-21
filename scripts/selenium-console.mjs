// Selenium: captura la RED + CONSOLA al cambiar de temporada, para descubrir el endpoint
// que carga las competiciones de un año histórico. (El sitio no lo expone por URL directa.)
//
// Uso:  node scripts/selenium-console.mjs 18    (temporada a probar)
// Escribe: descargas-federacion/selenium/red-<temp>.json   (todas las URLs de red)
//          descargas-federacion/selenium/consola-<temp>.json (mensajes de consola)

import path from 'node:path';
import fs from 'node:fs';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const target = String(process.argv[2] || '18');
const carpeta = path.join(process.cwd(), 'descargas-federacion', 'selenium');
fs.mkdirSync(carpeta, { recursive: true });

const bot = `FacylfBot/1.0 (+${process.env.BOT_URL || 'https://xd.es/bot'}; ${process.env.BOT_CONTACTO || 'bot@xd.es'})`;
const options = new chrome.Options();
options.addArguments('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1280,900', `--user-agent=${bot}`);
options.set('goog:loggingPrefs', { performance: 'ALL', browser: 'ALL' });

const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

// Saca las URLs de las entradas de red del log de performance.
function urlsDeLog(entries) {
  return entries
    .map((e) => { try { return JSON.parse(e.message).message.params.request.url; } catch { return null; } })
    .filter(Boolean);
}

try {
  console.log('→ Cargando página (temporada 22) …');
  await driver.get('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22');
  await driver.sleep(2500);

  // Cambia la temporada a la indicada (dispara la recarga del sitio).
  console.log(`→ Seleccionando temporada ${target} …`);
  await driver.executeScript(
    (v) => {
      const s = [...document.querySelectorAll('select')].find((x) =>
        [...x.options].some((o) => /^20\d\d-20\d\d$/.test(o.text)));
      if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }
    },
    target,
  );
  await driver.sleep(4000);

  // Red (rendimiento) y consola.
  const perf = await driver.manage().logs().get('performance');
  const urls = urlsDeLog(perf);
  const rutaRed = path.join(carpeta, `red-${target}.json`);
  fs.writeFileSync(rutaRed, JSON.stringify({ temporada: target, urls }, null, 2));

  const browserLogs = (await driver.manage().logs().get('browser')).map((e) => e.message);
  const rutaCon = path.join(carpeta, `consola-${target}.json`);
  fs.writeFileSync(rutaCon, JSON.stringify({ temporada: target, logs: browserLogs }, null, 2));

  console.log(`  · ${urls.length} peticiones de red → ${path.basename(rutaRed)}`);
  console.log(`  · consola → ${path.basename(rutaCon)}`);
  // Peticiones que puedan ser la lista de competiciones (contienen "Lst" o "Cmp" o "Ajax")
  const candidatas = urls.filter((u) => /NFG|Lst|Cmp|Ajax|Grupos|Competiciones/i.test(u));
  console.log('\nCandidatas (peticiones del sitio):');
  candidatas.forEach((u) => console.log('  · ' + u));

  console.log('\n✅ Listo. Leo los ficheros.');
} finally {
  await driver.quit();
}
