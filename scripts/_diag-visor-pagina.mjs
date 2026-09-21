#!/usr/bin/env node
/**
 * Comprueba la página del visor como lo haría un navegador: qué ids usa el script y cuáles existen en
 * el HTML. Un id que se pide y no existe rompe el bucle de refresco con un TypeError y deja el panel
 * congelado, que es justo lo que se ve como «el visor no funciona».
 *
 * Uso: node scripts/_diag-visor-pagina.mjs [url]
 */
const url = process.argv[2] ?? 'http://127.0.0.1:3777/';
const html = await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).text();
console.log(`página ${url} · ${html.length} caracteres`);

const idsDefinidos = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const idsPedidos = new Set([...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]));
const faltan = [...idsPedidos].filter((id) => !idsDefinidos.has(id));
console.log(`ids definidos: ${idsDefinidos.size} · ids pedidos por el script: ${idsPedidos.size}`);
console.log(faltan.length ? `IDS QUE FALTAN: ${faltan.join(', ')}` : 'todos los ids que pide el script existen');

const funciones = [...html.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
const llamadas = new Set([...html.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
const nativas = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'fetch', 'JSON', 'Number', 'String',
  'Boolean', 'Array', 'Object', 'Math', 'Date', 'parseInt', 'parseFloat', 'setTimeout', 'setInterval', 'clearInterval', 'alert',
  'Promise', 'Error', 'encodeURIComponent', 'decodeURIComponent', 'isNaN', 'confirm', 'await', 'new', 'catch']);
const noDefinidas = [...llamadas].filter((n) => !funciones.includes(n) && !nativas.has(n) && /^[a-z]/.test(n));
console.log(`\nfunciones definidas en la página: ${funciones.length}`);
console.log(`posibles llamadas a funciones no definidas (revisar): ${noDefinidas.slice(0, 25).join(', ') || 'ninguna'}`);

console.log('\nendpoints que usa la página y su respuesta:');
const rutas = new Set([...html.matchAll(/fetch\(['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((r) => !r.includes('+') && r !== '/api/'));
for (const r of rutas) {
  try {
    const t0 = Date.now();
    const respuesta = await fetch(new URL(r, url), { signal: AbortSignal.timeout(60_000) });
    const texto = await respuesta.text();
    console.log(`  ${r.padEnd(22)} HTTP ${respuesta.status} · ${texto.length} B · ${Date.now() - t0} ms`);
  } catch (error) {
    console.log(`  ${r.padEnd(22)} FALLA: ${error instanceof Error ? error.message : String(error)}`);
  }
}
