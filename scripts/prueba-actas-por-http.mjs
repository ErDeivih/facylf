#!/usr/bin/env node
/*
 * ¿SE PUEDEN LEER LAS ACTAS POR HTTP EN VEZ DE CON NAVEGADOR?
 *
 * Es la palanca que queda para los tiempos de petición. Medido el 20/09/2026: las páginas de acta tardan 1-4 s con
 * Chrome (y 15 s en algún portal), mientras que las federaciones que van por HTTP —Valencia, Madrid— resuelven sus
 * fichas en 0,3-2 s gastando una fracción del procesador. Las actas son el grueso del trabajo (miles de fichas por
 * federación), así que pasar esas páginas a HTTP es donde está el ahorro grande de tiempo y de CPU.
 *
 * Esta prueba NO toca ninguna cola: coge actas que ya están hechas, las vuelve a pedir **por HTTP** y compara lo
 * que se interpreta con lo que guardó el navegador para esa misma acta. Si coincide, el camino por HTTP sirve; si
 * no coincide, no sirve y no se toca nada.
 *
 * Uso:
 *   node scripts/prueba-actas-por-http.mjs [--federacion andalucia] [--actas 5] [--pausa-ms 2000]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseaActa } from '../packages/ingesta/dist/src/parsers/acta.js';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const federacion = arg('federacion', 'andalucia');
const cuantas = Number(arg('actas', 5));
const pausaMs = Number(arg('pausa-ms', 2000));

const perfil = JSON.parse(readFileSync(join(raiz, 'perfiles', `${federacion}.json`), 'utf8'));
const base = join(raiz, perfil.carpeta ?? `descargas-${federacion}`, 'recolector-local');
const urlActa = (codigo) => `${perfil.base}/NFG_CmpPartido?` + new URLSearchParams({
  cod_primaria: perfil.codPrimaria, CodActa: codigo, cod_acta: codigo,
}).toString();

/** Lo que se compara: los campos deportivos, que son lo que se guarda. */
function resumenDe(acta) {
  return {
    marcador: `${acta?.golesLocal ?? '?'}-${acta?.golesVisitante ?? '?'}`,
    goles: acta?.goles?.length ?? 0,
    tarjetas: acta?.tarjetas?.length ?? 0,
    cambios: acta?.cambios?.length ?? 0,
    tecnicos: acta?.tecnicos?.length ?? 0,
    titularesLocal: acta?.lineups?.local?.titulares?.length ?? 0,
    titularesVisitante: acta?.lineups?.visitante?.titulares?.length ?? 0,
    arbitro: Boolean(String(acta?.arbitro ?? '').trim()),
  };
}

/** Busca el HTML archivado de un acta (para poder mirar el original si algo no cuadra). */
function buscaArchivado(codigo) {
  const pila = [base];
  while (pila.length) {
    const carpeta = pila.pop();
    let entradas = [];
    try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (e.isDirectory()) { if (e.name !== 'perfil-chrome') pila.push(ruta); continue; }
      if (e.name === `acta-${codigo}.json` || e.name === `acta-${codigo}.json.gz`) return ruta;
    }
  }
  return null;
}

const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
const actas = db.prepare(`select codigo, datos from actas where estado = 'hecha' and datos is not null
  order by comprobada_en desc limit ?`).all(cuantas);
const tiemposNavegador = new Map();
for (const a of actas) {
  const fila = db.prepare(`select duracion_ms from peticiones where url like ? order by id desc limit 1`)
    .get(`%CodActa=${a.codigo}%`);
  tiemposNavegador.set(a.codigo, fila?.duracion_ms ?? null);
}
db.close();

console.log(`═══ ¿actas por HTTP? · ${federacion} · ${actas.length} acta(s) de prueba`);
if (!actas.length) { console.log('  no hay actas hechas con datos guardados para comparar'); process.exit(0); }

// ── LA SESIÓN ANÓNIMA, UNA SOLA VEZ ──────────────────────────────────────────────────────────────────────────
//
// Medido el 20/09/2026: pedir el acta a pelo devuelve 302 a `/pnfg/NLogin` con una `JSESSIONID` nueva, y la
// portada también. La sesión se abre pasando por `NLogin?NSess=1`, que redirige de vuelta a la página pedida; a
// partir de ahí ESA cookie ya sirve para todas las actas. Es el mismo camino que hace el navegador, y por eso el
// coste es una sola vez por sesión y no por acta.
const galletas = new Map();
const guardaGalletas = (respuesta) => {
  for (const c of respuesta.headers.getSetCookie?.() ?? []) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    if (i > 0) galletas.set(par.slice(0, i), par.slice(i + 1));
  }
};
const cabeceras = () => ({
  'user-agent': `FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)`,
  accept: 'text/html,application/xhtml+xml',
  ...(galletas.size ? { cookie: [...galletas].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
});

async function abreSesion(urlEjemplo) {
  const base = new URL(urlEjemplo).origin;
  for (const paso of [`${base}/pnfg/`, urlEjemplo, `${base}/pnfg/NLogin?NSess=1`]) {
    try {
      const r = await fetch(paso, { redirect: 'manual', headers: cabeceras() });
      guardaGalletas(r);
      await r.text();
    } catch { /* se sigue: la sesión puede venir de un paso anterior */ }
  }
  return galletas.size > 0;
}

const sesion = await abreSesion(urlActa(actas[0].codigo));
console.log(`  sesión anónima: ${sesion ? `abierta (${[...galletas.keys()].join(', ')})` : 'NO se pudo abrir'}`);

let aciertos = 0;
let msHttp = 0;
let msNavegador = 0;
for (const [indice, acta] of actas.entries()) {
  const url = urlActa(acta.codigo);
  const t0 = process.hrtime.bigint();
  const antesCpu = process.cpuUsage();
  let html = '';
  try {
    let respuesta = await fetch(url, { redirect: 'manual', headers: cabeceras() });
    guardaGalletas(respuesta);
    // Si el portal manda al login, se pasa por NLogin y se repite UNA vez (es la sesión que se ha caído).
    if (respuesta.status >= 300 && respuesta.status < 400) {
      const destino = respuesta.headers.get('location') ?? '';
      const origen = new URL(url).origin;
      if (/NLogin/i.test(destino)) {
        await fetch(`${origen}/pnfg/NLogin?NSess=1`, { redirect: 'manual', headers: cabeceras() }).then((r) => { guardaGalletas(r); return r.text(); });
        respuesta = await fetch(url, { redirect: 'manual', headers: cabeceras() });
        guardaGalletas(respuesta);
      }
    }
    html = await respuesta.text();
  } catch (error) {
    console.log(`  acta ${acta.codigo}: la petición falló (${error.message})`);
    continue;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const cpu = process.cpuUsage(antesCpu);
  let parseada = null;
  try { parseada = parseaActa(html); } catch (error) { console.log(`  acta ${acta.codigo}: el parser falló (${error.message})`); continue; }

  const guardado = JSON.parse(acta.datos);
  const esperado = resumenDe(guardado);
  const obtenido = resumenDe(parseada);
  const igual = JSON.stringify(esperado) === JSON.stringify(obtenido);
  if (igual) aciertos += 1;
  msHttp += ms;
  const navegador = tiemposNavegador.get(acta.codigo);
  if (navegador) msNavegador += navegador;
  console.log(`\n  acta ${acta.codigo} · HTTP ${ms.toFixed(0)} ms · CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)} ms`
    + ` · ${(html.length / 1024).toFixed(0)} KB · navegador tardó ${navegador ?? '?'} ms`
    + ` · ${igual ? 'IGUAL ✓' : 'DISTINTO ✗'}`);
  if (!igual) {
    console.log(`    guardado por el navegador: ${JSON.stringify(esperado)}`);
    console.log(`    obtenido por HTTP:         ${JSON.stringify(obtenido)}`);
    const archivado = buscaArchivado(acta.codigo);
    console.log(`    HTML del navegador: ${archivado ?? '(no encontrado)'}`);
  }
  if (indice < actas.length - 1) await new Promise((r) => setTimeout(r, pausaMs));
}

console.log(`\n  resultado: ${aciertos}/${actas.length} actas idénticas`);
console.log(`  tiempo: HTTP ${(msHttp / actas.length).toFixed(0)} ms por acta`
  + (msNavegador ? ` · navegador ${(msNavegador / actas.length).toFixed(0)} ms por acta`
    + ` → ${(msNavegador / Math.max(1, msHttp)).toFixed(1)}× más rápido por HTTP` : ''));
