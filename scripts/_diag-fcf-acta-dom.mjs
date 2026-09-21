#!/usr/bin/env node
/**
 * Describe la estructura del DOM de una ficha de acta de la FCF para poder interpretarla.
 *
 * Uso: node scripts/_diag-fcf-acta-dom.mjs [codacta]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const codacta = process.argv[2] ?? '3790857';
const SALIDA = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
mkdirSync(SALIDA, { recursive: true });
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,2000', '--lang=ca-ES',
  '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get(`https://www.fcf.cat/ca/competicio/acta/${codacta}`);
  await duerme(9000);

  const informe = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const marcas = ['Titulars', 'Suplents', 'Alineacions', 'Gols', 'Targetes', 'Canvis', 'Àrbitres', 'Entrenador/a'];
    const salida = {};
    for (const marca of marcas) {
      const nodo = [...principal.querySelectorAll('*')].find((e) => e.children.length === 0
        && e.textContent.trim().toLowerCase() === marca.toLowerCase());
      if (!nodo) { salida[marca] = null; continue; }
      const contenedor = nodo.closest('section,div[class*="border"],div[class*="rounded"]') || nodo.parentElement;
      salida[marca] = {
        etiqueta: nodo.tagName, clase: (nodo.className || '').toString().slice(0, 80),
        contenedorClase: (contenedor.className || '').toString().slice(0, 120),
        hermanoSiguiente: contenedor.nextElementSibling
          ? contenedor.nextElementSibling.outerHTML.replace(/\\s+/g, ' ').slice(0, 900) : null,
        contenedorHtml: contenedor.outerHTML.replace(/\\s+/g, ' ').slice(0, 1400),
      };
    }
    return salida;`);

  for (const [marca, dato] of Object.entries(informe)) {
    console.log(`\n########## ${marca}`);
    if (!dato) { console.log('  (no aparece)'); continue; }
    console.log(`  nodo: ${dato.etiqueta}.${dato.clase}`);
    console.log(`  contenedor: ${dato.contenedorClase}`);
    console.log(`  contenido: ${dato.contenedorHtml}`);
  }
  const html = await driver.executeScript('return document.documentElement.outerHTML');
  writeFileSync(join(SALIDA, `acta-dom-${codacta}.html`), html);
  console.log(`\n(HTML completo en _muestras/acta-dom-${codacta}.html)`);
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
