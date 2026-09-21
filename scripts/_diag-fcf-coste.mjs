#!/usr/bin/env node
/**
 * ¿Cuánto cuesta de verdad cada acción en el portal de la FCF?
 *
 * Mide, con las marcas de rendimiento del propio navegador, qué peticiones dispara cada gesto:
 * cargar el grupo, cambiar de pestaña y desplegar una jornada. De eso depende que el capturador
 * pueda desplegar 30 jornadas de golpe (si es trabajo del cliente) o tenga que espaciarlas.
 *
 * Uso: node scripts/_diag-fcf-coste.mjs [temporadaId] [disciplinaId] [competicioId] [grupId]
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const [, , temporadaId = '22', disciplinaId = '19308233', competicioId = '58162422', grupId = '58315186'] = process.argv;
const URL = `https://www.fcf.cat/ca/competicio?temporadaId=${temporadaId}&disciplinaId=${disciplinaId}&competicioId=${competicioId}&grupId=${grupId}`;
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1400', '--lang=ca-ES',
  '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');

const recursos = (driver) => driver.executeScript(`
  return performance.getEntriesByType('resource')
    .filter((r) => !/\\.(png|jpg|jpeg|svg|webp|woff2?|ico|css)(\\?|$)/i.test(r.name) && !/googletagmanager|google-analytics|seedtag/.test(r.name))
    .map((r) => r.name.replace(location.origin, ''));`);

const nuevos = (antes, despues) => despues.filter((u) => !antes.includes(u));

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });

  let antes = await recursos(driver);
  await driver.get(URL);
  await duerme(9000);
  let despues = await recursos(driver);
  console.log(`CARGA del grupo: ${nuevos(antes, despues).length} ficheros nuevos`);
  console.log(JSON.stringify(nuevos(antes, despues).slice(0, 12), null, 1));

  antes = await recursos(driver);
  await driver.executeScript(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'CALENDARI').pop().click()`);
  await duerme(8000);
  despues = await recursos(driver);
  console.log(`\nPESTAÑA CALENDARI: ${nuevos(antes, despues).length} ficheros nuevos`);
  console.log(JSON.stringify(nuevos(antes, despues).slice(0, 12), null, 1));

  antes = await recursos(driver);
  await driver.executeScript(`
    const t = 'JORNADA 2';
    const cabecera = [...document.querySelectorAll('span,div,h3,h4')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === t)[0];
    (cabecera.closest('div[class*="cursor-pointer"]') || cabecera.parentElement).click();`);
  await duerme(5000);
  despues = await recursos(driver);
  console.log(`\nDESPLEGAR JORNADA 2: ${nuevos(antes, despues).length} ficheros nuevos`);
  console.log(JSON.stringify(nuevos(antes, despues).slice(0, 12), null, 1));

  // ¿Y las 30 jornadas de una tacada? Se miden también los fallos de cada clic.
  antes = await recursos(driver);
  const informe = await driver.executeScript(`
    const cabeceras = [...document.querySelectorAll('span,div,h3,h4')]
      .filter((e) => e.children.length === 0 && /^JORNADA \\d+$/.test(e.textContent.trim()));
    let pulsadas = 0;
    for (const c of cabeceras) {
      const clicable = c.closest('div[class*="cursor-pointer"]') || c.parentElement;
      clicable.click(); pulsadas++;
    }
    return { pulsadas };`);
  await duerme(8000);
  despues = await recursos(driver);
  const partidos = await driver.executeScript(`return document.querySelectorAll('a[href*="/ca/competicio/acta/"]').length;`);
  console.log(`\nDESPLEGAR LAS ${informe.pulsadas} JORNADAS seguidas: ${nuevos(antes, despues).length} ficheros nuevos`);
  console.log(`  partidos visibles ahora: ${partidos}`);
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
