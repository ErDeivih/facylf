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
  '/buscar',
  '/explorar/comparar',
  '/explorar/ojeo',
  '/entrar',
  '/crear-cuenta',
  '/explorar/publicidad',
];

if (existsSync(salida)) rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

/** Aviso de que esto es la demo: foto estática y SOLO la temporada 2026-27 (la app completa es otra cosa).
 *  Se hace con CSS (body::before) y no con un <div>: React hidrata el documento y se lleva por delante cualquier
 *  nodo suelto que se meta dentro de <body>, así que el cartel desaparecía de la página servida. Un pseudo-elemento
 *  no está en el DOM y React no lo puede quitar. */
function cartelDeDemo(html) {
  const aviso = '<style id="aviso-demo">body::before{content:"Demostración estática · fútbol y fútbol sala de Castilla y León · temporada 2026-27 · sin API ni base de datos detrás · la app completa está en el servidor propio de Fondo Popular";display:block;position:sticky;top:0;z-index:99999;padding:7px 14px;background:#111418;color:#e8eaed;font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;border-bottom:1px solid #2a2f36;box-sizing:border-box}</style>';
  return html.replace('</head>', aviso + '</head>');
}

/** Reescribe rutas absolutas para que cuelguen del subdirectorio de Pages. */
function reescribe(html) {
  // El orden importa: primero se cambian las rutas dinámicas de API por ficheros, y sólo después se prefija el
  // subdirectorio; si se hace al revés, la regla genérica vuelve a prefijar lo ya prefijado y salen rutas
  // /fondo-popular-demo/fondo-popular-demo/escudos/… (imágenes rotas). Además la regla genérica NO toca lo que ya
  // empieza por el subdirectorio.
  return cartelDeDemo(html)
    // Escudos de club y de federación: son rutas de API dinámicas; se sirven como ficheros descargados.
    .replaceAll(/\/api\/escudo\/club\/(\d+)/g, `${base}/escudos/$1.png`)
    .replaceAll(/\/api\/escudo\/federacion\/([\w-]+)/g, `${base}/escudos-fed/$1`)
    // Todo lo demás que es absoluto desde la raíz del dominio (sin repetir el subdirectorio).
    .replaceAll(/(["'(])\/(?!\/)(?!fondo-popular-demo\/)/g, `$1${base}/`)
    // Sin fichas de equipo: sus plantillas publican nombres de jugadores de categorías de menores (RGPD). Los
    // enlaces se llevan al selector en vez de dejar un 404. Las reglas toleran el prefijo ya puesto (si no, se
    // duplicaría: /fondo-popular-demo/fondo-popular-demo/...).
    .replaceAll(/\/explorar\/equipo\/\d+/g, `${base}/explorar/competiciones`)
    .replaceAll(new RegExp(`${base}${base}/explorar/competiciones`, 'g'), `${base}/explorar/competiciones`)
    // Rankings fuera de la demo: se quedaba en «Cargando…» (su listado se pide por JavaScript y la foto va sin JS).
    .replaceAll(new RegExp(`${base}\\/explorar\\/rankings`, 'g'), `${base}/explorar/competiciones`)
    .replaceAll(/\/explorar\/rankings/g, `${base}/explorar/competiciones`)
    // Fuera el JavaScript: esto es una foto estática. Sin hidratación no hay router que pida rutas SIN el
    // prefijo de publicación (eso era el 404/503 que veían los coordinadores) y cada enlace es una carga de
    // página normal contra el fichero que existe. La interactividad no es parte de la demo.
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

/** Quita de la navegación la entrada de Rankings (ya no tiene página en la demo). */
function prepara(html) {
  return quitaDeNavegacion(reescribe(html));
}

function quitaDeNavegacion(html) {
  return html
    .replace(/<li[^>]*>(?:(?!<\/li>)[\s\S])*?funcion-rankings[\s\S]*?<\/li>/g, '')
    .replace(/<li[^>]*>(?:(?!<\/li>)[\s\S])*?explorar\/rankings[\s\S]*?<\/li>/g, '');
}

const escudos = new Set();
const escudosFed = new Set();
const rutasOk = [];
const rutasMal = [];
// Las actas enlazadas desde la portada («Ver partido») también entran en la foto: si no, el enlace abre 404.
const actasDeLaPortada = new Set();
const jornadasDeLaPortada = new Set();
for (const ruta of [...RUTAS]) {
  const url = `${origen}${ruta}`;
  try {
    const respuesta = await fetch(url, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${ruta} (${respuesta.status})`); continue; }
    let html = await respuesta.text();
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    // Actas enlazadas (jornada de ejemplo de la portada): se piden después, una vez, para la foto.
    if (ruta === '/') {
      for (const m of html.matchAll(/\/explorar\/acta\/(\d+)/g)) actasDeLaPortada.add(m[1]);
      for (const m of html.matchAll(/\/explorar\/competicion\/(\d+)(?:\/jornada\/(\d+))?/g)) {
        jornadasDeLaPortada.add(m[2] ? `/explorar/competicion/${m[1]}/jornada/${m[2]}` : `/explorar/competicion/${m[1]}`);
      }
    }
    for (const m of html.matchAll(/\/api\/escudo\/federacion\/([\w-]+)/g)) escudosFed.add(m[1]);
    html = prepara(html);
    const destino = join(salida, ruta === '/' ? 'index.html' : join(ruta.slice(1), 'index.html'));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, html);
    rutasOk.push(ruta);
  } catch (error) {
    rutasMal.push(`${ruta} (${error.message})`);
  }
}

writeFileSync(join(salida, '.nojekyll'), '', 'utf8');

// 404.html: GitHub Pages lo sirve en las rutas que no existen; devuelve al índice de la demo.
writeFileSync(join(salida, '404.html'), `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${base}/">
<title>Fondo Popular · volver a la demo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#111418;color:#e8eaed;text-align:center;padding:24px}a{color:#7cc4bc}</style>
</head><body><div><h1 style="margin:0 0 8px;font-size:20px">Esta página no está en la demo</h1>
<p style="margin:0 0 12px;color:#aab1ba">La demostración es una foto estática y solo incluye unas cuantas páginas.</p>
<a href="${base}/">Volver al inicio de la demo</a></div></body></html>`, 'utf8');

// Alias de rutas cortas que la gente teclea (y que en la app son rutas canónicas más largas). Sin esto,
// /explorar y /rankings responden 404 porque no hay fichero en esa carpeta; con esto son páginas reales.
const ALIAS = [
  ['/explorar', '/explorar/competiciones'],
  ['/competiciones', '/explorar/competiciones'],
];
for (const [rutaAlias, rutaReal] of ALIAS) {
  try {
    const respuesta = await fetch(`${origen}${rutaReal}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${rutaAlias} (origen ${respuesta.status})`); continue; }
    let html = await respuesta.text();
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    html = prepara(html);
    const destinoAlias = join(salida, ...rutaAlias.split('/').filter(Boolean), 'index.html');
    mkdirSync(dirname(destinoAlias), { recursive: true });
    writeFileSync(destinoAlias, html);
    rutasOk.push(rutaAlias);
  } catch (error) { rutasMal.push(`${rutaAlias} (${error.message})`); }
}

// Actas de la jornada de ejemplo de la portada.
for (const id of [...actasDeLaPortada].slice(0, 8)) {
  const rutaActa = `/explorar/acta/${id}`;
  try {
    const respuesta = await fetch(`${origen}${rutaActa}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${rutaActa} (${respuesta.status})`); continue; }
    let html = await respuesta.text();
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    html = prepara(html);
    const destinoActa = join(salida, 'explorar', 'acta', String(id), 'index.html');
    mkdirSync(dirname(destinoActa), { recursive: true });
    writeFileSync(destinoActa, html);
    rutasOk.push(rutaActa);
  } catch (error) { rutasMal.push(`${rutaActa} (${error.message})`); }
}

// Jornadas y competiciones enlazadas desde la portada: así «Ver partido» abre una página que existe.
for (const rutaJornada of [...jornadasDeLaPortada].slice(0, 16)) {
  try {
    const respuesta = await fetch(`${origen}${rutaJornada}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${rutaJornada} (${respuesta.status})`); continue; }
    let html = await respuesta.text();
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    html = prepara(html);
    const trozos = rutaJornada.split('/').filter(Boolean);
    const destinoJornada = join(salida, ...trozos, 'index.html');
    mkdirSync(dirname(destinoJornada), { recursive: true });
    writeFileSync(destinoJornada, html);
    rutasOk.push(rutaJornada);
  } catch (error) { rutasMal.push(`${rutaJornada} (${error.message})`); }
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
