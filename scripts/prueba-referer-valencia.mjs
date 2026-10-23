/*
 * ── ¿EL 403 DE VALENCIA ES POR FALTA DE `Referer`? ────────────────────────────────────────────────────────
 *
 * El recolector de Valencia pide así (scripts/recolector-valencia.mjs:462):
 *
 *   fetch(url, { headers: { Accept: '...', 'User-Agent': identidad() } })
 *
 * **Sin `Referer`, sin cookies y sin sesión** — y lo que devuelve 403 son endpoints de API INTERNA del portal
 * (`api/filtros/jornadas_fetch.php`, `api/clasificaciones/`). 403 es «prohibido», no «demasiadas peticiones»
 * (eso sería 429): habla de CÓMO pides, no de cuánto. Y bajar el ritmo de 4-6 a 8-12 s no cambió nada, que es
 * coherente con esa lectura.
 *
 * Esto lo comprueba con **tres peticiones**: la misma URL sin `Referer`, con `Referer` del portal, y con
 * `Referer` + `Accept-Language`/`Origin` (lo que manda un navegador de verdad). Si la respuesta cambia entre la
 * primera y las otras, la causa era la forma de la petición y el arreglo es de dos líneas.
 *
 * ── CUÁNDO EJECUTARLO ───────────────────────────────────────────────────────────────────────────────────
 *
 * **Sólo cuando el recolector haya salido de su pausa** (el 09/10 a las 08:14 o después). Valencia nos devolvió
 * un 403 y el recolector se apartó: hacerle peticiones mientras está pausado es insistirle a una web que ya ha
 * dicho que no, y es exactamente lo que la pausa existe para evitar. Tres peticiones separadas 10 s son
 * inofensivas **si su turno ha llegado**; no lo son si se hacen para saltarse la espera.
 *
 * Uso:  node scripts/prueba-referer-valencia.mjs
 */
// El portal REAL, leído de `recolector-valencia.mjs:65` — no supuesto:
//   const PORTAL = ES_MADRID ? 'https://www.rffm.es' : 'https://ffcv.es/competiciones';
const PORTAL = 'https://ffcv.es/competiciones';
// OJO: `PORTAL` ya termina en `/competiciones`, así que la ruta NO lo repite. La primera versión de este
// fichero lo repetía y habría pedido `/competiciones/competiciones/...` — un 404 que parece un bloqueo.
const RUTA = 'api/filtros/jornadas_fetch.php?cod_grupo=900436068';
const URL_COMPLETA = `${PORTAL}/${RUTA}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const UA = 'FACyLF/1.0 (proyecto personal sin ánimo de lucro; contacto en el perfil de la federación)';

const variantes = [
  { nombre: 'COMO LO HACE EL RECOLECTOR', cabeceras: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1', 'User-Agent': UA } },
  { nombre: 'CON Referer', cabeceras: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1', 'User-Agent': UA, Referer: `${PORTAL}/` } },
  { nombre: 'COMO UN NAVEGADOR', cabeceras: {
    Accept: 'application/json, text/plain, */*', 'User-Agent': UA, Referer: `${PORTAL}/`,
    Origin: PORTAL, 'Accept-Language': 'es-ES,es;q=0.9', 'X-Requested-With': 'XMLHttpRequest' } },
];

console.log(`\n  URL: ${URL_COMPLETA}\n`);
for (const v of variantes) {
  try {
    const r = await fetch(URL_COMPLETA, { headers: v.cabeceras, signal: AbortSignal.timeout(30_000) });
    const cuerpo = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
    console.log(`  [${String(r.status).padStart(3)}] ${v.nombre.padEnd(28)} ${cuerpo}`);
  } catch (e) {
    console.log(`  [ERR] ${v.nombre.padEnd(28)} ${String(e.message).slice(0, 70)}`);
  }
  await dormir(10_000); // entre peticiones, con la misma prudencia que el recolector
}
console.log('\n  Lectura: si «COMO LO HACE EL RECOLECTOR» da 403 y las otras 200, la causa es la forma de la');
console.log('  petición y el arreglo son dos líneas en pideJson. Si las tres dan 403, la causa es otra (sesión o');
console.log('  bloqueo por IP) y hay que capturar la red de un navegador navegando de verdad.');
console.log('  Y si las tres dan 200, entonces el bloqueo ya no está y el recolector lo verá solo mañana.\n');
