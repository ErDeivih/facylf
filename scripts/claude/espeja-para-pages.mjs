/*
 * Espeja la web de Fondo Popular que corre en localhost:3001 a un directorio estático para GitHub Pages.
 * No toca el canónico ni la web: solo hace peticiones HTTP y escribe ficheros en tmp/site-pages.
 *
 * Por qué existe: GitHub Pages no ejecuta Next.js ni PostgreSQL. Lo que se publica es una FOTO estática de
 * unas cuantas rutas con datos reales; la API y la base siguen en el servidor propio.
 *
 * Uso: node tmp/espeja-para-pages.mjs <base-url-local> <directorio-salida> <ruta-base-en-pages>
 */
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [origen = 'http://127.0.0.1:3001', salida = 'tmp/site-pages', base = '/fondo-popular-demo'] = process.argv.slice(2);

/** Rutas que se publican como foto. Todas con datos reales del canónico. */
const RUTAS = [
  '/',
  '/explorar/competiciones',
  '/explorar/competicion/44',
  '/explorar/competicion/44/jornadas',
  '/explorar/competicion/44/jornada/1',
  '/explorar/competicion/44/calendario',
  '/explorar/competicion/44/estadisticas',
  '/explorar/acta/2000559',
  '/explorar/jugador/19057/historial',
  '/explorar/federacion/castilla-leon',
  '/explorar/rankings',
  '/explorar/estadisticas',
];

if (existsSync(salida)) rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

/** Aviso de que esto es la demo: foto estática y SOLO la temporada 2026-27 (la app completa es otra cosa). */
function cartelDeDemo(html) {
  const cartel = '<div style="position:sticky;top:0;z-index:9999;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 14px;background:#111418;color:#e8eaed;font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;border-bottom:1px solid #2a2f36">' +
    '<strong style="font-weight:600">Demostración estática</strong>' +
    '<span style="color:#aab1ba">Datos de la temporada 2026-27 · sin API ni base de datos detrás</span>' +
    '<span style="color:#6f7780">La aplicación completa (todas las temporadas) está en el servidor propio de Fondo Popular</span>' +
    '</div>';
  return html.replace(/(<body[^>]*>)/i, `$1${cartel}`);
}

/** Reescribe rutas absolutas para que cuelguen del subdirectorio de Pages. */
function reescribe(html) {
  return cartelDeDemo(html)
    // Escudos de club y de federación: son rutas de API dinámicas; se sirven como ficheros descargados.
    .replaceAll(/\/api\/escudo\/club\/(\d+)/g, `${base}/escudos/$1.png`)
    .replaceAll(/\/api\/escudo\/federacion\/([\w-]+)/g, `${base}/escudos-fed/$1`)
    // Todo lo demás que es absoluto desde la raíz del dominio.
    .replaceAll(/(["'(])\/(?!\/)/g, `$1${base}/`);
}

const escudos = new Set();
const escudosFed = new Set();
const rutasOk = [];
const rutasMal = [];
for (const ruta of RUTAS) {
  const url = `${origen}${ruta}`;
  try {
    const respuesta = await fetch(url, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${ruta} (${respuesta.status})`); continue; }
    let html = await respuesta.text();
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    for (const m of html.matchAll(/\/api\/escudo\/federacion\/([\w-]+)/g)) escudosFed.add(m[1]);
    html = reescribe(html);
    const destino = join(salida, ruta === '/' ? 'index.html' : join(ruta.slice(1), 'index.html'));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, html);
    rutasOk.push(ruta);
  } catch (error) {
    rutasMal.push(`${ruta} (${error.message})`);
  }
}

// Escudos de club: se descargan como PNG para no depender de la API dinámica.
mkdirSync(join(salida, 'escudos'), { recursive: true });
let escudosOk = 0;
for (const id of escudos) {
  try {
    const r = await fetch(`${origen}/api/escudo/club/${id}`);
    if (!r.ok) continue;
    const bytes = Buffer.from(await r.arrayBuffer());
    writeFileSync(join(salida, 'escudos', `${id}.png`), bytes);
    escudosOk += 1;
  } catch { /* sin escudo: el fallback de iniciales ya está pintado en el HTML */ }
}
mkdirSync(join(salida, 'escudos-fed'), { recursive: true });
for (const codigo of escudosFed) {
  try {
    const r = await fetch(`${origen}/api/escudo/federacion/${codigo}`);
    if (!r.ok) continue;
    writeFileSync(join(salida, 'escudos-fed', codigo), Buffer.from(await r.arrayBuffer()));
  } catch { /* igual que arriba */ }
}

// Recursos del build (CSS, JS, fuentes) y del favicon.
cpSync('apps/web/.next/static', join(salida, '_next', 'static'), { recursive: true });
for (const fichero of ['icon.svg', 'favicon.ico']) {
  try {
    const r = await fetch(`${origen}/${fichero}`);
    if (r.ok) writeFileSync(join(salida, fichero), Buffer.from(await r.arrayBuffer()));
  } catch { /* no es crítico */ }
}
writeFileSync(join(salida, '.nojekyll'), '');
writeFileSync(join(salida, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

console.log(`rutas publicadas: ${rutasOk.length}/${RUTAS.length}`);
if (rutasMal.length) console.log('rutas que fallaron:', rutasMal.join(' · '));
console.log(`escudos descargados: ${escudosOk} de ${escudos.size}`);
console.log(`directorio: ${salida}`);
