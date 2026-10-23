#!/usr/bin/env node
/**
 * Mira qué plataforma hay detrás de cada URL (5-8 s entre peticiones): clave pública del ESB de OWBasket,
 * desplegables ASP.NET tipo FBM (Gesdeportiva), iSquad, FEB… Si la página no la dice, mira hasta 2 scripts
 * propios. No fuerza certificados caducados ni bloqueos: los informa.
 * Uso: node scripts/multideporte/busca-plataforma.mjs <url> [<url> …]
 */
import { AGENTE } from './motor.mjs';
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
const PATRONES = {
  owbasket: /esb\.optimalwayconsulting\.com\/([a-z0-9]+)\/1\/([A-Za-z0-9]+)/,
  'fbm-ddl': /\$DDL(?:Delegacion|Competiciones|Categorias|Fases|Grupos)/,
  gesdeportiva: /gesdeportiva|indalweb/i,
  isquad: /isquad\.es/i, feb: /competiciones\.feb\.es|baloncestoenvivo\.feb\.es/i, nbn23: /nbn23/i,
};
const mira = (t) => Object.entries(PATRONES).map(([k, re]) => { const m = re.exec(t); return m ? (k === 'owbasket' ? `owbasket:${m[1]}:${m[2]}` : k) : null; }).filter(Boolean);
let primero = true;
for (const url of process.argv.slice(2)) {
  if (!primero) await espera(); primero = false;
  let r, t;
  try { r = await fetch(url, { headers: { 'user-agent': AGENTE }, signal: AbortSignal.timeout(30000) }); t = await r.text(); }
  catch (e) { console.log(`${url} · ERROR ${e.cause?.code ?? e.message}`); continue; }
  let hall = mira(t);
  if (!hall.some((h) => h.startsWith('owbasket')) && /<div id="root"|You need to enable JavaScript/.test(t)) {
    const scripts = [...t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], r.url).href)
      .filter((s) => new URL(s).host === new URL(r.url).host).slice(0, 2);
    for (const s of scripts) { await espera(); try { hall = hall.concat(mira(await (await fetch(s, { headers: { 'user-agent': AGENTE } })).text()).map((h) => `${h} (js)`)); } catch {} }
  }
  console.log(`${url} · ${r.status} · ${t.length} B · ${[...new Set(hall)].join(' | ') || '—'}`);
}
