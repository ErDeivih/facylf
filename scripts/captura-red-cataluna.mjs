/*
 * ── ¿DE DÓNDE SACA LA FCF SU LISTA DE TEMPORADAS? ────────────────────────────────────────────────────────
 *
 * Estado de la investigación el 08/10/2026, tras cinco hipótesis y dos aciertos:
 *
 *   ✓ El `if (!temporadas.length)` impedía buscar el historial (leído en el código). CORREGIDO.
 *   ✓ La capa de cookies tapaba los botones del selector (diagnóstico con posiciones). CORREGIDO.
 *   ✓ El desplegable de temporadas sólo ofrece dos, 2026-27 y 2025-26 (ejecutado, sin incidencias).
 *   ✗ Los identificadores de la URL no son correlativos: `?temporadaId=20` y `=11` cargan la página pero
 *     NO muestran ninguna temporada. Probado, y no se tocó nada por ello.
 *
 * Así que la pregunta ya no es «por qué falla el recolector» —eso está resuelto— sino **dónde publica la FCF
 * sus temporadas antiguas**. Y eso no se deduce: se mira.
 *
 * Y se mira **capturando el tráfico de la página**: cuando el desplegable de temporadas se rellena, la lista
 * viene de alguna parte —un JSON, una API— y ahí estarán las temporadas de verdad con sus identificadores.
 *
 * Esto NO arregla nada: escucha.
 *
 * Uso:  node scripts/captura-red-cataluna.mjs
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const opciones = new chrome.Options()
  .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1200')
  .setLoggingPrefs({ performance: 'ALL', browser: 'ALL' });

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await driver.manage().setTimeouts({ pageLoad: 90000, script: 30000 });
  await driver.get('https://www.fcf.cat/ca/competicio');
  await duerme(6000);

  // Cerrar el aviso si está (ya sabemos que se pinta tarde).
  for (let i = 0; i < 8; i++) {
    const p = await driver.executeScript(`
      const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'AGREE');
      if (!b) return false; b.click(); return true;`);
    if (p) { console.log('  · aviso de cookies cerrado'); await duerme(2000); break; }
    await duerme(1500);
  }

  // Abrir el desplegable de temporadas: eso dispara la petición que buscamos.
  await driver.executeScript(`
    const b = [...document.querySelectorAll('button')].find((x) => /^\\d{4}-\\d{2}$/.test((x.innerText || '').trim()));
    if (b) b.click();`);
  await duerme(6000);

  // Y ahora TODO lo que la página ha pedido por la red.
  const entradas = await driver.manage().logs().get('performance');
  const porUrl = new Map();
  for (const e of entradas) {
    let m; try { m = JSON.parse(e.message).message; } catch { continue; }
    if (m.method !== 'Network.responseReceived') continue;
    const r = m.params.response;
    porUrl.set(r.url, { tipo: r.mimeType, estado: r.status, url: r.url });
  }

  console.log(`\n══ PETICIONES DE LA PÁGINA (${porUrl.size}) ══`);
  const interesantes = [...porUrl.values()].filter((r) =>
    /json|javascript|xml/i.test(r.tipo) && !/\.(png|jpg|css|woff|svg|gif)/i.test(r.url));
  for (const r of interesantes) {
    console.log(`  [${r.estado}] ${String(r.tipo).padEnd(18)} ${r.url.slice(0, 130)}`);
  }

  // ¿Alguna respuesta menciona temporadas o años?
  console.log('\n══ RESPUESTAS QUE HABLAN DE TEMPORADAS ══');
  let encontradas = 0;
  for (const r of interesantes) {
    if (!/json/i.test(r.tipo)) continue;
    try {
      const cuerpo = await driver.executeAsyncScript(`
        const url = arguments[0]; const cb = arguments[arguments.length - 1];
        fetch(url).then((x) => x.text()).then((t) => cb(t.slice(0, 2000))).catch((e) => cb('ERROR ' + e.message));`, r.url);
      if (/temporada|20\d\d-?\d\d/i.test(cuerpo)) {
        encontradas++;
        console.log(`\n  ► ${r.url}`);
        console.log(`    ${cuerpo.replace(/\s+/g, ' ').slice(0, 600)}`);
      }
    } catch { /* no se pudo leer: no es un fallo, es que no aplica */ }
  }
  if (!encontradas) console.log('  Ninguna respuesta JSON menciona temporadas (puede venir en el HTML, o en una petición no capturada).');
} catch (error) {
  console.error(`\n*** ${error.message} ***`);
} finally {
  await driver.quit().catch(() => {});
}
