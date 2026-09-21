#!/usr/bin/env node
/** Sondeo mínimo y respetuoso de la superficie pública de rffm.es. */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';

async function trae(url, tipo = 'text') {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: tipo === 'json' ? 'application/json,*/*' : '*/*' } });
  const cuerpo = await r.text();
  return { estado: r.status, tipo: r.headers.get('content-type'), bytes: Buffer.byteLength(cuerpo), cuerpo };
}

const robots = await trae('https://www.rffm.es/robots.txt');
console.log('=== robots.txt ===', robots.estado, robots.bytes, 'B');
console.log(robots.cuerpo.slice(0, 1200));

const casa = await trae('https://www.rffm.es/');
console.log('\n=== portada ===', casa.estado, casa.bytes, 'B');
const scripts = [...casa.cuerpo.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
const otros = [...casa.cuerpo.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]).filter((u) => /\.js|_next|assets/.test(u));
console.log('scripts:', JSON.stringify([...new Set(scripts)].slice(0, 25), null, 1));
console.log('estilos/fuentes js:', JSON.stringify([...new Set(otros)].slice(0, 10), null, 1));
