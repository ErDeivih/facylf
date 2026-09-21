#!/usr/bin/env node
/**
 * SONdeo a fondo de una federación (misma plataforma /pnfg/ que Castilla y León).
 *
 * Con una ventana real (Chrome):
 *   1) lee robots.txt (informativo)
 *   2) localiza el módulo de resultados (ruta + cod_primaria) probando candidatas
 *   3) vuelca las temporadas y, por temporada, sus competiciones
 *   4) si se pasa --profundidad N, explora el árbol hasta las actas: para las N primeras
 *      competiciones de unas temporadas, entra en sus grupos, jornadas, partidos y un acta,
 *      registrando las URLs y los conteos. Es lo que permite entender la estructura completa.
 *
 * Reutiliza los parsers de CyL (extraeTemporadas, extraeCompeticiones, extraeGrupos,
 * extraeJornadas, extraePartidos, validaPagina) — la plataforma es la misma, así que el HTML
 * se lee igual.
 *
 * Uso:
 *   node scripts/sondeo-federacion.mjs --url https://www.fexfutbol.com --nombre extremadura \
 *     --dir descargas-federacion-sondeo [--profundidad 4] [--temporadas "20,11"] [--pausa-ms 8000]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {
  extraeTemporadas, extraeCompeticiones, extraeGrupos, extraeJornadas,
  extraePartidos, validaPagina,
} from './lib/recolector-local.mjs';

function arg(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const RAIZ = resolve(import.meta.dirname, '..');
const BASE = arg('url', '');
const NOMBRE = arg('nombre', 'fed');
const DIR = arg('dir', 'descargas-federacion-sondeo');
const DIR_ABS = resolve(RAIZ, DIR);
const MAX_TEMP = Number(arg('max-temporadas', 0));
const RUTA = arg('ruta', '');
const COD_PRIMARIA = arg('cod-primaria', '');
const CONTACTO = arg('contacto', process.env.BOT_CONTACTO || '');
const PROFUNDIDAD = Number(arg('profundidad', 0));
const TEMPORADAS_EXPLORAR = arg('temporadas', '');   // p. ej. "20,11"
const PAUSA = Number(arg('pausa-ms', 8000));
const PERFIL_CHROME = join(DIR_ABS, `perfil-${NOMBRE}`);

if (!BASE) { console.error('Falta --url'); process.exit(1); }

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function opcionesChrome() {
  const ua = CONTACTO ? `FacylfBot/1.0 (+${BASE}; contacto: ${CONTACTO})` : `FacylfBot/1.0 (${BASE})`;
  const op = new chrome.Options();
  op.addArguments('--window-size=1280,900', `--user-data-dir=${PERFIL_CHROME}`, `--user-agent=${ua}`);
  return op;
}

async function htmlActual(driver) {
  return String(await driver.executeScript('return document.documentElement.outerHTML'));
}

/**
 * Acepta el aviso de cookies del portal si aparece.
 *
 * Por qué hace falta: los portales pnfg no sirven parte de sus páginas a quien no haya aceptado su
 * aviso. Con una petición simple devuelven un aviso de 117 bytes que va dentro de un comentario HTML
 * («No se ha aceptado el cookie»), y en el navegador aparece un cartel con un botón. Aceptarlo es el
 * primer paso que da cualquier visitante antes de ver nada; sin él no se puede leer ni una jornada.
 * Se hace UNA vez por sesión: la aceptación queda en el perfil de Chrome del sondeo.
 */
async function aceptaCookieSiHaceFalta(driver) {
  const patrones = /^(aceptar todo|aceptar|accept all|accept|de acuerdo|d'acord|onartu|permitir todas)$/i;
  for (let intento = 0; intento < 2; intento += 1) {
    let pulsado = false;
    let botones = [];
    try { botones = await driver.findElements(By.css('a,button,input[type=submit],[role=button]')); } catch { return false; }
    for (const b of botones.slice(0, 80)) {
      let texto = '';
      try { texto = ((await b.getText()) || '').trim(); } catch { continue; }
      if (!texto) { try { texto = ((await b.getAttribute('value')) || '').trim(); } catch { /* sin texto */ } }
      if (!patrones.test(texto)) continue;
      try {
        await b.click();
        pulsado = true;
        await dormir(1200);
        break;
      } catch { /* el botón no era pulsable; se sigue buscando */ }
    }
    if (!pulsado) return false;
  }
  return true;
}

async function navega(driver, url) {
  await driver.get(url);
  await driver.wait(until.elementLocated(By.css('body')), 20_000);
  await dormir(1500);
  // Si la página es el aviso de cookie (o lo lleva encima), se acepta y se recarga una vez.
  const html = await htmlActual(driver);
  const esAviso = html.length < 3000 && /no se ha aceptado el cookie/i.test(html);
  const llevaCartel = /cmpbox|consentimiento para cookies|Aceptar todo/i.test(html);
  if (esAviso || llevaCartel) {
    const aceptado = await aceptaCookieSiHaceFalta(driver);
    if (aceptado) {
      await driver.get(url);
      await driver.wait(until.elementLocated(By.css('body')), 20_000);
      await dormir(1200);
    }
  }
}

/** Garantiza que el driver está en la página de resultados (con el selector de temporada). */
async function aseguraResultados(driver) {
  try {
    await driver.findElement(By.id('temporada'));
    return;
  } catch {
    await navega(driver, URL_RESULTADOS);
  }
}

/** Une los valores del selector de competiciones, para detectar si cambió tras cambiar temporada. */
async function firmaCompeticiones(driver) {
  const html = await htmlActual(driver);
  return extraeCompeticiones(html).map((c) => `${c.codigo}`).join('|');
}

/** Cambia la temporada y espera a que el desplegable de competiciones se repueble. Tolerante a
 *  que alguna temporada histórica tarde o no repueble: no lanza, solo devuelve true si cambió. */
async function cambiaTemporada(driver, codigo) {
  await aseguraResultados(driver);
  const antes = await firmaCompeticiones(driver);
  await driver.executeScript((s, v) => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); },
    await driver.findElement(By.id('temporada')), codigo);
  try {
    await driver.wait(async () => {
      const despues = await firmaCompeticiones(driver);
      return despues.length > 0 && despues !== antes;
    }, 18_000);
    return true;
  } catch {
    await dormir(2000);
    return false;
  }
}

/** Construye las URLs del módulo de resultados para esta federación (mismo esquema que CyL). */
function urlGruposF(temp, comp) {
  return `${BASE}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=${cp()}&CodCompeticion=${comp}&CodTemporada=${temp}&CodJornada=1`;
}
function urlJornadaF(temp, comp, grupo, jornada) {
  return `${BASE}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=${cp()}&CodCompeticion=${comp}&CodGrupo=${grupo}&CodTemporada=${temp}&CodJornada=${jornada}`;
}
function urlActaF(acta) {
  return `${BASE}/pnfg/NPcd/NFG_CmpPartido?cod_primaria=${cp()}&CodActa=${acta}&cod_acta=${acta}`;
}
const cp = () => codPrimariaGlobal;

/* Se rellenan tras localizar el módulo. */
let codPrimariaGlobal = '1000120';
let URL_RESULTADOS = '';

async function exploraCompeticiones(driver, temp, n) {
  const muestras = temp.competiciones.slice(0, n);
  const out = [];
  for (const comp of muestras) {
    const url = urlGruposF(temp.codigo, comp.codigo);
    await navega(driver, url);
    const grupos = extraeGrupos((await htmlActual(driver)));
    const entrada = { codigo: comp.codigo, nombre: comp.nombre, urlGrupos: url, grupos: [] };
    for (const g of grupos.slice(0, 3)) {
      const gUrl = urlJornadaF(temp.codigo, comp.codigo, g.codigo, 1);
      await navega(driver, gUrl);
      const gHtml = await htmlActual(driver);
      const jornadas = extraeJornadas(gHtml);
      const partidos = extraePartidos(gHtml);
      const conActa = partidos.find((p) => p.codActa);
      let acta = null;
      if (conActa) {
        const aUrl = urlActaF(conActa.codActa);
        await navega(driver, aUrl);
        const ok = validaPagina('acta', (await htmlActual(driver))).ok;
        acta = { url: aUrl, valida: ok, partido: conActa };
      }
      entrada.grupos.push({ codigo: g.codigo, nombre: g.nombre, url: gUrl,
        jornadas: jornadas.length, partidos: partidos.length, acta });
      await dormir(PAUSA);
    }
    out.push(entrada);
    await dormir(PAUSA);
  }
  return out;
}

async function main() {
  mkdirSync(PERFIL_CHROME, { recursive: true });
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opcionesChrome()).build();
  await driver.manage().setTimeouts({ pageLoad: 30_000, script: 15_000 });
  const resultado = { federacion: NOMBRE, base: BASE, generadoEn: new Date().toISOString() };
  try {
    try { const r = await fetch(`${BASE}/robots.txt`); resultado.robotsTxt = { status: r.status, texto: (await r.text()).slice(0, 4000) }; }
    catch (e) { resultado.robotsTxt = { error: e instanceof Error ? e.message : String(e) }; }

    // localizar el módulo de resultados
    const rutas = RUTA ? [`${BASE}${RUTA}?cod_primaria=${COD_PRIMARIA || '1000120'}`] : [
      `${BASE}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120`,
      `${BASE}/pnfg/NFG_CmpJornada?cod_primaria=1000120`,
      `${BASE}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=5000299`,
    ];
    let urlUsada = null, temporadas = null;
    for (const c of rutas) {
      try { await navega(driver, c); const t = extraeTemporadas(await htmlActual(driver)); if (t.length) { urlUsada = c; temporadas = t; break; } } catch {}
    }
    if (!urlUsada) { console.error('No se encontró un módulo de resultados con selector de temporada.'); writeFileSync(join(DIR_ABS, `${NOMBRE}-sondeo.json`), JSON.stringify(resultado, null, 2)); return; }

    const up = new URL(urlUsada);
    codPrimariaGlobal = up.searchParams.get('cod_primaria') || '1000120';
    URL_RESULTADOS = urlUsada;
    resultado.url = urlUsada;
    resultado.codPrimaria = codPrimariaGlobal;
    resultado.modulo = up.pathname.replace('/pnfg', '');
    resultado.temporadas = temporadas.map((t) => ({ codigo: t.codigo, nombre: t.nombre, competiciones: [] }));
    console.log(`URL de resultados: ${urlUsada}`);
    console.log(`Temporadas detectadas: ${temporadas.length}`);

    const losLimite = MAX_TEMP > 0 ? resultado.temporadas.slice(0, MAX_TEMP) : resultado.temporadas;
    for (const temp of losLimite) {
      try {
        const sel = await driver.findElement(By.id('temporada')).getAttribute('value');
        if (sel !== temp.codigo) await cambiaTemporada(driver, temp.codigo);
        temp.competiciones = extraeCompeticiones(await htmlActual(driver));
        console.log(`  ${temp.nombre}: ${temp.competiciones.length} competiciones`);
      } catch (e) {
        console.warn(`  ⚠ ${temp.nombre}: no se pudo leer (${e instanceof Error ? e.message : e})`);
        temp.competiciones = [];
      }
      await dormir(PAUSA);
    }

    // exploración en profundidad del árbol (grupos → jornadas → partidos → acta)
    if (PROFUNDIDAD > 0) {
      const conDatos = resultado.temporadas.filter((t) => t.competiciones.length > 0);
      const codigos = TEMPORADAS_EXPLORAR
        ? TEMPORADAS_EXPLORAR.split(',').map((s) => s.trim()).filter(Boolean)
        : [conDatos[conDatos.length - 1]?.codigo, conDatos[0]?.codigo].filter(Boolean);
      console.log(`\nExplorando árbol en temporadas: ${codigos.join(', ')}`);
      for (const codigo of codigos) {
        const temp = resultado.temporadas.find((t) => t.codigo === codigo);
        if (!temp || temp.competiciones.length === 0) continue;
        try {
          // volver a la página de resultados antes de cambiar de temporada (el árbol deja al
          // driver en páginas de grupos/jornada/acta que no tienen el selector de temporada).
          await navega(driver, URL_RESULTADOS);
          await cambiaTemporada(driver, temp.codigo);
          temp.exploracion = await exploraCompeticiones(driver, temp, PROFUNDIDAD);
          console.log(`  ${temp.nombre}: exploradas ${temp.exploracion.length} competiciones`);
        } catch (e) {
          console.warn(`  ⚠ ${temp.nombre}: exploración incompleta (${e instanceof Error ? e.message : e})`);
        }
      }
    }

    writeFileSync(join(DIR_ABS, `${NOMBRE}-sondeo.json`), JSON.stringify(resultado, null, 2));
    console.log(`\nGuardado: ${join(DIR_ABS, `${NOMBRE}-sondeo.json`)}`);
  } finally {
    await driver.quit();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
