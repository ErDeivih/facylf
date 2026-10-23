#!/usr/bin/env node
/**
 * Lista las rutas de API que aparecen en el JavaScript de una web (SPA): baja la página y sus scripts (máx. 8,
 * 5-8 s entre peticiones) y busca rutas tipo /api/…, *.do, call.php/… y acciones POST. No ejecuta nada.
 * Uso: node scripts/multideporte/extrae-apis.mjs <url> [<url> …]   → descargas-sondeo-multideporte/<fecha>-apis/*.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const salida = join(RAIZ, 'descargas-sondeo-multideporte', `${new Date().toISOString().slice(0, 10)}-apis`);
mkdirSync(salida, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36 FacylfBot/1.0';
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
async function texto(u) { const r = await fetch(u, { headers: { 'user-agent': UA } }); return { estado: r.status, t: await r.text() }; }
for (const url of process.argv.slice(2)) {
  const res = { url, scripts: [], rutas: {} };
  try {
    const p = await texto(url); res.estado = p.estado;
    const srcs = [...p.t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], url).href)
      .filter((s) => !/googletagmanager|google-analytics|facebook|cookie|jquery|bootstrap|recaptcha|gstatic|cloudflare/i.test(s)).slice(0, 8);
    const fuentes = [p.t];
    for (const s of srcs) { await espera(); try { const r = await texto(s); res.scripts.push([s, r.estado, r.t.length]); fuentes.push(r.t); } catch (e) { res.scripts.push([s, 'error', String(e.message)]); } }
    for (const t of fuentes) {
      for (const m of t.matchAll(/["'`]((?:https?:\/\/[\w.-]+)?\/?(?:[\w-]+\/)*(?:api|apiPistacentral|json)\/[\w\/{}$.:?=&-]{2,160})["'`]/g)) res.rutas[m[1]] = (res.rutas[m[1]] ?? 0) + 1;
      for (const m of t.matchAll(/["'`]([\w\/.-]*\.do(?:\?[\w=&]*)?)["'`]/g)) res.rutas[m[1]] = (res.rutas[m[1]] ?? 0) + 1;
      for (const m of t.matchAll(/accion["']?\s*[:=]\s*["']([\w.-]{3,60})["']/g)) res.rutas[`accion:${m[1]}`] = (res.rutas[`accion:${m[1]}`] ?? 0) + 1;
    }
  } catch (e) { res.error = String(e.message); }
  const id = new URL(url).host.replace(/\W+/g, '-');
  writeFileSync(join(salida, `${id}.json`), JSON.stringify(res, null, 1));
  console.log(`${url}: ${Object.keys(res.rutas).length} rutas, ${res.scripts.length} scripts`);
  await espera();
}
