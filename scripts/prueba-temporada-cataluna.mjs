/*
 * ¿Se puede pedir una temporada ANTIGUA de la FCF por su identificador en la URL?
 *
 * El 08/10/2026 el diagnóstico (`diagnostica-selector-cataluna.mjs`) demostró que el **desplegable de
 * temporadas sólo ofrece dos** (2026-27 y 2025-26) mientras la URL lleva la temporada como número:
 * `https://www.fcf.cat/ca/competicio?temporadaId=22`. El descubridor dependía del desplegable, así que
 * terminaba **sin error y sin avanzar** — el fallo silencioso perfecto, y así desde septiembre.
 *
 * Antes de reescribir el descubrimiento para que recorra identificadores, esto comprueba que la web **acepta**
 * una temporada antigua pedida así. No arregla nada: verifica.
 *
 * Uso:  node scripts/prueba-temporada-cataluna.mjs 11 15 20 22
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!ids.length) { console.error('uso: prueba-temporada-cataluna.mjs <id> [id...]'); process.exit(2); }

const opciones = new chrome.Options()
  .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1200');
const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await driver.manage().setTimeouts({ pageLoad: 90000, script: 30000 });
  for (const id of ids) {
    const url = `https://www.fcf.cat/ca/competicio?temporadaId=${id}`;
    try {
      await driver.get(url);
      await duerme(5000);
      // Cerrar el aviso si está (se pinta tarde, igual que en el descubridor).
      for (let i = 0; i < 8; i++) {
        const p = await driver.executeScript(`
          const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'AGREE');
          if (!b) return false; b.click(); return true;`);
        if (p) { await duerme(1500); break; }
        await duerme(1500);
      }
      // Lo que la página dice de sí misma: la temporada seleccionada y cuánto contenido tiene.
      const info = await driver.executeScript(`
        const botones = [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim());
        const temporada = botones.find((t) => /^\\d{4}-\\d{2}$/.test(t)) || '(ninguna)';
        const competiciones = [...document.querySelectorAll('ul li')].length;
        const titulo = document.title;
        return { temporada, competiciones, titulo };`);
      const urlFinal = await driver.getCurrentUrl();
      console.log(`  id ${String(id).padStart(3)}  →  temporada «${info.temporada}»  ·  ${info.competiciones} li  ·  ${urlFinal.slice(-28)}`);
      if (!/temporadaId=/.test(urlFinal)) console.log('        ⚠ la URL perdió el parámetro: puede que el id no exista');
    } catch (error) {
      console.log(`  id ${String(id).padStart(3)}  →  ERROR: ${String(error.message).slice(0, 70)}`);
    }
    await duerme(2000);
  }
} finally {
  await driver.quit().catch(() => {});
}
