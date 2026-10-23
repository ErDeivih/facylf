#!/usr/bin/env node
/**
 * Muestra cómo llama una SPA a sus APIs: baja la página y sus scripts y saca 300 caracteres alrededor de cada
 * aparición de los nombres dados (parámetros, método…). 5-8 s entre peticiones.
 * Uso: node scripts/multideporte/contexto-api.mjs <url> <nombre1,nombre2,…>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [url, nombres] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36 FacylfBot/1.0';
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
const texto = async (u) => (await fetch(u, { headers: { 'user-agent': UA } })).text();
const p = await texto(url);
const fuentes = [[url, p]];
for (const m of p.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
  const s = new URL(m[1], url).href;
  if (/googletagmanager|analytics|facebook|cookie|jquery|recaptcha|gstatic/i.test(s)) continue;
  await espera(); try { fuentes.push([s, await texto(s)]); } catch {}
}
const out = {};
for (const n of nombres.split(',')) {
  out[n] = [];
  for (const [s, t] of fuentes) for (const m of t.matchAll(new RegExp(n, 'g'))) if (out[n].length < 40) out[n].push(`${s.split('/').pop()}: …${t.slice(Math.max(0, m.index - 150), m.index + 300)}…`);
}
const dir = join(RAIZ, 'descargas-sondeo-multideporte', `${new Date().toISOString().slice(0, 10)}-apis`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `contexto-${new URL(url).host}.json`), JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(' · '));
