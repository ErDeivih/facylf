#!/usr/bin/env node
/**
 * ¿De dónde sale el marcador en la ficha de acta de la FCF? Muestra el contexto del primer patrón
 * «número - número» que encuentra el recolector, para comprobar que es el marcador y no otra cosa.
 *
 * Uso: node scripts/_diag-fcf-marcador.mjs [codacta]
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const codacta = process.argv[2] ?? '3783726';
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1600,1600', '--lang=ca-ES',
  '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get(`https://www.fcf.cat/ca/competicio/acta/${codacta}`);
  await duerme(9000);
  const info = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const texto = principal.innerText || '';
    const primera = texto.match(/(\\d+)\\s*\\n\\s*-\\s*\\n\\s*(\\d+)/);
    const indice = primera ? texto.indexOf(primera[0]) : -1;
    // Todos los pares «número - número» del texto, con su contexto.
    const pares = [...texto.matchAll(/(\\d+)\\s*\\n\\s*-\\s*\\n\\s*(\\d+)/g)].slice(0, 6).map((m) => ({
      par: m[0].replace(/\\n/g, ' '), contexto: texto.slice(Math.max(0, m.index - 70), m.index + 40).replace(/\\n/g, ' | '),
    }));
    return {
      titulo: document.title,
      primerPar: primera ? primera[0].replace(/\\n/g, ' ') : null,
      contextoPrimero: indice >= 0 ? texto.slice(Math.max(0, indice - 120), indice + 80).replace(/\\n/g, ' | ') : null,
      pares,
      cabecera: (principal.querySelector('h1,h2')?.innerText ?? '').replace(/\\n/g, ' | ').slice(0, 200),
      secciones: [...principal.querySelectorAll('h3')].map((h) => h.textContent.trim()),
      goles: [...principal.querySelectorAll('h3')]
        .filter((h) => /^gols$/i.test(h.textContent.trim()))
        .map((h) => {
          const raiz = h.closest('div[class*="rounded"]') || h.parentElement.parentElement;
          const filas = raiz ? [...raiz.children].slice(1).flatMap((c) => [...c.children]) : [];
          return filas.map((f) => ({
            texto: (f.innerText || '').replace(/\\s+/g, ' ').trim(),
            imagenes: [...f.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt')),
          }));
        }),
    };`);
  console.log(`título: ${info.titulo}`);
  console.log(`primer par: ${info.primerPar}`);
  console.log(`contexto: ${info.contextoPrimero}`);
  console.log('todos los pares:');
  for (const p of info.pares) console.log(`  ${p.par} ← …${p.contexto}`);
  console.log(`secciones: ${JSON.stringify(info.secciones)}`);
  console.log(`bloques de goles: ${info.goles.length}`);
  for (const [i, bloque] of info.goles.entries()) {
    console.log(`  bloque ${i + 1}: ${bloque.length} filas`);
    for (const f of bloque) console.log(`    ${f.texto} · ${JSON.stringify(f.imagenes)}`);
  }
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
