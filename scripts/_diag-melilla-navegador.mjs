#!/usr/bin/env node
/** ¿Falla Melilla también para un navegador normal, o sólo para peticiones simples? */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const urls = [
  'https://www.rfmf.es/pagina/index.php',
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=Actas',
  'https://www.rfmf.es/pagina/index1.php?var=docu&tipo=Calendarios&tem=25-26',
];
const salida = join(import.meta.dirname, '..', 'descargas-federacion-sondeo', 'muestras-melilla');
mkdirSync(salida, { recursive: true });

const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1280,1000', '--lang=es-ES');
const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  for (const url of urls) {
    console.log(`\n→ ${url}`);
    try {
      await driver.get(url);
      await new Promise((r) => setTimeout(r, 4000));
      const html = await driver.executeScript('return document.documentElement.outerHTML');
      const texto = await driver.executeScript('return (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 300)');
      console.log(`  HTML ${html.length} B · título ${JSON.stringify(await driver.getTitle())}`);
      console.log(`  texto: ${texto}`);
      const nombre = url.replace(/[^\w]+/g, '_').slice(0, 80);
      writeFileSync(join(salida, `${nombre}.html`), html);
    } catch (error) {
      console.log(`  ERROR: ${error.message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 9000));
  }
} finally {
  await driver.quit().catch(() => {});
}
