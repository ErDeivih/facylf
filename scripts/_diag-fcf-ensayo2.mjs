#!/usr/bin/env node
/**
 * ¿El CALENDARI trae también los marcadores, y qué publica la ficha de acta de la FCF?
 *
 * Uso: node scripts/_diag-fcf-ensayo2.mjs [temporadaId] [disciplinaId] [competicioId] [grupId]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const [, , temporadaId = '21', disciplinaId = '19308233', competicioId = '54322932', grupId = '54322933'] = process.argv;
const BASE = 'https://www.fcf.cat';
const URL = `${BASE}/ca/competicio?temporadaId=${temporadaId}&disciplinaId=${disciplinaId}&competicioId=${competicioId}&grupId=${grupId}`;
const SALIDA = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(SALIDA, { recursive: true });

const op = new chrome.Options();
op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1400', '--lang=ca-ES',
  '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');

const EXTRAE = `
  const titulo = arguments[0];
  const cabecera = [...document.querySelectorAll('span,div,h3,h4')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() === titulo)[0];
  if (!cabecera) return { error: 'sin cabecera ' + titulo };
  let bloque = cabecera.parentElement;
  while (bloque && bloque !== document.body && bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]').length === 0
         && bloque.querySelectorAll('span[title]').length < 2) bloque = bloque.parentElement;
  if (!bloque) return { error: 'sin bloque ' + titulo };
  const enlaces = [...bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]')];
  const filas = [];
  const contenedores = new Set();
  for (const enlace of enlaces) {
    const fila = enlace.parentElement;
    contenedores.add(fila.parentElement);
    filas.push({ fila, codacta: (enlace.getAttribute('href').match(/(\\d+)\\s*$/) || [])[1] ?? null });
  }
  for (const contenedor of contenedores) {
    for (const hija of contenedor.children) {
      if (filas.some((f) => f.fila === hija)) continue;
      if (hija.querySelectorAll('span[title]').length >= 2) filas.push({ fila: hija, codacta: null });
    }
  }
  return { titulo, partidos: filas.map(({ fila, codacta }) => {
    const nombres = [...fila.querySelectorAll('span[title]')].map((s) => s.getAttribute('title').trim());
    const texto = (fila.innerText || '').replace(/\\s+/g, ' ').trim();
    const marcador = texto.match(/(\\d+)\\s*-\\s*(\\d+)/);
    return { local: nombres[0] ?? null, visitante: nombres.length > 1 ? nombres[nombres.length - 1] : null,
      golesLocal: marcador ? Number(marcador[1]) : null, golesVisitante: marcador ? Number(marcador[2]) : null,
      codacta, texto: texto.slice(0, 120) };
  }) };`;

const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get(URL);
  await duerme(9000);
  await driver.executeScript(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'CALENDARI').pop().click()`);
  await duerme(7000);

  console.log('=== CALENDARI · jornadas 1 y 17 (2025-26, ya jugadas) ===');
  for (const titulo of ['JORNADA 1', 'JORNADA 17']) {
    await driver.executeScript(`
      const t = arguments[0];
      const c = [...document.querySelectorAll('span,div,h3,h4')]
        .filter((e) => e.children.length === 0 && e.textContent.trim() === t)[0];
      (c.closest('div[class*="cursor-pointer"]') || c.parentElement).click();`, titulo);
    await duerme(900);
    const r = await driver.executeScript(EXTRAE, titulo);
    console.log(`\n${titulo}: ${r.partidos?.length ?? 0} filas`);
    for (const p of (r.partidos ?? []).slice(0, 4)) console.log('  ', JSON.stringify(p));
  }

  // Ficha de acta: se abre la del primer partido con marcador.
  await driver.executeScript(`
    const t = 'JORNADA 1';
    const c = [...document.querySelectorAll('span,div,h3,h4')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === t)[0];
    (c.closest('div[class*="cursor-pointer"]') || c.parentElement).click();`);
  await duerme(900);
  const jornada = await driver.executeScript(EXTRAE, 'JORNADA 1');
  const conActa = (jornada.partidos ?? []).find((p) => p.codacta);
  console.log(`\n=== FICHA DE ACTA ${conActa?.codacta} ===`);
  await duerme(7000);
  await driver.get(`${BASE}/ca/competicio/acta/${conActa.codacta}`);
  await duerme(9000);
  const acta = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    return { url: location.href, titulo: document.title,
      tablas: principal.querySelectorAll('table').length,
      jugadores: principal.querySelectorAll('a[href*="/ca/jugadors"], a[href*="jugador"]').length,
      texto: (principal.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 1800),
      html: document.documentElement.outerHTML };`);
  console.log(`  URL: ${acta.url}`);
  console.log(`  tablas: ${acta.tablas} · enlaces a jugadores: ${acta.jugadores}`);
  console.log(acta.texto);
  writeFileSync(join(SALIDA, `acta-fcf-${conActa.codacta}.html`), acta.html);
  console.log(`  (HTML guardado en _muestras/acta-fcf-${conActa.codacta}.html)`);
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
