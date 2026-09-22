#!/usr/bin/env node
/*
 * Enseña TAL CUAL la respuesta corta del portal (el «muro») y sus cabeceras.
 *
 * Cuando una petición normal devuelve 117 bytes en vez de 300 KB, la pregunta es qué pide esa respuesta para
 * dejar pasar: un enlace, una cookie, un formulario, o JavaScript que hay que ejecutar. Sin ver el cuerpo no se
 * puede decidir si el navegador es imprescindible o es sólo la forma cómoda de pasar el muro.
 *
 * Uso:
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/muestra-muro.mjs <url>
 */
const url = process.argv[2];
if (!url) {
  console.error('uso: muestra-muro.mjs <url>');
  process.exit(2);
}

const identidad = process.env.FACYLF_IDENTIDAD ?? 'FacylfBot/1.0 (contacto: nanotech@gmail.com)';
const respuesta = await fetch(url, {
  headers: { 'user-agent': identidad, accept: 'text/html,application/xhtml+xml,*/*' },
  redirect: 'follow',
});

console.log(`GET ${url}`);
console.log(`estado: ${respuesta.status} ${respuesta.statusText}`);
console.log(`url final: ${respuesta.url}`);
console.log('── cabeceras ──');
for (const [k, v] of respuesta.headers) console.log(`  ${k}: ${v}`);

const cuerpo = await respuesta.text();
console.log(`── cuerpo (${Buffer.byteLength(cuerpo, 'utf8')} bytes) ──`);
console.log(cuerpo);
