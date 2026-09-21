#!/usr/bin/env node
/**
 * Diagnóstico puntual: por qué el recolector de Cataluña no obtiene `grupId`.
 *
 * Sobre `https://www.fcf.cat/ca/competicio` con una competición concreta:
 *   1. identifica el diálogo superpuesto `z-[9999]` que intercepta los clics
 *   2. abre el desplegable «Grup» y lista sus opciones
 *   3. pulsa la opción pedida con un click programático (el que usa el recolector)
 *      y sigue la URL y el contenido durante 25 s para ver qué cambia de verdad
 *
 * Uso: node scripts/_diag-grup-fcf.mjs [temporadaId] [disciplinaId] [competicioId] ["GRUP 2"]
 */
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const [, , temporadaId = '22', disciplinaId = '19308233', competicioId = '58162422', objetivo = 'GRUP 2'] = process.argv;
const PORTAL = 'https://www.fcf.cat/ca/competicio';
const BASE = `${PORTAL}?temporadaId=${temporadaId}&disciplinaId=${disciplinaId}&competicioId=${competicioId}`;
const MARCA = 'data-facylf-lista';
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));

function opciones() {
  const op = new chrome.Options();
  op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1100',
    '--disable-background-networking', '--lang=ca-ES',
    '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');
  return op;
}

const foto = (driver) => driver.executeScript(`
  const d = document.querySelector('[role="dialog"][aria-modal="true"]');
  const ul = document.querySelector('[${MARCA}="grup"]');
  const principal = document.querySelector('main') || document.body;
  return {
    url: location.href,
    titulo: document.title,
    dialogo: d ? { html: d.outerHTML.slice(0, 400), opacidad: getComputedStyle(d).opacity,
      punteros: getComputedStyle(d).pointerEvents, visible: Boolean(d.offsetParent) } : null,
    lista: ul ? [...ul.querySelectorAll('li')].map((li) => ((li.getAttribute('title') || li.innerText || '').trim())) : null,
    botones: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 20),
    filas: principal.querySelectorAll('table tr, [class*="row"]').length,
    textoPrincipal: (principal.innerText || '').replace(/\\s+/g, ' ').slice(0, 200),
  };`);

async function abreLista(driver, etiqueta) {
  const botones = await driver.findElements(By.xpath(`//button[normalize-space(.)='${etiqueta}']`));
  console.log(`  botones «${etiqueta}»: ${botones.length}`);
  for (const b of botones.reverse()) {
    if ((await b.findElements(By.xpath('./ancestor::header | ./ancestor::nav'))).length) continue;
    await driver.executeScript('arguments[0].scrollIntoView({block:"center"}); arguments[0].click();', b);
    try {
      await driver.wait(async () => Boolean(await driver.executeScript(`
        const b = arguments[0], marca = arguments[1];
        const ul = b.parentElement && b.parentElement.querySelector('ul');
        if (ul && ul.querySelectorAll('li').length) {
          document.querySelectorAll('[' + marca + ']').forEach((x) => x.removeAttribute(marca));
          ul.setAttribute(marca, 'grup'); return true;
        }
        return false;`, b, MARCA)), 20000);
      return true;
    } catch { console.log('  … ese botón no abrió lista'); }
  }
  return false;
}

const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones()).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await driver.get(BASE);
  await driver.wait(until.titleContains('Competicions'), 45000);
  await duerme(8000);
  const inicio = await foto(driver);
  console.log('=== estado inicial ===');
  console.log(`URL: ${inicio.url}`);
  console.log(`diálogo: ${JSON.stringify(inicio.dialogo)}`);
  console.log(`botones: ${JSON.stringify(inicio.botones)}`);
  console.log(`filas en el contenido: ${inicio.filas}`);
  console.log(`texto: ${inicio.textoPrincipal}`);

  console.log('\n=== abriendo «Grup» ===');
  if (!await abreLista(driver, 'Grup')) throw new Error('no se pudo abrir la lista de grupos');
  const conLista = await foto(driver);
  console.log(`opciones: ${JSON.stringify(conLista.lista)}`);

  const li = await driver.executeScript(`
    const marca = arguments[0], objetivo = arguments[1];
    const ul = document.querySelector('[' + marca + '="grup"]');
    return ul ? [...ul.querySelectorAll('li')].findIndex((e) => ((e.getAttribute('title') || e.innerText || '').trim()) === objetivo) : -1;`,
  MARCA, objetivo);
  if (li < 0) throw new Error(`no hay opción «${objetivo}»`);
  const lis = await driver.findElements(By.css(`[${MARCA}="grup"] li`));

  console.log(`\n=== pulsando «${objetivo}» (click programático) ===`);
  await driver.executeScript('arguments[0].click()', lis[li]);
  const vistas = new Set([inicio.url]);
  for (let s = 1; s <= 25; s++) {
    await duerme(1000);
    const url = await driver.getCurrentUrl();
    if (!vistas.has(url)) {
      vistas.add(url);
      console.log(`  ${String(s).padStart(2)} s → ${url}`);
    }
  }
  const fin = await foto(driver);
  console.log(`\nURL final: ${fin.url}`);
  console.log(`grupId: ${new URL(fin.url).searchParams.get('grupId') ?? 'NINGUNO'}`);
  console.log(`botones: ${JSON.stringify(fin.botones)}`);
  console.log(`filas: ${fin.filas}`);
  console.log(`texto: ${fin.textoPrincipal}`);
  console.log(`\nURLs vistas: ${JSON.stringify([...vistas], null, 2)}`);
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
