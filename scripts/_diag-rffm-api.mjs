#!/usr/bin/env node
/**
 * Inventaría los endpoints `/api/` que usa la propia web de rffm.es, leyéndolos de sus
 * ficheros estáticos públicos (permitidos por robots.txt). Sirve para saber qué superficie
 * pública existe antes de decidir nada sobre las fichas de acta.
 */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const BASE = 'https://www.rffm.es';
const trae = async (ruta) => (await fetch(`${BASE}${ruta}`, { headers: { 'user-agent': UA } })).text();

const manifiesto = await trae('/_next/static/inlzUL9hzqhAubIvBCD2y/_buildManifest.js');
const rutas = [...manifiesto.matchAll(/"(\/[^"]*)":\[([^\]]*)\]/g)]
  .map((m) => ({ ruta: m[1], ficheros: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => '/' + x[1].replace(/^\//, '')) }));

const elegidas = rutas.filter((r) => /competicion|acta-partido|index$/.test(r.ruta));
const todos = [...new Set(elegidas.flatMap((r) => r.ficheros))];
console.log(`rutas elegidas: ${elegidas.length} · ficheros: ${todos.length}`);

const hallazgos = new Map();
for (const f of todos) {
  let js;
  try { js = await trae(f); } catch { continue; }
  for (const m of js.matchAll(/["'`]((?:https?:\/\/[^"'`]*)?\/(?:api|services)\/[^"'`\s]{0,120})["'`]/g)) {
    const ruta = m[1];
    if (!hallazgos.has(ruta)) hallazgos.set(ruta, new Set());
    hallazgos.get(ruta).add(f.split('/').pop());
  }
}
console.log(`\nendpoints encontrados: ${hallazgos.size}`);
for (const [ruta, donde] of [...hallazgos].sort()) console.log(`  ${ruta}   ← ${[...donde].slice(0, 3).join(', ')}`);
