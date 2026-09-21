#!/usr/bin/env node
/**
 * Localiza, dentro de los ficheros estáticos públicos de rffm.es (permitidos por robots.txt),
 * con qué endpoints propios construye la web sus páginas de competición y de acta.
 */
const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const BASE = 'https://www.rffm.es';

async function trae(ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: { 'user-agent': UA } });
  const cuerpo = await r.text();
  return { estado: r.status, bytes: Buffer.byteLength(cuerpo), cuerpo };
}

const manifiesto = await trae('/_next/static/inlzUL9hzqhAubIvBCD2y/_buildManifest.js');
console.log('buildManifest:', manifiesto.estado, manifiesto.bytes, 'B');
const rutas = [...manifiesto.cuerpo.matchAll(/"(\/[^"]*)":\[/g)].map((m) => m[1]);
console.log(`rutas declaradas: ${rutas.length}`);
console.log('rutas con «acta» o «partido» o «equipo» o «jugador»:');
console.log(JSON.stringify(rutas.filter((r) => /acta|partido|equipo|jugador|clasific|resultado/i.test(r)), null, 1).slice(0, 1500));

for (const objetivo of [/acta-partido/, /\/competicio/, /\/partido/]) {
  const clave = rutas.find((r) => objetivo.test(r));
  if (!clave) continue;
  const bloque = manifiesto.cuerpo.match(new RegExp(`"${clave.replace(/[[\]/\\^$*+?.()|{}]/g, '\\$&')}":\\[([^\\]]*)\\]`));
  const ficheros = bloque ? [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  console.log(`\n=== ruta ${clave} → ${ficheros.length} ficheros`);
  for (const f of ficheros.slice(0, 6)) {
    const js = await trae(f);
    const rutasApi = [...new Set([...js.cuerpo.matchAll(/["'`]((?:https?:\/\/[^"'`]*)?\/(?:api|services|servicios)\/[^"'`\s]*)["'`]/g)]
      .map((m) => m[1]))];
    console.log(`  ${f} (${js.bytes} B, ${js.estado}) → endpoints: ${JSON.stringify(rutasApi.slice(0, 25))}`);
    const pistas = [...new Set([...js.cuerpo.matchAll(/(idActa|codacta|codActa|ficha_partido|acta-partido|actaPartido|idPartido|cod_partido)/g)].map((m) => m[1]))];
    console.log(`    pistas: ${JSON.stringify(pistas)}`);
  }
}
