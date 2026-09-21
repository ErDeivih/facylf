#!/usr/bin/env node
/**
 * Busca en la portada de Melilla TODAS las rutas que ofrece su web, no sólo las de documentación.
 *
 *  Su zona de documentos (`index1.php?var=docu…`) devuelve HTTP 500, pero puede haber otras secciones
 *  que sí funcionen y lleven a calendarios o clasificaciones.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const SALIDA = join(import.meta.dirname, '..', 'descargas-federacion-sondeo', 'muestras-melilla');
mkdirSync(SALIDA, { recursive: true });
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1400,1200', '--lang=es-ES');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get('https://www.rfmf.es/pagina/index.php');
  await duerme(7000);
  const info = await driver.executeScript(`
    const enlaces = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    const unicos = [...new Set(enlaces)];
    const paginas = unicos.filter((u) => /\\.php|\\?var=|competic|clasif|calend|acta|resultad|equipo|jugador/i.test(u));
    const menus = [...document.querySelectorAll('nav a, .menu a, li a')].map((a) => (a.innerText || '').trim() + ' → ' + a.getAttribute('href'));
    return { total: unicos.length, paginas, menus: [...new Set(menus)].slice(0, 40) };`);
  console.log(`enlaces totales: ${info.total}`);
  console.log('\npáginas candidatas:');
  for (const p of info.paginas) console.log(`  ${p}`);
  console.log('\nmenú:');
  for (const m of info.menus) console.log(`  ${m}`);

  // Prueba cada página candidata distinta de las de documentación ya conocidas.
  const aProbar = info.paginas.filter((u) => !/var=docu/i.test(u)).slice(0, 6);
  for (const rel of aProbar) {
    const url = rel.startsWith('http') ? rel : `https://www.rfmf.es/pagina/${rel.startsWith('/') ? rel.slice(1) : rel}`;
    try {
      await driver.get(url);
      await duerme(4000);
      const t = await driver.executeScript('return (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 220)');
      console.log(`\n${url}\n   ${t}`);
      writeFileSync(join(SALIDA, `${rel.replace(/[^\w]+/g, '_').slice(0, 60)}.html`),
        await driver.executeScript('return document.documentElement.outerHTML'));
    } catch (error) {
      console.log(`\n${url}\n   ERROR: ${error.message.split('\n')[0]}`);
    }
    await duerme(8000);
  }
} finally {
  await driver.quit().catch(() => {});
}
