#!/usr/bin/env node
/**
 * SONDEO CON NAVEGADOR: para las webs que cargan los datos con JavaScript (SPA y AJAX), abre la página en un
 * Chrome sin cabeza y GRABA las llamadas de red que hace la propia página (fetch y XMLHttpRequest: método,
 * URL, cuerpo y respuesta). Con eso se escribe el adaptador contra su API en vez de contra el HTML.
 *
 * Una página por fuente (y, si se indica `seguir`, el primer enlace que case con ese selector CSS), 5-8 s
 * entre páginas. Salida: descargas-sondeo-multideporte/<fecha>-navegador/<id>[--hija].json.gz
 * Uso (PC): node scripts/multideporte/sondeo-navegador.mjs [--fuentes=…json] [--solo=id1,id2]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const { fuentes } = JSON.parse(readFileSync(resolve(arg('fuentes') ?? join(AQUI, 'fuentes-navegador.json')), 'utf8'));
const solo = (arg('solo') ?? '').split(',').filter(Boolean);
const salida = join(RAIZ, 'descargas-sondeo-multideporte', `${new Date().toISOString().slice(0, 10)}-navegador`);
mkdirSync(salida, { recursive: true });

const ESPIA = `(() => { if (window.__capturas) return; window.__capturas = [];
  const guarda = (o) => { try { if (window.__capturas.length < 400) window.__capturas.push(o); } catch (e) {} };
  const f0 = window.fetch;
  if (f0) window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const metodo = (init && init.method) || (input && input.method) || 'GET';
    const cuerpo = init && typeof init.body === 'string' ? init.body.slice(0, 20000) : null;
    const r = await f0.apply(this, arguments);
    try { r.clone().text().then((t) => guarda({ via: 'fetch', metodo, url: r.url || url, estado: r.status,
      tipo: r.headers.get('content-type'), cuerpo, respuesta: t.slice(0, 300000) })); } catch (e) {}
    return r;
  };
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  const xh = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; this.__h = {}; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { this.__h[k] = /authori|token|cookie/i.test(k) ? '[oculto]' : String(v).slice(0, 200); } catch (e) {}
    return xh.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    this.addEventListener('loadend', () => { let t = '';
      try { t = (this.responseType === '' || this.responseType === 'text') ? this.responseText : '[' + this.responseType + ']'; } catch (e) {}
      guarda({ via: 'xhr', metodo: this.__m, url: this.responseURL || this.__u, estado: this.status,
        tipo: this.getResponseHeader('content-type'), cabeceras: this.__h, cuerpo: typeof b === 'string' ? b.slice(0, 20000) : null,
        respuesta: String(t).slice(0, 300000) }); });
    return xs.apply(this, arguments);
  };
})();`;

const op = new chrome.Options();
op.addArguments('--headless=new', '--window-size=1366,900', '--disable-gpu', '--no-first-run', '--lang=es-ES',
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36 FacylfBot/1.0');
const driver = await new Builder().forBrowser('chrome').setChromeOptions(op).build();
await driver.manage().setTimeouts({ pageLoad: 60_000, script: 60_000 });
await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', { source: ESPIA });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const SENSIBLES = /^(dni|nif|nie|email|e_?mail|correo|telefono|teléfono|movil|móvil|telf|phone|fecha_nacimiento|birth\w*|direccion|domicilio|cp|codigo_postal|iban|cuenta)$/i;
const limpiaTexto = (t) => t.replace(/\b[XYZ]?\d{7,8}[A-HJ-NP-TV-Z]\b/g, '[dni retirado]')
  .replace(/[\w.%+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){0,6}\.[a-z]{2,24}/gi, '[correo retirado]');
function retiraPersonales(texto) {
  const limpia = (o) => typeof o === 'string' ? limpiaTexto(o) : Array.isArray(o) ? o.map(limpia)
    : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SENSIBLES.test(k) ? '[retirado]' : limpia(v)])) : o;
  const t = String(texto ?? '');
  try { return JSON.stringify(limpia(JSON.parse(t))); } catch { return limpiaTexto(t); }
}
const resumen = [];

async function captura(id, url, esperaSeg) {
  const t0 = Date.now();
  await driver.get(url);
  await espera((esperaSeg ?? 8) * 1000);
  const capturas = await driver.executeScript('return window.__capturas || []');
  const html = await driver.executeScript('return document.documentElement.outerHTML');
  const final = await driver.getCurrentUrl();
  // Datos personales FUERA antes de guardar nada: el 01/10/2026 una API pública de tenis devolvía DNI, correo,
  // teléfono y fecha de nacimiento de jugadores (también menores). Ni se guardan ni se usan.
  for (const c of capturas) c.respuesta = retiraPersonales(c.respuesta);
  writeFileSync(join(salida, `${id}.json.gz`), gzipSync(JSON.stringify({ url, final, capturas, html: retiraPersonales(html) })));
  const datos = capturas.filter((c) => /json|text\/plain/i.test(c.tipo ?? '') || /^\s*[[{]/.test(c.respuesta ?? ''));
  const fila = { id, url, final, ms: Date.now() - t0, llamadas: capturas.length, conDatos: datos.length,
    muestra: datos.slice(0, 12).map((c) => `${c.metodo} ${c.estado} ${String(c.url).slice(0, 160)} (${(c.respuesta ?? '').length} B)`) };
  resumen.push(fila);
  console.log(`✓ ${id}: ${capturas.length} llamadas, ${datos.length} con datos`);
  for (const m of fila.muestra) console.log(`    ${m}`);
}

try {
  for (const f of fuentes) {
    if (solo.length && !solo.includes(f.id)) continue;
    try {
      await captura(f.id, f.url, f.esperaSeg);
      if (f.seguir) {
        const enlaces = await driver.findElements(By.css(f.seguir));
        const href = enlaces.length ? await enlaces[0].getAttribute('href') : null;
        if (href) { await espera(5000 + Math.random() * 3000); await captura(`${f.id}--hija`, href, f.esperaSeg); }
        else console.log(`    (sin enlace que case con ${f.seguir})`);
      }
    } catch (e) { console.log(`! ${f.id}: ${e?.message ?? e}`); resumen.push({ id: f.id, url: f.url, error: String(e?.message ?? e) }); }
    await espera(5000 + Math.random() * 3000);
  }
} finally {
  await driver.quit().catch(() => {});
  writeFileSync(join(salida, 'resumen.json'), JSON.stringify(resumen, null, 2));
  console.log(`\nResumen en ${join(salida, 'resumen.json')}`);
}
