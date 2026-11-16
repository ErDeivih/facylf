/*
 * Espeja la web de Fondo Popular que corre en localhost:3001 a un directorio estático para GitHub Pages.
 * No toca el canónico ni la web: solo hace peticiones HTTP y escribe ficheros en tmp/site-pages.
 *
 * Por qué existe: GitHub Pages no ejecuta Next.js ni PostgreSQL. Lo que se publica es una FOTO estática de
 * unas cuantas rutas con datos reales; la API y la base siguen en el servidor propio.
 *
 * Uso: node tmp/espeja-para-pages.mjs <base-url-local> <directorio-salida> <ruta-base-en-pages>
 */
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync, openSync, closeSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [origen = 'http://127.0.0.1:3001', salida = 'tmp/site-pages', base = '/fondo-popular-demo'] = process.argv.slice(2);

/** Rutas que se publican como foto. Todas con datos reales del canónico. */
const RUTAS = [
  '/',
  '/explorar/equipo/8871',
  '/explorar/calidad',
  '/explorar/competiciones',
  '/explorar/proximas',
  '/explorar/competicion/44',
  '/explorar/competicion/44/jornadas',
  '/explorar/competicion/44/jornada/1',
  '/explorar/competicion/44/calendario',
  '/explorar/competicion/44/estadisticas',
  '/explorar/competicion/44/proyeccion',
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

/** Nombre del fichero donde el paso de render deja el DOM de una ruta. */
function nombreDom(ruta) {
  if (ruta === '/') return 'root';
  return ruta.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '') || 'root';
}

/**
 * HTML de una ruta: si existe el DOM renderizado de tmp/dom-render se usa ese (trae ya el contenido que en el HTML
 * crudo llega por streaming y, sin JS, se quedaba en esqueleto de carga). Si no existe, se usa el HTML descargado.
 */
function leeHtml(ruta, descargado) {
  const fichero = join('tmp/dom-render', nombreDom(ruta) + '.html');
  if (existsSync(fichero)) {
    const dom = readFileSync(fichero, 'utf8');
    if (dom.length > 200) return dom;
  }
  return descargado;
}

const escudos = new Set();
const escudosFed = new Set();
const rutasOk = [];
const rutasMal = [];
// Las actas enlazadas desde la portada («Ver partido») también entran en la foto: si no, el enlace abre 404.
const actasDeLaPortada = new Set();
const jornadasDeLaPortada = new Set();
const rutasDeJornada = new Set();
const actasDeJornadas = new Set();
const equiposDeLaFoto = new Set();
for (const ruta of [...RUTAS]) {
  const url = `${origen}${ruta}`;
  try {
    const respuesta = await fetch(url, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${ruta} (${respuesta.status})`); continue; }
    let html = leeHtml(ruta, await respuesta.text());
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    // Actas enlazadas (jornada de ejemplo de la portada): se piden después, una vez, para la foto.
    if (ruta.startsWith('/explorar/competicion/')) {
      for (const m of html.matchAll(/\/explorar\/equipo\/(\d+)/g)) equiposDeLaFoto.add(m[1]);
    }
    if (ruta === '/') {
      for (const m of html.matchAll(/\/explorar\/acta\/(\d+)/g)) actasDeLaPortada.add(m[1]);
      for (const m of html.matchAll(/\/explorar\/competicion\/(\d+)(?:\/jornada\/(\d+))?/g)) {
        jornadasDeLaPortada.add(m[2] ? `/explorar/competicion/${m[1]}/jornada/${m[2]}` : `/explorar/competicion/${m[1]}`);
      }
      // Alrededor de cada jornada de la portada: su competición, su lista de jornadas y las jornadas contiguas.
      // Sin esto, la propia jornada de ejemplo enlazaba a páginas que no existían en la foto (404).
      for (const rutaJ of jornadasDeLaPortada) {
        const m = rutaJ.match(/^\/explorar\/competicion\/(\d+)(?:\/jornada\/(\d+))?$/);
        if (!m) continue;
        rutasDeJornada.add(`/explorar/competicion/${m[1]}`);
        if (!m[2]) continue;
        rutasDeJornada.add(`/explorar/competicion/${m[1]}/jornadas`);
        for (const n of [Number(m[2]) - 1, Number(m[2]) + 1]) {
          if (n > 0) rutasDeJornada.add(`/explorar/competicion/${m[1]}/jornada/${n}`);
        }
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
    let html = leeHtml(rutaReal, await respuesta.text());
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
    let html = leeHtml(rutaActa, await respuesta.text());
    for (const m of html.matchAll(/\/api\/escudo\/club\/(\d+)/g)) escudos.add(m[1]);
    html = prepara(html);
    const destinoActa = join(salida, 'explorar', 'acta', String(id), 'index.html');
    mkdirSync(dirname(destinoActa), { recursive: true });
    writeFileSync(destinoActa, html);
    rutasOk.push(rutaActa);
  } catch (error) { rutasMal.push(`${rutaActa} (${error.message})`); }
}

// Páginas alrededor de la jornada de ejemplo (competición, lista de jornadas y jornadas contiguas).
for (const rutaVecina of [...rutasDeJornada].slice(0, 40)) {
  try {
    const respuesta = await fetch(`${origen}${rutaVecina}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) continue; // jornada contigua sin publicar: no es un fallo de la foto
    let html = leeHtml(rutaVecina, await respuesta.text());
    for (const m of html.matchAll(/\/explorar\/acta\/(\d+)/g)) actasDeJornadas.add(m[1]);
    html = prepara(html);
    const destinoVecina = join(salida, ...rutaVecina.split('/').filter(Boolean), 'index.html');
    mkdirSync(dirname(destinoVecina), { recursive: true });
    writeFileSync(destinoVecina, html);
    rutasOk.push(rutaVecina);
  } catch (error) {
    rutasMal.push(`${rutaVecina} (${error.message})`);
  }
}

// Lista de partidos sin acta de cada competición de la foto (FP-F3): el «X/Y» de actas lleva aquí.
for (const rutaCompeticion of [...new Set([...rutasDeJornada, '/explorar/competicion/44', '/explorar/competicion/2939', '/explorar/competicion/3947'])]) {
  const base = rutaCompeticion.replace(/\/jornada\/\d+$/, '');
  const rutaSinActa = `${base}/sin-acta`;
  try {
    const respuesta = await fetch(`${origen}${rutaSinActa}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) continue;
    const html = prepara(leeHtml(rutaSinActa, await respuesta.text()));
    const destino = join(salida, ...rutaSinActa.split('/').filter(Boolean), 'index.html');
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, html);
    rutasOk.push(rutaSinActa);
  } catch { /* si no está, no rompe la foto */ }
}

// Fichas de equipo (FP-U1): las que aparecen enlazadas en las competiciones de la foto.
for (const id of [...equiposDeLaFoto].slice(0, 80)) {
  const rutaEquipo = `/explorar/equipo/${id}`;
  try {
    const respuesta = await fetch(`${origen}${rutaEquipo}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) continue; // equipo sin ficha en la app: no es un fallo de la foto
    const html = prepara(leeHtml(rutaEquipo, await respuesta.text()));
    const destino = join(salida, 'explorar', 'equipo', String(id), 'index.html');
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, html);
    rutasOk.push(rutaEquipo);
  } catch (error) { rutasMal.push(`${rutaEquipo} (${error.message})`); }
}

// Actas enlazadas desde las jornadas de la portada: son el «partido» al que se entra desde la jornada.
for (const id of [...actasDeJornadas].slice(0, 12)) {
  const rutaActa = `/explorar/acta/${id}`;
  try {
    const respuesta = await fetch(`${origen}${rutaActa}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) continue;
    const html = prepara(leeHtml(rutaActa, await respuesta.text()));
    const destino = join(salida, 'explorar', 'acta', String(id), 'index.html');
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, html);
    rutasOk.push(rutaActa);
  } catch { /* si no se puede, no rompe la foto */ }
}

// Jornadas y competiciones enlazadas desde la portada: así «Ver partido» abre una página que existe.
for (const rutaJornada of [...jornadasDeLaPortada].slice(0, 16)) {
  try {
    const respuesta = await fetch(`${origen}${rutaJornada}`, { headers: { accept: 'text/html' } });
    if (!respuesta.ok) { rutasMal.push(`${rutaJornada} (${respuesta.status})`); continue; }
    let html = leeHtml(rutaJornada, await respuesta.text());
    for (const m of html.matchAll(/\/explorar\/acta\/(\d+)/g)) actasDeJornadas.add(m[1]);
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
// CSV de partidos jugados de cada competición de la foto (y su enlace apuntando al fichero estático).
{
  let csvs = 0;
  const carpetaCompeticiones = join(salida, 'explorar', 'competicion');
  if (existsSync(carpetaCompeticiones)) {
    for (const entrada of readdirSync(carpetaCompeticiones)) {
      const ficha = join(carpetaCompeticiones, entrada, 'index.html');
      if (!existsSync(ficha)) continue; // es una subruta (jornada, calendario...), no la ficha
      try {
        const respuesta = await fetch(`${origen}/explorar/competicion/${entrada}/partidos/descarga`);
        if (!respuesta.ok) continue;
        const csv = await respuesta.text();
        writeFileSync(join(carpetaCompeticiones, entrada, 'partidos.csv'), csv, 'utf8');
        const html = readFileSync(ficha, 'utf8');
        const antes = `${base}/explorar/competicion/${entrada}/partidos/descarga`;
        const despues = `${base}/explorar/competicion/${entrada}/partidos.csv`;
        if (html.includes(antes)) writeFileSync(ficha, html.replaceAll(antes, despues), 'utf8');
        csvs += 1;
      } catch { /* opcional */ }
    }
  }
  if (csvs) console.log(`CSV de partidos exportados: ${csvs}`);
}

// Fichas de equipo que falten: se buscan en el HTML ya escrito (clasificación, jornadas, actas) y se exportan
// antes del saneado, para que los nombres de equipo no acaben apuntando al selector.
{
  const faltanEquipos = new Set();
  const busca = (dir) => {
    for (const f of readdirSync(dir)) {
      const ruta = join(dir, f);
      if (statSync(ruta).isDirectory()) { busca(ruta); continue; }
      if (!f.endsWith('.html')) continue;
      const html = readFileSync(ruta, 'utf8');
      for (const m of html.matchAll(/\/explorar\/equipo\/(\d+)/g)) {
        const id = m[1];
        if (!existsSync(join(salida, 'explorar', 'equipo', id, 'index.html'))) faltanEquipos.add(id);
      }
    }
  };
  busca(salida);
  for (const id of [...faltanEquipos].slice(0, 120)) {
    const rutaEquipo = `/explorar/equipo/${id}`;
    try {
      const respuesta = await fetch(`${origen}${rutaEquipo}`, { headers: { accept: 'text/html' } });
      if (!respuesta.ok) continue;
      const html = prepara(leeHtml(rutaEquipo, await respuesta.text()));
      const destino = join(salida, 'explorar', 'equipo', String(id), 'index.html');
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, html);
      rutasOk.push(rutaEquipo);
    } catch { /* opcional */ }
  }
  if (faltanEquipos.size) console.log(`fichas de equipo exportadas en la segunda pasada: ${Math.min(faltanEquipos.size, 120)}`);
}

// Saneado final: todo enlace interno debe apuntar a una página o recurso que exista en la foto. Lo que no
// existe (competiciones que no se exportan, jornadas de otras, etc.) se lleva al selector de competiciones.
{
  const existeEnFoto = (url) => {
    const ruta = url.replace(base, '').split('#')[0].split('?')[0];
    if (ruta === '' || ruta === '/') return existsSync(join(salida, 'index.html'));
    const rel = ruta.replace(/^\/+/, '');
    return existsSync(join(salida, rel))
      || existsSync(join(salida, rel, 'index.html'))
      || existsSync(join(salida, rel + '.html'));
  };
  // En la foto no hay fichas de equipo: el enlace a la ficha se queda en texto (nada de 404 ni de rebotes).
  let enlacesDeEquipoQuitados = 0;
  const sinEnlacesDeEquipo = (html) => html.replace(
    /<a\b[^>]*href="[^"]*\/explorar\/equipo\/\d+"[^>]*>([\s\S]*?)<\/a>/g,
    (_todo, dentro) => `<span class="font-medium text-[var(--texto)]">${dentro}</span>`,
  );
  // Los filtros del selector son un formulario GET: sin servidor no filtran y parece que «se resetean».
  // Se dejan los controles a la vista (enseñan el producto) pero sin formulario, y se avisa.
  let formularioNeutralizado = 0;
  const neutralizaFiltros = (html) => {
    if (!/action="[^"]*\/explorar\/competiciones"[^>]*method="get"/.test(html)) return html;
    formularioNeutralizado += 1;
    const aviso = '<p class="m-0 px-1 text-nota text-[var(--texto-suave)]">En esta foto estática los filtros se ven pero no filtran: la demo no tiene servidor. En la app completa (enlace del cartel) funcionan con las mismas opciones, incluido el estado sin resultados.</p>';
    let salida = html
      .replace(/<form\b([^>]*)action="[^"]*\/explorar\/competiciones"([^>]*)method="get"([^>]*)>/g, '<div$1$2$3 data-filtros-sin-servidor="1">')
      .replace(/<form\b([^>]*)method="get"([^>]*)action="[^"]*\/explorar\/competiciones"([^>]*)>/g, '<div$1$2$3 data-filtros-sin-servidor="1">')
      .replace(/<\/form>/g, '</div>');
    salida = salida.replace(/(<div[^>]*data-filtros-sin-servidor="1">)/, aviso + '$1');
    return salida;
  };

  let reescritos = 0;
  const recorreHtml = (dir) => {
    for (const f of readdirSync(dir)) {
      const ruta = join(dir, f);
      if (!existsSync(ruta)) continue;
      const info = statSync(ruta);
      if (info.isDirectory()) { recorreHtml(ruta); continue; }
      if (!f.endsWith('.html')) continue;
      let antes = readFileSync(ruta, 'utf8');
      if (f.endsWith('.html')) {
        const conFiltros = neutralizaFiltros(antes);
        const sinEquipos = conFiltros; // los nombres de equipo siguen siendo enlaces a su ficha (FP-U2)
        if (sinEquipos !== antes && /\/explorar\/equipo\/\d+/.test(antes)) enlacesDeEquipoQuitados += 1;
        antes = sinEquipos;
      }
      const despues = antes.replace(/(href|src)="(\/fondo-popular-demo\/[^"]+)"/g, (todo, atributo, url) => {
        if (existeEnFoto(url)) return todo;
        // Los recursos (CSS, JS, escudos, iconos) no son navegación: si faltan, se dejan como están.
        if (/\/(_next|escudos|escudos-fed|icon\.svg|favicon\.ico|robots\.txt)/.test(url)) return todo;
        reescritos += 1;
        return `${atributo}="${base}/explorar/competiciones"`;
      });
      if (despues !== antes) writeFileSync(ruta, despues, 'utf8');
    }
  };
  recorreHtml(salida);
  console.log(`enlaces internos reescritos al selector (no tenían página en la foto): ${reescritos}`);
  console.log(`páginas con enlaces de equipo convertidos en texto: ${enlacesDeEquipoQuitados} · formularios de filtro neutralizados: ${formularioNeutralizado}`);
}

writeFileSync(join(salida, '.nojekyll'), '');
writeFileSync(join(salida, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

console.log(`rutas publicadas: ${rutasOk.length}/${RUTAS.length}`);
if (rutasMal.length) console.log('rutas que fallaron:', rutasMal.join(' · '));
console.log(`escudos descargados: ${escudosOk} de ${escudos.size}`);
console.log(`directorio: ${salida}`);

// Si alguna ruta no se publicó, el proceso termina con error: un 404 silencioso (como el de /explorar el 10/11)
// es peor que no publicar, porque el enlace queda roto sin que nadie se entere.
if (rutasMal.length) process.exitCode = 1;
