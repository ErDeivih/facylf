#!/usr/bin/env node
/**
 * Descubrimiento de la web pública de la RFMF. Melilla no expone el módulo
 * `/pnfg/NPcd` y, por tanto, no debe usar el worker PNFG. Este sondeo inventaría
 * datos si intentase fabricar códigos: se limita a inventariar las páginas y
 * documentos que la web enlaza realmente y deja su estado verificable en JSON.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

const raiz = resolve(import.meta.dirname, '..');
const salida = resolve(raiz, 'descargas-federacion-sondeo');
const portada = 'https://www.rfmf.es/pagina/index.php';
function argumento(nombre, defecto) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? process.argv[indice + 1] : defecto;
}
const pausaMs = Number(argumento('pausa-ms', 8000));
const max = Number(argumento('max', 0));
const reintentoDias = Number(argumento('reintento-dias', 30));
const agente = process.env.BOT_CONTACTO
  ? `FacylfBot/1.0 (proyecto personal; contacto: ${process.env.BOT_CONTACTO})`
  : 'FacylfBot/1.0 (proyecto personal)';

const duerme = (ms) => new Promise((r) => setTimeout(r, ms));
const limpia = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

async function descarga(url) {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': agente, accept: 'text/html,*/*' } });
    const cuerpo = await respuesta.text();
    return { status: respuesta.status, urlFinal: respuesta.url, cuerpo };
  } catch (error) {
    return { status: 0, urlFinal: url, cuerpo: '', error: error instanceof Error ? error.message : String(error) };
  }
}

function documentos(html, base) {
  if (!html) return [];
  const doc = parse(html);
  return doc.querySelectorAll('a').map((a) => {
    const href = a.getAttribute('href');
    if (!href) return null;
    let url;
    try { url = new URL(href, base).href; } catch { return null; }
    const nombre = limpia(a.text);
    return /\.(pdf|docx?|xlsx?|csv)(?:$|[?#])/i.test(url) ? { nombre, url } : null;
  }).filter(Boolean);
}

async function main() {
  mkdirSync(salida, { recursive: true });
  const archivo = join(salida, 'melilla-sondeo.json');
  let anterior = null;
  try {
    anterior = existsSync(archivo)
      ? JSON.parse(readFileSync(archivo, 'utf8').replace(/^\uFEFF/, ''))
      : null;
  } catch { /* un sondeo anterior incompleto no impide reconstruirlo */ }
  const anteriores = new Map((anterior?.paginas ?? []).map((p) => [p.url, p]));
  const inicio = await descarga(portada);
  // La ruta histórica puede desaparecer al migrar el portal. Comprobar la raíz
  // permite detectar el cambio sin interpretar el archivo antiguo como catálogo completo.
  let portalActual = null;
  if (inicio.status === 404 || inicio.status >= 500) {
    await duerme(pausaMs);
    const actual = await descarga('https://www.rfmf.es/');
    portalActual = { status: actual.status, urlFinal: actual.urlFinal,
      bytes: actual.cuerpo.length, comprobadoEn: new Date().toISOString(),
      requiereAcceso: /\/NLogin(?:[?/#]|$)/i.test(actual.urlFinal),
      enlaces: parse(actual.cuerpo).querySelectorAll('a[href]').map((a) => ({
        nombre: limpia(a.text), url: new URL(a.getAttribute('href'), actual.urlFinal).href,
      })).filter((a) => /^https:\/\/www\.rfmf\.es\//.test(a.url)),
    };
  }
  const copiaPortada = join(salida, 'muestras-melilla', 'index_php.html');
  const doc = parse(inicio.status === 200 ? inicio.cuerpo
    : existsSync(copiaPortada) ? readFileSync(copiaPortada, 'utf8') : inicio.cuerpo);
  const enlaces = new Map();
  for (const a of doc.querySelectorAll('a')) {
    const href = (a.getAttribute('href') ?? '').replace(/&amp;/g, '&');
    const coincidencia = /tipo=(Calendarios|Clasificaciones).*?[&]tem=([^&#]+)/i.exec(href);
    const esArchivoActas = /tipo=Inf(?:&|&amp;)cat=Actas/i.test(href);
    if (!coincidencia && !esArchivoActas) continue;
    const url = new URL(href, portada).href;
    enlaces.set(url, coincidencia
      ? { tipo: coincidencia[1], temporada: decodeURIComponent(coincidencia[2]), url }
      : { tipo: 'Actas', temporada: 'archivo', url });
  }
  // Si la portada falla de forma transitoria, no se pierde el inventario ya conocido.
  for (const pagina of anterior?.paginas ?? []) {
    if (pagina?.url && pagina.tipo && pagina.temporada && !enlaces.has(pagina.url)) {
      enlaces.set(pagina.url, { tipo: pagina.tipo, temporada: pagina.temporada, url: pagina.url });
    }
  }
  const paginas = [...enlaces.values()].sort((a, b) => b.temporada.localeCompare(a.temporada));
  const limite = max > 0 ? paginas.slice(0, max) : paginas;
  const resultado = {
    federacion: 'melilla', plataforma: 'web-rfmf-no-pnfg', generadoEn: new Date().toISOString(),
    portada: { url: portada, status: inicio.status, urlFinal: inicio.urlFinal },
    paginasDescubiertas: paginas.length, paginas: [],
    portalActual,
    descubrimientoCompleto: false,
    observacion: `Portada histórica: HTTP ${inicio.status}. El inventario conservado no demuestra ` +
      'cobertura completa. Revisar portalActual y el estado individual de cada ruta antes de afirmar ausencia de datos.',
  };
  const umbral = Date.now() - reintentoDias * 24 * 60 * 60_000;
  for (const pagina of limite) {
    const previa = anteriores.get(pagina.url);
    const comprobada = Date.parse(previa?.comprobadoEn ?? anterior?.generadoEn ?? '');
    if (previa && Number.isFinite(comprobada) && comprobada > umbral) {
      resultado.paginas.push({ ...previa, ...pagina, reutilizada: true });
      console.log(`${pagina.tipo} ${pagina.temporada}: se conserva el sondeo reciente (sin petición)`);
      continue;
    }
    const respuesta = await descarga(pagina.url);
    resultado.paginas.push({ ...pagina, status: respuesta.status, urlFinal: respuesta.urlFinal,
      bytes: respuesta.cuerpo.length, documentos: documentos(respuesta.cuerpo, respuesta.urlFinal),
      error: respuesta.error, comprobadoEn: new Date().toISOString(), reutilizada: false });
    console.log(`${pagina.tipo} ${pagina.temporada}: HTTP ${respuesta.status}, ${respuesta.cuerpo.length} bytes`);
    if (pagina !== limite.at(-1)) await duerme(pausaMs);
  }
  const temporal = `${archivo}.tmp-${process.pid}`;
  const visitadas = new Set(resultado.paginas.map((p) => p.url));
  for (const pagina of paginas) {
    if (!visitadas.has(pagina.url)) {
      resultado.paginas.push({ ...(anteriores.get(pagina.url) ?? {}), ...pagina,
        reutilizada: true, pendienteDeComprobar: !anteriores.has(pagina.url) });
    }
  }
  writeFileSync(temporal, JSON.stringify(resultado, null, 2));
  renameSync(temporal, archivo);
  console.log(`Guardado: ${archivo}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
