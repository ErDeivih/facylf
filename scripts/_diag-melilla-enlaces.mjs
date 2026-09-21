#!/usr/bin/env node
/** Enlaces de la portada de Melilla y prueba de sus páginas de competición en un navegador real. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const carpeta = join(import.meta.dirname, '..', 'descargas-federacion-sondeo', 'muestras-melilla');
const portada = readdirSync(carpeta).find((f) => f.includes('index_php'));
const h = readFileSync(join(carpeta, portada), 'utf8');
const enlaces = [...new Set([...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];
console.log(`portada ${portada}: ${enlaces.length} enlaces distintos`);
const interesantes = enlaces.filter((u) => /competic|docu|acta|calend|clasif|result|pnfg|fed/i.test(u));
console.log(JSON.stringify(interesantes.slice(0, 30), null, 1));

const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1280,1000', '--lang=es-ES');
const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  for (const enlace of interesantes.slice(0, 4)) {
    const url = enlace.startsWith('http') ? enlace : `https://www.rfmf.es/${enlace.replace(/^\//, '')}`;
    try {
      await driver.get(url);
      await new Promise((r) => setTimeout(r, 4000));
      const texto = await driver.executeScript('return (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 200)');
      console.log(`\n${url}\n   ${texto}`);
    } catch (error) {
      console.log(`\n${url}\n   ERROR: ${error.message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 9000));
  }
} finally {
  await driver.quit().catch(() => {});
}
