/*
 * ── ¿POR QUÉ NO SE DESPLIEGA LA LISTA DE TEMPORADAS DE LA FCF? ────────────────────────────────────────────
 *
 * El 08/10/2026 el descubridor de Cataluña fallaba así, tres veces seguidas y con tres parches distintos:
 *
 *   → https://www.fcf.cat/ca/competicio
 *     ↻ la lista de «2026-27» aún no está disponible; reintento 1/3
 *     ↻ la lista de «2026-27» aún no está disponible; reintento 2/3
 *   TimeoutError: Wait timed out after 45182ms
 *
 * Se sabe que el botón «2026-27» **existe** (el código entra a su rama de reintento, no a la de «no está el
 * botón»), que **se pulsa**, y que **su lista no aparece**. Y eso tiene cuatro causas posibles que NO se
 * distinguen desde fuera:
 *
 *   1. que el botón que se pulsa no sea el del selector (puede haber varios con el mismo texto);
 *   2. que la lista tarde más de 45 s (la web catalana es lenta de forma consistente);
 *   3. que un `.click()` de JavaScript no dispare el evento que espera la página (típico de frameworks: hace
 *      falta un clic real del ratón, no uno sintético);
 *   4. que la página espere algo antes de responder (una pestaña, una disciplina, una llamada previa).
 *
 * Esto NO arregla nada: **mira**. Vuelca todos los botones con su visibilidad y posición, pulsa el de la
 * temporada, y vuelca otra vez lo que ha cambiado. Con esa foto, el arreglo deja de ser una suposición.
 *
 * Uso:  node scripts/diagnostica-selector-cataluna.mjs
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const PORTAL = 'https://www.fcf.cat/ca/competicio';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const opciones = new chrome.Options()
  .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1200')
  .setUserPreferences({ 'profile.default_content_setting_values.notifications': 2 });

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
const volcado = (etiqueta, valor) => console.log(`\n── ${etiqueta} ──\n${valor}`);

try {
  await driver.manage().setTimeouts({ pageLoad: 90000, script: 30000 });
  console.log(`→ ${PORTAL}`);
  await driver.get(PORTAL);
  await dormir(8000); // la web catalana es lenta: se le da margen antes de mirar nada

  volcado('TÍTULO', await driver.getTitle());
  volcado('URL', await driver.getCurrentUrl());

  // 1 · TODOS los botones, con lo que hace falta para saber si un clic puede llegar a ellos.
  const botones = await driver.executeScript(`
    return [...document.querySelectorAll('button')].map((b, i) => {
      const r = b.getBoundingClientRect();
      const e = getComputedStyle(b);
      return { i, texto: (b.innerText || '').trim().slice(0, 40),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        visible: e.visibility !== 'hidden' && e.display !== 'none' && r.width > 0 && r.height > 0,
        tapadoPor: (() => { const o = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return o && o !== b && !b.contains(o) ? (o.tagName + '.' + (o.className || '').toString().slice(0, 30)) : ''; })(),
        ulHijos: b.parentElement ? b.parentElement.querySelectorAll('ul li').length : 0 };
    });`);
  console.log('\n══ BOTONES EN LA PÁGINA ══');
  for (const b of botones) {
    console.log(`  [${b.i}] «${b.texto}» ${b.visible ? 'visible' : 'OCULTO'} ` +
      `pos(${b.x},${b.y}) ${b.w}x${b.h} li=${b.ulHijos}` +
      (b.tapadoPor ? `  ← TAPADO POR ${b.tapadoPor}` : ''));
  }

  // 2 · ¿Cuál es el botón de temporada y qué pasa al pulsarlo?
  const candidatos = botones.filter((b) => b.visible && /^\d{4}-\d{2}$/.test(b.texto));
  console.log(`\n══ CANDIDATOS A SELECTOR DE TEMPORADA: ${candidatos.length} ══`);
  if (!candidatos.length) {
    console.log('  No hay ningún botón con formato AAAA-AA visible. Eso ya descarta la causa 1.');
  } else {
    const elegido = candidatos[0];
    console.log(`  Se pulsa el primero: «${elegido.texto}» pos(${elegido.x},${elegido.y})`);

    const antes = await driver.executeScript('return document.querySelectorAll("ul li").length');
    await driver.executeScript(`
      const b = [...document.querySelectorAll('button')].filter((x) => (x.innerText || '').trim() === arguments[0])[arguments[1]];
      b.click();`, elegido.texto, 0);

    // Se mira a los 5, 15, 30 y 50 s: así se ve SI aparece y CUÁNTO TARDA (causa 2).
    for (const s of [5, 15, 30, 50]) {
      await dormir(s === 5 ? 5000 : (s === 15 ? 10000 : (s === 30 ? 15000 : 20000)));
      const despues = await driver.executeScript('return document.querySelectorAll("ul li").length');
      const url = await driver.getCurrentUrl();
      console.log(`  a los ~${s} s: li=${despues} (antes ${antes})  ${despues !== antes ? '→ APARECIÓ ALGO ✓' : '→ sin cambios'}  url=${url.slice(-60)}`);
      if (despues !== antes) break;
    }
  }

  // 3 · Si apareció algo, qué es. Si no, qué se ve donde debería estar la lista.
  const lis = await driver.executeScript(`
    return [...document.querySelectorAll('ul')].map((u) => ({
      n: u.querySelectorAll('li').length,
      textos: [...u.querySelectorAll('li')].slice(0, 6).map((li) => (li.innerText || '').trim().slice(0, 20)) }))
      .filter((u) => u.n);`);
  console.log('\n══ LISTAS CON ELEMENTOS ══');
  if (!lis.length) console.log('  Ninguna <ul> con <li>: la lista no se ha desplegado.');
  for (const u of lis) console.log(`  ${u.n} elementos: ${u.textos.join(' | ')}`);
} catch (error) {
  console.error(`\n*** ${error.message} ***`);
} finally {
  await driver.quit().catch(() => {});
}
