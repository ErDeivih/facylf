#!/usr/bin/env node
/*
 * ── ¿HACE FALTA UN NAVEGADOR PARA LEER ESTAS PÁGINAS? (2.ª prueba: con sesión anónima) ──────────────────
 *
 * La primera prueba pedía el acta «a pelo» y el portal devolvía 117 bytes: su muro de cortesía, el mismo que
 * está documentado en `navega()`. Pero ese muro NO es el contenido: es que faltaba la sesión anónima. El
 * recolector ya lo resuelve así —pide la portada `/pnfg/`, acepta, y REPITE la petición— sólo que lo hace con
 * un navegador entero.
 *
 * Esta prueba hace lo mismo pero con peticiones normales: guarda las cookies que devuelve la portada y vuelve
 * a pedir el acta con ellas. Si así llega el HTML completo, el navegador no es necesario para leer actas y el
 * ahorro es de segundos de procesador POR PÁGINA (medido: 2-10 s con navegador frente a 0,05 s por API).
 *
 * SÓLO LEE: hace unas pocas peticiones con la identidad del recolector y con pausa entre ellas.
 *
 * Uso:
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/prueba-html-con-sesion.mjs [federación] [cuántas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const CUANTAS = Number(process.argv[3] ?? 3);
const PAUSA_MS = Number(process.env.FACYLF_PAUSA_MS ?? 3000);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(1);
}

let identidad = 'FacylfBot/1.0';
try {
  const cfg = JSON.parse(readFileSync(join(RAIZ, `recolector.${FEDERACION}.config.json`), 'utf8'));
  const contacto = cfg?.identidad?.contacto ?? '';
  identidad = contacto ? `FacylfBot/1.0 (contacto: ${contacto})` : 'FacylfBot/1.0';
} catch { /* identidad mínima */ }

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
const filas = db.prepare(`
  select trabajo, url, detalle, duracion_ms from peticiones
  where resultado = 'ok' and trabajo like 'acta|%' and detalle like '% bytes'
  order by id desc limit ?
`).all(CUANTAS * 6);
db.close();

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un tarro de cookies mínimo: guarda `nombre=valor` por dominio de la respuesta. */
const tarro = new Map();
function guardaCookies(respuesta) {
  const puestas = typeof respuesta.headers.getSetCookie === 'function'
    ? respuesta.headers.getSetCookie() : [];
  for (const linea of puestas) {
    const par = String(linea).split(';')[0];
    const igual = par.indexOf('=');
    if (igual > 0) tarro.set(par.slice(0, igual).trim(), par.slice(igual + 1).trim());
  }
}
function cabeceraCookies() {
  return [...tarro.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function pide(url, { conCookies = true } = {}) {
  const cabeceras = { 'user-agent': identidad, accept: 'text/html,application/xhtml+xml,*/*' };
  if (conCookies && tarro.size) cabeceras.cookie = cabeceraCookies();
  const t0 = Date.now();
  const respuesta = await fetch(url, { headers: cabeceras, redirect: 'follow' });
  guardaCookies(respuesta);
  const texto = await respuesta.text();
  return { texto, ms: Date.now() - t0, estado: respuesta.status };
}

console.log(`prueba con sesión anónima · ${FEDERACION} · ${CUANTAS} página(s)\n`);

let elegidas = 0;
let base = null;
for (const fila of filas) {
  if (elegidas >= CUANTAS) break;
  const bytesNavegador = Number(String(fila.detalle).match(/(\d+) bytes/)?.[1] ?? 0);
  if (!bytesNavegador) continue;

  // La portada de la federación: es lo que da la sesión anónima (el recolector hace lo mismo al encontrar el muro).
  if (!base) {
    base = new URL(fila.url).origin + '/pnfg/';
    const r = await pide(base, { conCookies: false });
    console.log(`── portada ${base}`);
    console.log(`   ${r.estado} · ${Buffer.byteLength(r.texto, 'utf8')} bytes en ${(r.ms / 1000).toFixed(1)} s `
      + `· cookies: ${[...tarro.keys()].join(', ') || '(ninguna)'}`);
    // Si la portada trae el cartel, se busca su enlace de aceptación y se pide: eso es «aceptar» sin navegador.
    const aceptar = /href="([^"]*(?:cookie|consent|aceptar)[^"]*)"/i.exec(r.texto)?.[1];
    if (aceptar) {
      const destino = new URL(aceptar, base).href;
      const r2 = await pide(destino);
      console.log(`   aceptación ${destino} → ${r2.estado}; cookies: ${[...tarro.keys()].join(', ') || '(ninguna)'}`);
    }
    await dormir(PAUSA_MS);
    console.log('');
  }

  elegidas += 1;
  const r = await pide(fila.url);
  const bytes = Buffer.byteLength(r.texto, 'utf8');
  const esMuro = /no se ha aceptado el cookie/i.test(r.texto) || bytes < 3000;
  console.log(`── ${fila.trabajo}`);
  console.log(`   navegador: ${bytesNavegador} bytes en ${(Number(fila.duracion_ms) / 1000).toFixed(1)} s`);
  console.log(`   con sesión normal: ${bytes} bytes en ${(r.ms / 1000).toFixed(1)} s (${r.estado})`
    + ` → ${(100 * bytes / bytesNavegador).toFixed(0)} % del tamaño`
    + (esMuro ? '  ← SIGUE SIENDO EL MURO' : ''));
  for (const [nombre, re] of [
    ['tabla', /<table/i],
    ['marcador', /\d+\s*[-–]\s*\d+/],
    ['encabezado de alineación', /alineaci|titular|jugador/i],
  ]) {
    console.log(`   ${re.test(r.texto) ? '✓' : '✗'} ${nombre}`);
  }
  console.log('');
  if (elegidas < CUANTAS) await dormir(PAUSA_MS);
}

if (!elegidas) console.log('no se encontraron peticiones de acta con tamaño registrado');
