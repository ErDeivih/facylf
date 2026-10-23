#!/usr/bin/env node
/**
 * Guarda una página y sus scripts propios (sin analítica) para estudiar cómo llama a sus APIs sin repetir
 * peticiones. 5-8 s entre peticiones. Sólo lectura de ficheros públicos (HTML/JS).
 * Uso: node scripts/multideporte/guarda-scripts.mjs <url> [<url> …]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36 FacylfBot/1.0';
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
const nombre = (u) => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_').slice(0, 150);
const soloHtml = process.argv.includes('--solo-html');
for (const url of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'scripts', new URL(url).host);
  mkdirSync(dir, { recursive: true });
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  const p = await r.text();
  writeFileSync(join(dir, nombre(url) + '.html'), p);
  let n = 0;
  for (const m of soloHtml ? [] : p.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
    const s = new URL(m[1], url).href;
    if (/googletagmanager|analytics|facebook|cookie|recaptcha|gstatic|jquery|bootstrap\.min|angular\.min|wp-content|wp-includes|google|ads/i.test(s)) continue;
    await espera();
    try { const t = await (await fetch(s, { headers: { 'user-agent': UA } })).text(); writeFileSync(join(dir, nombre(s)), t); n++; } catch {}
  }
  console.log(`${url}: ${r.status}, ${p.length} B, ${n} scripts → ${dir}`);
  await espera();
}
