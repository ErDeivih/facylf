#!/usr/bin/env node
/** Busca en el bundle público de la página de acta de rffm.es qué endpoint propio usa. */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const BASE = 'https://www.rffm.es';

async function trae(ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: { 'user-agent': UA } });
  return { estado: r.status, bytes: 0, cuerpo: await r.text() };
}

const objetivo = '/_next/static/chunks/pages/acta-partido/%5B...codacta%5D-ee973e119c2b6d5e.js';
const js = await trae(objetivo);
console.log(`${objetivo} → ${js.estado}, ${Buffer.byteLength(js.cuerpo)} B`);
const interesantes = [...new Set([...js.cuerpo.matchAll(/["'`]([^"'`]*\/(?:api|services)\/[^"'`]*)["'`]/g)].map((m) => m[1]))];
console.log('endpoints en el chunk:', JSON.stringify(interesantes, null, 1));
const pistas = [...new Set([...js.cuerpo.matchAll(/(codacta|idActa|acta[A-Za-z]*|partido[A-Za-z]*|jornada[A-Za-z]*)/g)].map((m) => m[1]))];
console.log('identificadores:', JSON.stringify(pistas.slice(0, 40)));
// Vuelca las llamadas a fetch/axios con su contexto para ver la forma exacta de la URL.
for (const m of js.cuerpo.matchAll(/fetch\(([^)]{0,200})\)/g)) console.log('  fetch:', JSON.stringify(m[1].slice(0, 200)));
for (const m of js.cuerpo.matchAll(/["'`]\/api\/[^"'`]{0,160}["'`]/g)) console.log('  api:', JSON.stringify(m[0]));
