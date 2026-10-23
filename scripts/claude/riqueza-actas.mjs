#!/usr/bin/env node
/**
 * RIQUEZA DE LAS ÚLTIMAS ACTAS LEÍDAS: de las N últimas actas «hecha» de una o varias colas, qué porcentaje trae
 * alineaciones, código de jugador, tarjetas, cambios y goles (cuando el marcador no es 0-0). Sólo cifras.
 *
 * Sirve para ver de un vistazo si una federación ha dejado de dar (o nunca dio) algún dato, o si un cambio del
 * extractor ha surtido efecto (p. ej. Cataluña 22/10/2026: tarjetas, cambios y códigos desde los iconos).
 * Abre cada cola en SÓLO LECTURA y sólo usa índices (actas_estado + claves primarias): segundos por cola.
 *
 *   node scripts/claude/riqueza-actas.mjs <cola-v2.sqlite>[,<otra>...] [--muestra 1500] [--nombres fed1,fed2]
 *   node scripts/claude/riqueza-actas.mjs --todas [--raiz .] [--solo fed1,fed2]   (descargas-*\/recolector-local/cola-v2.sqlite)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const muestra = Number(opt('--muestra', '1500'));
let colas = [];
// --solo fed1,fed2: sólo esas (cada máquina tiene copias viejas de las colas de la otra; ver REPARTO en lib/vigia-colas.mjs).
const solo = new Set((opt('--solo') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
if (args.includes('--todas')) {
  const raiz = opt('--raiz', process.env.FACYLF_RAIZ ?? '.');
  for (const d of readdirSync(raiz).filter((x) => x.startsWith('descargas-')).sort()) {
    const ruta = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
    const nombre = d.replace('descargas-', '');
    if (existsSync(ruta) && (!solo.size || solo.has(nombre))) colas.push({ nombre, ruta });
  }
} else {
  const nombres = (opt('--nombres') ?? '').split(',').filter(Boolean);
  colas = args[0].split(',').map((ruta, i) => ({ nombre: nombres[i] ?? ruta, ruta }));
}

const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '—');
const filas = [];
for (const { nombre, ruta } of colas) {
  const t0 = Date.now();
  let db;
  try { db = new DatabaseSync(ruta, { readOnly: true }); db.prepare('select 1 from actas limit 1').get(); }
  catch (e) { filas.push({ nombre, error: e.message.slice(0, 80) }); continue; }
  try {
    const actas = db.prepare(`select temporada,competicion,grupo,jornada,codigo,menores from actas indexed by actas_estado
      where estado='hecha' order by rowid desc limit ?`).all(muestra);
    const qPart = db.prepare(`select count(*) n, sum(jugador_codigo is not null and jugador_codigo<>'') cod,
      sum(condicion='titulares') tit from participaciones where temporada=? and competicion=? and grupo=? and jornada=? and acta=?`);
    const qEv = db.prepare(`select tipo, count(*) n from eventos_acta where temporada=? and competicion=? and grupo=? and jornada=? and acta=? group by tipo`);
    const qPar = db.prepare(`select goles_local gl, goles_visitante gv from partidos where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=? limit 1`);
    const c = { actas: actas.length, conAlin: 0, jug: 0, cod: 0, conTarj: 0, conCamb: 0, conGolPos: 0, conGol: 0, menores: 0 };
    const tipos = {};
    const temporadas = {};
    for (const a of actas) {
      const k = [a.temporada, a.competicion, a.grupo, a.jornada, a.codigo];
      temporadas[a.temporada] = (temporadas[a.temporada] ?? 0) + 1;
      if (a.menores) c.menores += 1;
      const p = qPart.get(...k);
      if (p.tit > 0) c.conAlin += 1;
      c.jug += p.n; c.cod += p.cod ?? 0;
      const ev = Object.fromEntries(qEv.all(...k).map((r) => [r.tipo, r.n]));
      for (const [t, n] of Object.entries(ev)) tipos[t] = (tipos[t] ?? 0) + n;
      if (Object.keys(ev).some((t) => /amarill|roj|tarjeta|azul/i.test(t))) c.conTarj += 1;
      if (ev.sale || ev.entra || ev.cambio) c.conCamb += 1;
      let par = null;
      try { par = qPar.get(...k); } catch { /* sin columna codigo_acta */ }
      if (par && (par.gl > 0 || par.gv > 0)) { c.conGolPos += 1; if (ev.gol) c.conGol += 1; }
    }
    filas.push({ nombre, ms: Date.now() - t0, temporadas, tipos, ...c });
  } catch (e) { filas.push({ nombre, error: e.message.slice(0, 120) }); }
  db.close();
}

console.log(`riqueza de las últimas ${muestra} actas «hecha» por cola (${new Date().toISOString()})`);
console.log('federación            actas  menores  alin.  códigos  tarjetas  cambios  goles(si marcador>0)  temporadas');
for (const f of filas) {
  if (f.error) { console.log(`${f.nombre.padEnd(20)}  ERROR ${f.error}`); continue; }
  const temps = Object.entries(f.temporadas).sort().map(([t, n]) => `${t}:${n}`).join(' ');
  console.log(`${f.nombre.padEnd(20)} ${String(f.actas).padStart(6)} ${pct(f.menores, f.actas).padStart(8)} ${pct(f.conAlin, f.actas).padStart(6)}`
    + ` ${pct(f.cod, f.jug).padStart(8)} ${pct(f.conTarj, f.actas).padStart(9)} ${pct(f.conCamb, f.actas).padStart(8)}`
    + ` ${pct(f.conGol, f.conGolPos).padStart(21)}  ${temps}`);
}
console.log('\ntipos de evento (muestra):');
for (const f of filas.filter((x) => !x.error)) console.log(`  ${f.nombre}: ${Object.entries(f.tipos).map(([t, n]) => `${t}=${n}`).join(' ')}  (${f.ms} ms)`);
