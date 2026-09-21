#!/usr/bin/env node
/*
 * ── ¿CUÁNTO AHORRAN LAS BANDERAS NUEVAS? MEDIDO CON LA MISMA PÁGINA ────────────────────────────────────
 *
 * Comparar la memoria de dos navegadores de federaciones distintas no dice nada: la página manda. Este guion
 * carga **la misma URL dos veces** —una con las banderas de antes del 21/09/2026 y otra con las de ahora— y
 * mide lo que importa:
 *
 *   · memoria del navegador (procesos, residente y privada) en cada caso;
 *   · huella del contenido: número de tablas, filas y celdas, longitud del texto y un resumen del texto de
 *     las celdas. Si las banderas cambiaran lo que se ve, la huella cambiaría.
 *
 * Las URLs salen de la propia cola de una federación (peticiones que ya se hicieron bien), así que se prueba
 * con páginas reales del portal y no con una inventada. Se respeta la pausa entre peticiones.
 *
 * Uso:  node scripts/prueba-banderas-chrome.mjs [--federacion navarra] [--actas 2] [--pausa-seg 6]
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

import { banderasDeChrome } from '../scripts/lib/banderas-chrome.mjs';

const ejecuta = promisify(execFile);
const RAIZ = resolve(import.meta.dirname, '..');
const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
};

const federacion = argumento('federacion', 'navarra');
const cuantas = Number(argumento('actas', 2));
const pausaSeg = Number(argumento('pausa-seg', 6));
/*
 * Con `--binario <ruta>` la comparación cambia de sentido: en vez de banderas antiguas contra nuevas, se
 * compara el Chrome instalado contra OTRO binario de Chromium (por ejemplo `chrome-headless-shell`), los dos
 * con las banderas de ahora. Sirve para saber si el binario ligero ahorra de verdad antes de tocar el
 * recolector.
 */
const binario = argumento('binario', null);
const JUEGOS = binario ? ['chrome', 'shell'] : ['antiguo', 'nuevo'];

/*
 * Las banderas de ANTES del 21/09/2026, congeladas aquí a propósito: son la referencia contra la que se mide,
 * así que no pueden seguir el código vivo o dejarían de ser un «antes».
 */
function banderasAntiguas({ perfil, identidad }) {
  return [
    '--window-size=1280,900', '--window-position=-32000,-32000', '--start-minimized',
    '--blink-settings=imagesEnabled=false', '--disable-extensions', '--disable-sync',
    '--disable-default-apps', '--disable-background-networking', '--disable-application-cache',
    '--disk-cache-size=1', '--media-cache-size=1', '--disable-gpu', '--disable-software-rasterizer',
    '--no-first-run', '--renderer-process-limit=1',
    '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process',
    '--process-per-site', `--user-data-dir=${perfil}`, `--user-agent=${identidad}`,
  ];
}

/** Las URLs a probar: peticiones de acta que ya salieron bien en esa federación. */
function urlsDeLaCola(federacion, cuantas) {
  const base = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  const db = new DatabaseSync(base, { readOnly: true });
  const filas = db.prepare(`select distinct url from peticiones
    where resultado = 'ok' and url like '%acta%' order by iniciada_en desc limit ?`).all(cuantas * 3);
  db.close();
  const vistas = new Set();
  const salida = [];
  for (const f of filas) {
    if (salida.length >= cuantas) break;
    if (!f.url || vistas.has(f.url)) continue;
    vistas.add(f.url);
    salida.push(f.url);
  }
  return salida;
}

/** La memoria y los procesos del navegador que usa ESE perfil, leídos del sistema. */
async function pesaNavegador(perfil) {
  /*
   * El filtro se hace EN JAVASCRIPT y no en la consulta: la ruta del perfil lleva barras invertidas y
   * pasarla a `-like` de PowerShell obliga a escaparla, que es justo lo que hizo que la primera medición
   * devolviera cero procesos. Aquí se comparan cadenas y no hay nada que escapar.
   */
  const { stdout } = await ejecuta('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Select-Object ProcessId,CommandLine,WorkingSetSize | ConvertTo-Json -Compress",
  ], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, windowsHide: true });
  const leidos = JSON.parse(stdout.trim() || '[]');
  const lista = (Array.isArray(leidos) ? leidos : [leidos]).filter((p) => String(p.CommandLine ?? '').includes(perfil));
  if (!lista.length) return { procesos: 0, renderers: 0, residenteMb: 0, privadaMb: 0 };

  const { stdout: ps } = await ejecuta('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-Process | Select-Object Id,PrivateMemorySize64 | ConvertTo-Json -Compress'],
  { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, windowsHide: true });
  const privada = new Map(JSON.parse(ps.trim() || '[]').map((p) => [p.Id, p.PrivateMemorySize64]));

  const tipos = lista.map((p) => /--type=([a-z-]+)/.exec(p.CommandLine ?? '')?.[1] ?? 'raiz');
  return {
    procesos: lista.length,
    renderers: tipos.filter((t) => t === 'renderer').length,
    residenteMb: Math.round(lista.reduce((a, p) => a + (p.WorkingSetSize ?? 0), 0) / 1048576),
    privadaMb: Math.round(lista.reduce((a, p) => a + (privada.get(p.ProcessId) ?? 0), 0) / 1048576),
  };
}

/** La huella del contenido: si las banderas cambiaran lo que se ve, esto cambiaría. */
async function huella(driver) {
  return driver.executeScript(`
    const celdas = [...document.querySelectorAll('td, th')].map((c) => c.innerText.trim()).filter(Boolean);
    const texto = celdas.join('|').replace(/\\s+/g, ' ');
    let suma = 0;
    for (let i = 0; i < texto.length; i++) { suma = (suma * 31 + texto.charCodeAt(i)) >>> 0; }
    return {
      tablas: document.querySelectorAll('table').length,
      filas: document.querySelectorAll('tr').length,
      celdas: celdas.length,
      texto: document.body ? document.body.innerText.length : 0,
      resumen: suma,
    };
  `);
}

async function mideCon(url, juego) {
  const perfil = mkdtempSync(join(tmpdir(), `facylf-ab-${juego}-`));
  const opciones = new chrome.Options();
  if (juego === 'antiguo') {
    opciones.addArguments(banderasAntiguas({ perfil, identidad: 'FacylfBot/1.0 (probe A/B)' }));
  } else if (juego === 'nuevo' || juego === 'chrome') {
    opciones.addArguments(banderasDeChrome({ variante: 'pnfg', perfil, identidad: 'FacylfBot/1.0 (probe A/B)' }));
  } else {
    /*
     * `chrome-headless-shell` ES el modo sin cabeza antiguo empaquetado aparte: no entiende `--headless=new`
     * (eso es del Chrome completo) y no tiene proceso GPU ni interfaz. Se le quita esa bandera, se le deja
     * `--headless` y el resto igual, para que la comparación sea sólo del binario.
     */
    const banderas = banderasDeChrome({ variante: 'cataluna', perfil, identidad: 'FacylfBot/1.0 (probe A/B)' })
      .filter((b) => b !== '--headless=new');
    opciones.addArguments([...banderas, '--headless']);
    opciones.setChromeBinaryPath(binario);
  }
  opciones.setUserPreferences({ 'download.default_directory': perfil, 'download.prompt_for_download': false });

  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
  let resultado;
  try {
    const antes = Date.now();
    await driver.get(url);
    await driver.wait(async () => (await driver.executeScript('return document.readyState')) === 'complete', 60_000);
    const ms = Date.now() - antes;
    const firma = await huella(driver);
    const peso = await pesaNavegador(perfil);
    resultado = { ms, ...firma, ...peso };
  } finally {
    await driver.quit().catch(() => {});
    try { rmSync(perfil, { recursive: true, force: true }); } catch { /* perfil temporal */ }
  }
  return resultado;
}

const urls = urlsDeLaCola(federacion, cuantas);
if (!urls.length) {
  console.error(`No hay peticiones de acta con resultado ok en descargas-${federacion}.`);
  process.exit(1);
}

console.log(`A/B de banderas de Chrome · federación ${federacion} · ${urls.length} URL(s) · pausa ${pausaSeg} s`
  + `${binario ? ` · comparando con ${binario}` : ''}\n`);
const filas = [];
for (const [indice, url] of urls.entries()) {
  // El orden se alterna: con la caché caliente la segunda carga siempre es más rápida, así que quien fuera
  // siempre segundo parecería mejor por eso y no por lo que se está midiendo.
  const orden = indice % 2 === 0 ? JUEGOS : [...JUEGOS].reverse();
  for (const juego of orden) {
    const r = await mideCon(url, juego);
    filas.push({ url, juego, ...r });
    console.log(`${juego.padEnd(8)} ${String(r.ms).padStart(6)} ms · ${String(r.procesos).padStart(2)} proc (${r.renderers} renderers)`
      + ` · ${String(r.residenteMb).padStart(4)} MB residentes · ${String(r.privadaMb ?? 0).padStart(4)} MB privadas`
      + ` · tablas ${r.tablas} filas ${r.filas} celdas ${r.celdas} texto ${r.texto} resumen ${r.resumen}`);
    await new Promise((listo) => setTimeout(listo, pausaSeg * 1000));
  }
  console.log('');
}

const porJuego = (juego) => filas.filter((f) => f.juego === juego);
const media = (juego, campo) => Math.round(porJuego(juego).reduce((a, f) => a + (f[campo] ?? 0), 0) / porJuego(juego).length);
const iguales = filas.filter((f) => f.juego === JUEGOS[1])
  .every((n) => {
    const a = filas.find((f) => f.juego === JUEGOS[0] && f.url === n.url);
    return a && a.tablas === n.tablas && a.filas === n.filas && a.celdas === n.celdas && a.resumen === n.resumen;
  });

console.log('───────────────────────────────────────────────────────────────');
for (const juego of JUEGOS) {
  console.log(`${juego.padEnd(8)}: ${media(juego, 'residenteMb')} MB residentes · ${media(juego, 'privadaMb')} MB privadas`
    + ` · ${media(juego, 'procesos')} procesos · ${media(juego, 'renderers')} renderers · ${media(juego, 'ms')} ms`);
}
console.log(`diferencia: ${media(JUEGOS[0], 'residenteMb') - media(JUEGOS[1], 'residenteMb')} MB residentes`
  + ` · ${media(JUEGOS[0], 'privadaMb') - media(JUEGOS[1], 'privadaMb')} MB privadas`);
console.log(`contenido idéntico: ${iguales ? 'SÍ' : 'NO — revisar antes de dar por buena la palanca'}`);
console.log('───────────────────────────────────────────────────────────────');

const destino = join(RAIZ, 'pruebas', 'reconstruccion', binario ? 'binario-headless-shell.json' : 'banderas-chrome.json');
mkdirSync(join(RAIZ, 'pruebas', 'reconstruccion'), { recursive: true });
writeFileSync(destino, JSON.stringify({
  cuando: new Date().toISOString(), federacion, pausaSeg, binario, urls, filas,
  mediaA: { residenteMb: media(JUEGOS[0], 'residenteMb'), privadaMb: media(JUEGOS[0], 'privadaMb'), procesos: media(JUEGOS[0], 'procesos'), ms: media(JUEGOS[0], 'ms') },
  mediaB: { residenteMb: media(JUEGOS[1], 'residenteMb'), privadaMb: media(JUEGOS[1], 'privadaMb'), procesos: media(JUEGOS[1], 'procesos'), ms: media(JUEGOS[1], 'ms') },
  contenidoIdentico: iguales,
}, null, 2), 'utf8');
console.log(`guardado en ${destino}`);
process.exit(iguales ? 0 : 2);
