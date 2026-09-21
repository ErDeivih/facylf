#!/usr/bin/env node
/**
 * Muestra qué publica la FCF dentro de la ficha de un grupo, vista por vista.
 *
 * La página carga sus datos sola (nosotros no pedimos ninguna API: son las peticiones que hace la
 * propia web permitida). Aquí se abre un grupo, se espera a que pinte y se recorren las pestañas
 * RESULTATS / CLASSIFICACIÓ / CALENDARI / GOLS, guardando el DOM ya renderizado de cada una.
 *
 * Uso: node scripts/_diag-fcf-vistas.mjs [temporadaId] [disciplinaId] [competicioId] ["GRUP 1"]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const [, , temporadaId = '21', disciplinaId = '19308233', competicioId = '54322932', grupo = 'GRUP 1'] = process.argv;
const PORTAL = 'https://www.fcf.cat/ca/competicio';
const BASE = `${PORTAL}?temporadaId=${temporadaId}&disciplinaId=${disciplinaId}&competicioId=${competicioId}`;
const MARCA = 'data-facylf-lista';
const SALIDA = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const pausa = () => duerme(9000);
const PESTANAS = ['RESULTATS', 'CLASSIFICACIÓ', 'CALENDARI', 'GOLS', 'SANCIONS'];

function opciones() {
  const op = new chrome.Options();
  op.addArguments('--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,1400',
    '--disable-background-networking', '--lang=ca-ES',
    '--user-agent=FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)');
  return op;
}

async function abreGrupo(driver) {
  await driver.get(BASE);
  await driver.wait(until.titleContains('Competicions'), 45000);
  await pausa();
  const botones = await driver.findElements(By.xpath("//button[normalize-space(.)='Grup']"));
  for (const b of botones.reverse()) {
    await driver.executeScript('arguments[0].click()', b);
    try {
      await driver.wait(async () => Boolean(await driver.executeScript(`
        const b = arguments[0], marca = arguments[1];
        const ul = b.parentElement && b.parentElement.querySelector('ul');
        if (ul && ul.querySelectorAll('li').length) { ul.setAttribute(marca, 'grup'); return true; }
        return false;`, b, MARCA)), 20000);
      break;
    } catch { /* siguiente botón */ }
  }
  const indice = await driver.executeScript(`
    const ul = document.querySelector('[${MARCA}="grup"]');
    const objetivo = arguments[0];
    return ul ? [...ul.querySelectorAll('li')].findIndex((li) => ((li.getAttribute('title') || li.innerText || '').trim()) === objetivo) : -1;`, grupo);
  if (indice < 0) throw new Error(`no aparece «${grupo}»`);
  const lis = await driver.findElements(By.css(`[${MARCA}="grup"] li`));
  await driver.executeScript('arguments[0].click()', lis[indice]);
  await driver.wait(async () => Boolean(new URL(await driver.getCurrentUrl()).searchParams.get('grupId')), 30000);
  console.log(`grupo abierto: ${grupo} → grupId=${new URL(await driver.getCurrentUrl()).searchParams.get('grupId')}`);
  await pausa();
}

/** Espera a que el contenido deje de estar en «Carregant dades...». */
async function esperaDatos(driver, etiqueta) {
  try {
    await driver.wait(async () => Boolean(await driver.executeScript(`
      const principal = document.querySelector('main') || document.body;
      const texto = (principal.innerText || '');
      return !/Carregant dades/i.test(texto) && texto.trim().length > 200;`)), 30000);
    return true;
  } catch {
    console.log(`  … ${etiqueta}: sigue diciendo «Carregant dades…»`);
    return false;
  }
}

async function vuelca(driver, nombre) {
  const info = await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const enlaces = [...principal.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter(Boolean);
    const tablas = principal.querySelectorAll('table').length;
    const filas = principal.querySelectorAll('tr').length;
    return { enlaces, tablas, filas, texto: (principal.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 1600),
      html: principal.outerHTML };`);
  writeFileSync(join(SALIDA, `vista-${nombre}.html`), info.html);
  console.log(`\n===== ${nombre} (tablas ${info.tablas}, filas ${info.filas}, ${info.html.length} B) =====`);
  console.log(info.texto.slice(0, 1400));
  const conDatos = [...new Set(info.enlaces.filter((u) => /partit|acta|alineacion|equip|jugador|cod/i.test(u)))];
  if (conDatos.length) console.log('enlaces de datos:', JSON.stringify(conDatos.slice(0, 15), null, 1));
}

mkdirSync(SALIDA, { recursive: true });
const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones()).build();
try {
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 30000 });
  await abreGrupo(driver);
  if (await esperaDatos(driver, 'RESULTATS')) await vuelca(driver, 'resultats');
  for (const pestana of PESTANAS.slice(1)) {
    const existe = await driver.executeScript(
      'return [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === arguments[0])', pestana);
    if (!existe) { console.log(`\n(${pestana}: no hay botón)`); continue; }
    await driver.executeScript(`[...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === arguments[0]).pop().click()`, pestana);
    await pausa();
    if (await esperaDatos(driver, pestana)) await vuelca(driver, pestana.toLowerCase().replace(/[^a-z]/g, ''));
  }
  console.log('\nHTML volcado en', SALIDA);
} catch (error) {
  console.error('FALLO:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await driver.quit().catch(() => {});
}
