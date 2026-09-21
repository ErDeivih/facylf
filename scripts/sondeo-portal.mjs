#!/usr/bin/env node
/**
 * SONDEO DE PORTAL genérico (Baleares, Cataluña y cualquier web que no use /pnfg ni iSquad).
 *
 * No inventa nada: lee el robots.txt, respeta lo que permite y se limita a INVENTARIAR las páginas
 * y documentos que la web enlaza de verdad (competiciones, calendarios, clasificaciones, actas…).
 * El resultado es la base para decidir si se puede construir un adaptador y cómo.
 *
 * Uso:
 *   node scripts/sondeo-portal.mjs --nombre baleares --url https://www.ffib.es/Fed/
 *   node scripts/sondeo-portal.mjs --nombre cataluna --url https://www.fcf.cat/ca/competicio
 * Opciones: --pausa-ms 8000  --max 40 (páginas a visitar)  --contacto correo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

function arg(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const RAIZ = resolve(import.meta.dirname, '..');
const SALIDA = resolve(RAIZ, 'descargas-federacion-sondeo');
const NOMBRE = arg('nombre', '');
const PORTAL = arg('url', '');
const PAUSA = Number(arg('pausa-ms', 10000));
const MAX = Number(arg('max', 40));
const CONTACTO = arg('contacto', process.env.BOT_CONTACTO || '');

if (!NOMBRE || !PORTAL) { console.error('Faltan --nombre y --url'); process.exit(2); }

const AGENTE = CONTACTO
  ? `FacylfBot/1.0 (proyecto personal; contacto: ${CONTACTO})`
  : 'FacylfBot/1.0 (proyecto personal)';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpia = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/* Categorías por palabras clave (en castellano y catalán). */
const CATEGORIAS = [
  ['competicion', /competic|lliga|liga|copa|torneo|torneig/i],
  ['calendario', /calendar|calendari/i],
  ['clasificacion', /clasific|classificaci/i],
  ['jornada', /jornada|resultat|resultado/i],
  ['acta', /acta|ficha|fitxa|partido|partit/i],
  ['equipo', /equipo|equip|club/i],
  ['jugador', /jugador|plantilla|fitxa/i],
  ['documento', /\.(pdf|docx?|xlsx?|csv|odt|ods)(?:$|[?#])/i],
];

function categoriza(url) {
  const encontradas = CATEGORIAS.filter(([, re]) => re.test(url)).map(([c]) => c);
  return encontradas.length ? encontradas : ['otra'];
}

async function descarga(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'text/html,*/*' }, redirect: 'follow' });
    return { status: r.status, urlFinal: r.url, cuerpo: await r.text() };
  } catch (e) {
    return { status: 0, urlFinal: url, cuerpo: '', error: e instanceof Error ? e.message : String(e) };
  }
}

function reglasGenericas(contenido) {
  const reglas = [];
  let aplica = false;
  for (const lineaBruta of contenido.split(/\r?\n/)) {
    const linea = lineaBruta.replace(/#.*$/, '').trim();
    if (!linea) continue;
    const [campoBruto, ...resto] = linea.split(':');
    const campo = campoBruto.toLowerCase().trim();
    const valor = resto.join(':').trim();
    if (campo === 'user-agent') aplica = valor === '*';
    else if (aplica && (campo === 'allow' || campo === 'disallow')) reglas.push({ tipo: campo, ruta: valor });
  }
  return reglas;
}

function permitida(ruta, robots) {
  if (!robots.disponible) return true;
  const cand = robots.reglas
    .filter((r) => r.ruta && ruta.startsWith(r.ruta))
    .sort((a, b) => b.ruta.length - a.ruta.length || (a.tipo === 'allow' ? -1 : 1));
  return cand.length === 0 || cand[0].tipo === 'allow';
}

function enlaces(html, base) {
  const doc = parse(html);
  const salida = [];
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    if (url.host !== new URL(base).host) continue;
    salida.push({ url: url.href, texto: limpia(a.text).slice(0, 120) });
  }
  return salida;
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const base = new URL(PORTAL);

  // 1) robots.txt
  let robots = { url: `${base.origin}/robots.txt`, disponible: false, reglas: [], texto: '' };
  try {
    const r = await fetch(robots.url, { headers: { 'user-agent': AGENTE } });
    const texto = await r.text();
    robots = { url: robots.url, status: r.status, disponible: r.ok, reglas: reglasGenericas(texto), texto: texto.slice(0, 4000) };
  } catch (e) {
    robots.error = e instanceof Error ? e.message : String(e);
  }
  console.log(`robots.txt: ${robots.status ?? 'error'} · reglas agente genérico: ${robots.reglas.length}`);

  // Si el portal excluye su raíz para el agente genérico (caso actual de Baleares), el sondeo no
  // debe cargar ni siquiera la portada. Se conserva un informe explícito para que el visor pueda
  // distinguir "no investigado" de "automatización no permitida" sin repetir intentos inútiles.
  if (!permitida(base.pathname || '/', robots)) {
    const resultado = {
      federacion: NOMBRE,
      plataforma: `portal-${base.host}`,
      adaptador: 'sondeo-portal',
      generadoEn: new Date().toISOString(),
      portal: { url: PORTAL, status: null, urlFinal: null },
      robots,
      porCategoria: {},
      paginasDescubiertas: 0,
      enlaces: [],
      paginas: [],
      estado: 'no-automatizable-segun-robots',
      observacion: 'robots.txt excluye esta ruta para el agente genérico; no se ha solicitado la portada.',
    };
    const archivo = join(SALIDA, `${NOMBRE}-sondeo.json`);
    writeFileSync(archivo, JSON.stringify(resultado, null, 2));
    console.log(`Ruta no permitida por robots.txt; informe guardado sin visitar la portada: ${archivo}`);
    return;
  }

  // 2) portada
  await dormir(PAUSA);
  const inicio = await descarga(PORTAL);
  const encontrados = enlaces(inicio.cuerpo, inicio.urlFinal || PORTAL);

  // 3) clasifica y filtra por robots + mismo host
  const vistos = new Set();
  const catalogo = [];
  for (const e of encontrados) {
    const u = new URL(e.url);
    if (vistos.has(e.url)) continue;
    vistos.add(e.url);
    const cats = categoriza(e.url);
    catalogo.push({ url: e.url, texto: e.texto, categorias: cats, permitido: permitida(u.pathname, robots) });
  }
  const interesantes = catalogo.filter((c) => c.permitido && !c.categorias.includes('otra') && !c.categorias.includes('documento'));
  console.log(`portada: HTTP ${inicio.status} · enlaces ${catalogo.length} · interesantes permitidos ${interesantes.length}`);

  // 4) visita las interesantes (limitado) y recoge documentos y sub-enlaces
  const limite = MAX > 0 ? interesantes.slice(0, MAX) : interesantes;
  const paginas = [];
  for (const item of limite) {
    await dormir(PAUSA);
    const r = await descarga(item.url);
    const sub = enlaces(r.cuerpo, r.urlFinal || item.url);
    const documentos = sub.filter((s) => /\.(pdf|docx?|xlsx?|csv)(?:$|[?#])/i.test(s.url)).slice(0, 40);
    paginas.push({ ...item, status: r.status, bytes: r.cuerpo.length, titulo: limpia(parse(r.cuerpo || '<html>').querySelector('title')?.text ?? ''), documentos, enlaces: sub.length });
    console.log(`  ${item.categorias.join('/')} HTTP ${r.status} · ${r.cuerpo.length} B · ${documentos.length} documentos · ${sub.length} enlaces — ${item.url}`);
  }

  const porCategoria = {};
  for (const c of catalogo) for (const cat of c.categorias) porCategoria[cat] = (porCategoria[cat] ?? 0) + 1;

  const resultado = {
    federacion: NOMBRE, plataforma: `portal-${base.host}`, adaptador: 'sondeo-portal',
    generadoEn: new Date().toISOString(),
    portal: { url: PORTAL, status: inicio.status, urlFinal: inicio.urlFinal },
    robots,
    porCategoria,
    paginasDescubiertas: catalogo.length,
    enlaces: catalogo,
    paginas,
    observacion: 'Inventario de lo que la web publica y permite. No se han fabricado códigos ni rutas; sirve para decidir si se construye un adaptador.',
  };
  const archivo = join(SALIDA, `${NOMBRE}-sondeo.json`);
  writeFileSync(archivo, JSON.stringify(resultado, null, 2));
  console.log(`Guardado: ${archivo}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
