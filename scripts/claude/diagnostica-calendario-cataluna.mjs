#!/usr/bin/env node
/*
 * diagnostica-calendario-cataluna.mjs — SÓLO LEE (abre páginas públicas de la FCF; no toca la cola).
 *
 * Por qué (21/10/2026): en el PC, ~1 de cada 3 calendarios de Cataluña sale con las jornadas ya jugadas
 * VACÍAS aunque la web las tenga (en el navegador de Claude el mismo código lee las 30). Esto abre unos
 * grupos que fallan con EXACTAMENTE las mismas banderas de Chrome que el recolector y mide, jornada a
 * jornada, qué pasa: si el clic llega a React (fila «hidratada»), si la cabecera sigue en el documento,
 * cuánto se espera, y si cambia algo sin el bloqueo de terceros.
 *
 * Uso: node scripts/claude/diagnostica-calendario-cataluna.mjs [grupo…]   (por defecto, 3 grupos que fallan)
 * Ritmo: una página cada ≥ 8 s, como el recolector. 6 cargas en total.
 */
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { banderasDeChrome } from '../lib/banderas-chrome.mjs';
import { bloqueaTerceros } from '../lib/bloqueo-terceros.mjs';

const GRUPOS = {
  58161857: 'https://www.fcf.cat/ca/competicio?temporadaId=22&disciplinaId=19308233&competicioId=58161856&grupId=58161857&tab=calendari',
  58161945: 'https://www.fcf.cat/ca/competicio?temporadaId=22&disciplinaId=19308233&competicioId=58161933&grupId=58161945&tab=calendari',
  55689948: 'https://www.fcf.cat/ca/competicio?temporadaId=21&disciplinaId=19308233&competicioId=54322952&grupId=55689948&tab=calendari',
};
const pedidos = process.argv.slice(2).filter((g) => GRUPOS[g]);
const grupos = pedidos.length ? pedidos : Object.keys(GRUPOS);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const MIDE = `
  const SOLO_FECHA = ${process.argv.includes('--solo-fecha')};
  const t0 = performance.now(); const ms = () => Math.round(performance.now() - t0);
  const dormir = (m) => new Promise((r) => setTimeout(r, m));
  const esCab = (e) => e.children.length === 0 && /^\\s*JORNADA\\s+\\d+/i.test(e.textContent);
  const vivas = () => [...(document.querySelector('main') || document.body).querySelectorAll('span,div,h3,h4')].filter(esCab);
  const hidratado = (n) => !!n && Object.keys(n).some((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
  const cab = vivas();
  const fila0 = cab[0] && (cab[0].closest('div[class*="cursor-pointer"]') || cab[0].parentElement);
  const inicio = { cabeceras: cab.length, readyState: document.readyState, visibilidad: document.visibilityState,
    filaHidratada: hidratado(fila0), clavesFila: fila0 ? Object.keys(fila0).filter((k) => k.startsWith('__react')).map((k) => k.split('$')[0]) : [],
    tieneOnClick: fila0 ? Object.keys(fila0).filter((k) => k.startsWith('__reactProps')).some((k) => typeof fila0[k]?.onClick === 'function') : null,
    banner: !![...document.querySelectorAll('button')].find((b) => /disagree|agree/i.test(b.innerText || '')) };
  let fechaProp = null;
  try {
    let f = cab[0][Object.keys(cab[0]).find((k) => k.startsWith('__reactFiber'))];
    for (let i = 0; f && i < 80 && !(f.memoizedProps && Array.isArray(f.memoizedProps.voltes)); i++) f = f.return;
    const j0 = f.memoizedProps.voltes[0].jornadas[0];
    fechaProp = { tipo: typeof j0.date, valor: String(j0.date).slice(0, 60), claves: Object.keys(j0).join(',') };
  } catch (e) { fechaProp = { error: String(e.message) }; }
  inicio.fechaProp = fechaProp;
  inicio.cabTexto = cab[0] ? cab[0].textContent.slice(0, 80) : null;
  inicio.filaTexto = fila0 ? fila0.textContent.replace(/\s+/g, ' ').slice(0, 160) : null;
  inicio.filaInner = fila0 ? (fila0.innerText || '').replace(/\s+/g, ' ').slice(0, 160) : null;
  if (SOLO_FECHA) return { inicio, ok: null, total: cab.length };
  const jornadas = [];
  for (const c of cab) {
    const fila = c.closest('div[class*="cursor-pointer"]') || c.parentElement;
    const busca = () => { for (let x = fila.parentElement; x && x !== document.body; x = x.parentElement) {
      if (cab.some((o) => o !== c && x.contains(o))) return null;
      if (x.querySelectorAll('a[href*="/ca/competicio/acta/"]').length || x.querySelectorAll('span[title]').length >= 2) return x; } return null; };
    let b = busca(); const sinClic = !!b; let clics = 0; let espera = 0;
    while (!b && clics < 2) { fila.click(); clics++; for (let i = 0; i < 30 && !b; i++) { await dormir(100); espera += 100; b = busca(); } }
    jornadas.push({ j: c.textContent.trim().replace(/^JORNADA\\s+/i, '').slice(0, 2).trim(), ok: !!b, sinClic, clics, espera,
      vivo: document.contains(c), filaViva: document.contains(fila), hid: hidratado(fila) });
  }
  return { inicio, final: { ms: ms(), cabecerasVivas: vivas().length, viejasVivas: cab.filter((c) => document.contains(c)).length,
    filaHidratada: hidratado(fila0) }, ok: jornadas.filter((x) => x.ok).length, total: jornadas.length,
    fallos: jornadas.filter((x) => !x.ok).slice(0, 6), primeras: jornadas.slice(0, 4) };`;

async function prueba(conBloqueo) {
  const op = new chrome.Options();
  op.addArguments(...banderasDeChrome({ variante: 'cataluna', lang: 'ca-ES',
    identidad: 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)' }));
  op.setUserPreferences({ 'profile.default_content_setting_values.notifications': 2 });
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
  await driver.manage().setTimeouts({ pageLoad: 60000, script: 120000 });
  const salida = [];
  try {
    if (conBloqueo) await bloqueaTerceros(driver);
    for (const g of grupos) {
      const t = Date.now();
      await driver.get(GRUPOS[g]);
      const cargada = Date.now() - t;
      // igual que el recolector: esperar contenido (rechazando el aviso de cookies en cada vuelta)
      let rechazos = 0;
      try {
        await driver.wait(async () => {
          rechazos += await driver.executeScript(`const r=/^(disagree|reject all|rebutja|rebutjar|rechazar|denegar)$/i;
            const b=[...document.querySelectorAll('button,[role="button"],a')].find(x=>r.test((x.innerText||x.textContent||'').trim()));
            if(b){b.click();return 1;} return 0;`);
          return driver.executeScript(`const p=document.querySelector('main')||document.body; const t=p.innerText||'';
            return !/Carregant dades/i.test(t) && t.trim().length>400;`);
        }, 30000);
      } catch (e) { salida.push({ g, error: 'sin contenido en 30 s' }); }
      if (rechazos) await dormir(1500);
      const r = await driver.executeScript(MIDE).catch((e) => ({ error: String(e.message).slice(0, 200) }));
      const errores = await driver.manage().logs().get('browser').then((l) => l.filter((x) => x.level.name === 'SEVERE').slice(0, 5).map((x) => x.message.slice(0, 160))).catch(() => []);
      salida.push({ g, conBloqueo, cargadaMs: cargada, rechazos, ...r, erroresConsola: errores });
      await dormir(8000);
    }
  } finally { await driver.quit().catch(() => {}); }
  return salida;
}

const resultado = { cuando: new Date().toISOString(), conBloqueo: await prueba(true), sinBloqueo: process.argv.includes('--solo-bloqueo') ? null : await prueba(false) };
console.log(JSON.stringify(resultado, null, 1));
