#!/usr/bin/env node
/**
 * SONDEO PUNTUAL DE FUENTES MULTIDEPORTE — una página pública por fuente, nunca un recorrido.
 *
 * Para cada fuente de `fuentes.json` con politica='sondeo': lee su robots.txt (con comodines, ver
 * lib/robots.mjs), y SÓLO si la ruta está permitida pide esa página, la guarda comprimida como evidencia y
 * anota qué plataforma declara y qué enlaces de datos trae. Entre peticiones espera 10-15 s (o el
 * Crawl-delay del sitio si es mayor). Las fuentes con politica='no' no se tocan: se listan con su motivo.
 *
 * Salida: descargas-sondeo-multideporte/AAAA-MM-DD/{resumen.json, resumen.md, <id>.html.gz}
 * Uso (en el PC): node scripts/multideporte/sondeo-multideporte.mjs [--solo id1,id2]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { interpretaRobots, permitido } from '../lib/robots.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const AGENTE = 'FacylfBot/1.0 (proyecto personal; sondeo puntual de una pagina por fuente)';
const ficheroFuentes = process.argv.find((a) => a.startsWith('--fuentes='))?.slice(10) ?? join(AQUI, 'fuentes.json');
const { fuentes } = JSON.parse(readFileSync(resolve(ficheroFuentes), 'utf8'));
// Ritmo: el de la flota (recolector.config.json → 6-8 s); se puede bajar a 4-6 s con --min-seg/--max-seg.
const MIN_SEG = Number(process.argv.find((a) => a.startsWith('--min-seg='))?.slice(10) ?? 5);
const MAX_SEG = Number(process.argv.find((a) => a.startsWith('--max-seg='))?.slice(10) ?? 8);
const solo = (process.argv.find((a) => a.startsWith('--solo='))?.slice(7)
  ?? (process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : '') ?? '')
  .split(',').filter(Boolean);
const dia = new Date().toISOString().slice(0, 10);
const etiqueta = process.argv.find((a) => a.startsWith('--etiqueta='))?.slice(11) ?? '';
const salida = join(RAIZ, 'descargas-sondeo-multideporte', etiqueta ? `${dia}-${etiqueta}` : dia);
mkdirSync(salida, { recursive: true });

const HUELLAS = [
  ['isquad', /isquad|toools/i], ['serversports', /serversports/i], ['gesdeportiva', /gesdeportiva|indalweb/i],
  ['dataproject', /data\s*project/i], ['feb', /feb\.es|federaci[oó]n espa[nñ]ola de baloncesto/i],
  ['clupik', /clupik|leverade/i], ['competize', /competize/i], ['ckan', /ckan/i],
];
const ENLACES = /href="([^"]*(?:acta|resultado|clasificaci|situation|calendar|jornada|partido|match|boxscore|competici)[^"]*)"/gi;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ultima = 0;
async function pide(url, minimoSeg) {
  const hueco = Math.max(minimoSeg * 1000, (MIN_SEG + Math.random() * (MAX_SEG - MIN_SEG)) * 1000);
  const falta = ultima + hueco - Date.now();
  if (ultima && falta > 0) await espera(falta);
  ultima = Date.now();
  const r = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'text/html,*/*' },
    redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  const bruto = Buffer.from(await r.arrayBuffer());
  return { estado: r.status, final: r.url, tipo: r.headers.get('content-type'), cuerpo: bruto.toString('utf8'), bruto };
}

const robotsPorHost = new Map();
async function robotsDe(url) {
  const base = new URL(url).origin;
  if (robotsPorHost.has(base)) return robotsPorHost.get(base);
  let dato;
  try {
    const r = await pide(`${base}/robots.txt`, 0);
    if (r.estado === 404 || r.estado === 410) dato = { legible: true, reglas: interpretaRobots(''), estado: r.estado };
    else if (r.estado >= 200 && r.estado < 300) dato = { legible: true, reglas: interpretaRobots(r.cuerpo), estado: r.estado, texto: r.cuerpo.slice(0, 4000) };
    else dato = { legible: false, estado: r.estado };
  } catch (e) { dato = { legible: false, error: String(e?.message ?? e) }; }
  robotsPorHost.set(base, dato);
  return dato;
}

const resultados = [];
for (const f of fuentes) {
  if (solo.length && !solo.includes(f.id)) continue;
  const fila = { id: f.id, deporte: f.deporte, plataforma: f.plataforma, url: f.url, politica: f.politica, nota: f.notaPolitica ?? null };
  if (f.politica !== 'sondeo' && f.politica !== 'ritmo') { fila.decision = 'no se pide (política)'; resultados.push(fila); console.log(`— ${f.id}: no se toca (${f.notaPolitica})`); continue; }
  const robots = await robotsDe(f.url);
  fila.robots = { legible: robots.legible, estado: robots.estado ?? null, crawlDelay: robots.reglas?.crawlDelay ?? null };
  if (!robots.legible) { fila.decision = 'robots.txt ilegible: no se pide'; resultados.push(fila); console.log(`? ${f.id}: robots ilegible`); continue; }
  const u = new URL(f.url);
  const vetada = !permitido(robots.reglas, AGENTE, u.pathname + u.search);
  fila.robotsLaVeta = vetada;
  // 'ritmo' = decisión de David (30/09/2026): como con las federaciones de fútbol, se pide aunque robots.txt
  // lo vete, a ritmo respetuoso y una página cada vez. Queda anotado en el resumen.
  if (vetada && f.politica !== 'ritmo') { fila.decision = 'vetada por robots.txt'; resultados.push(fila); console.log(`✗ ${f.id}: vetada por robots`); continue; }
  try {
    const r = await pide(f.url, robots.reglas.crawlDelay ?? 0);
    writeFileSync(join(salida, `${f.id}.html.gz`), gzipSync(r.bruto));
    const enlaces = [...new Set([...r.cuerpo.matchAll(ENLACES)].map((m) => m[1]))];
    Object.assign(fila, {
      decision: 'pedida', estado: r.estado, urlFinal: r.final, tipo: r.tipo, bytes: Buffer.byteLength(r.cuerpo),
      titulo: r.cuerpo.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? null,
      huellas: HUELLAS.filter(([, re]) => re.test(r.cuerpo)).map(([n]) => n),
      necesitaJs: Buffer.byteLength(r.cuerpo) < 3000 || /<div id="(root|app|__next)"><\/div>/i.test(r.cuerpo),
      enlacesDeDatos: enlaces.length, muestraEnlaces: enlaces.slice(0, 12),
    });
    console.log(`✓ ${f.id}: ${r.estado} · ${fila.bytes} B · ${fila.huellas.join(',') || 'sin huella'} · ${enlaces.length} enlaces de datos`);
    // Un nivel más: enlaces de la página que casan con `seguir` (o una plantilla con $1) y URLs `extra`.
    const siguientes = [];
    for (const regla of f.seguir ?? []) {
      const re = new RegExp(regla.patron, 'g');
      const vistos = new Set();
      for (const m of r.cuerpo.matchAll(re)) {
        const crudo = (regla.plantilla ? regla.plantilla.replace('$1', m[1]) : m[1]).replace(/&amp;/g, '&');
        if (regla.excluir && new RegExp(regla.excluir, 'i').test(crudo)) continue;
        const destino = new URL(crudo, r.final).href;
        if (vistos.has(destino)) continue;
        vistos.add(destino);
        siguientes.push({ nombre: regla.nombre, url: destino });
        if (vistos.size >= (regla.max ?? 1)) break;
      }
    }
    for (const [k, url] of (f.extra ?? []).entries()) siguientes.push({ nombre: `extra${k + 1}`, url });
    fila.hijas = [];
    for (const [k, h] of siguientes.entries()) {
      const hu = new URL(h.url);
      const robotsH = await robotsDe(h.url);
      const vetadaH = robotsH.legible ? !permitido(robotsH.reglas, AGENTE, hu.pathname + hu.search) : true;
      if (vetadaH && f.politica !== 'ritmo') { fila.hijas.push({ ...h, decision: 'vetada o robots ilegible' }); continue; }
      try {
        const rh = await pide(h.url, robotsH.reglas?.crawlDelay ?? 0);
        const nombre = `${f.id}--${h.nombre}-${k + 1}`;
        const binario = /pdf|octet/i.test(rh.tipo ?? '');
        writeFileSync(join(salida, `${nombre}${binario ? '.bin' : '.html'}.gz`), gzipSync(rh.bruto));
        fila.hijas.push({ ...h, fichero: nombre, estado: rh.estado, tipo: rh.tipo, bytes: Buffer.byteLength(rh.cuerpo), robotsLaVeta: vetadaH });
        console.log(`    ↳ ${h.nombre}: ${rh.estado} · ${Buffer.byteLength(rh.cuerpo)} B · ${rh.tipo}`);
      } catch (e) { fila.hijas.push({ ...h, decision: 'error', error: String(e?.message ?? e) }); }
    }
  } catch (e) { fila.decision = 'error'; fila.error = String(e?.message ?? e); console.log(`! ${f.id}: ${fila.error}`); }
  resultados.push(fila);
}

writeFileSync(join(salida, 'resumen.json'), JSON.stringify({ cuando: new Date().toISOString(), agente: AGENTE, resultados,
  robots: Object.fromEntries([...robotsPorHost].map(([h, d]) => [h, { estado: d.estado ?? null, texto: d.texto ?? null }])) }, null, 2));
const md = ['| fuente | deporte | decisión | HTTP | bytes | huellas | enlaces | ¿JS? |', '|---|---|---|---|---|---|---|---|',
  ...resultados.map((r) => `| ${r.id} | ${r.deporte} | ${r.decision} | ${r.estado ?? ''} | ${r.bytes ?? ''} | ${(r.huellas ?? []).join(', ')} | ${r.enlacesDeDatos ?? ''} | ${r.necesitaJs == null ? '' : r.necesitaJs ? 'sí' : 'no'} |`)];
writeFileSync(join(salida, 'resumen.md'), md.join('\n') + '\n');
console.log(`\nResumen en ${join(salida, 'resumen.md')}`);
