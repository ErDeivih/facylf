/*
 * ¿Qué se ha TRABAJADO en los últimos N minutos? Una foto de la ventana, no del acumulado.
 *
 * Por federación: peticiones correctas y con incidencia, de qué TIPO eran (el tipo va en la clave del trabajo:
 * `acta|21|...`, `jornada|20|...`), cuántas direcciones distintas se han dado por hechas y cuántas actas y
 * jornadas han quedado anotadas de verdad. Al final, la última línea del registro de cada una, que es lo que
 * está haciendo en este mismo momento.
 *
 * Sólo lee. Uso: node scripts/_diag-ultimos-minutos.mjs [minutos=15]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freemem } from 'node:os';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const minutos = Number(process.argv[2] ?? 15);
const hasta = new Date();
const desde = new Date(hasta.getTime() - minutos * 60000);
const desdeIso = desde.toISOString();

const filas = [];
const totales = { ok: 0, mal: 0, porTipo: new Map(), hechas: 0, actas: 0, jornadas: 0, incidencias: new Map() };

for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const base = join(raiz, carpeta, 'recolector-local');
  const ruta = join(base, 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const federacion = carpeta.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });

  const ok = db.prepare(`select count(*) n from peticiones where iniciada_en >= ? and resultado='ok'`).get(desdeIso).n;
  const mal = db.prepare(`select count(*) n from peticiones where iniciada_en >= ? and resultado<>'ok'`).get(desdeIso).n;

  // De qué eran: el tipo va delante de la clave del trabajo.
  const porTipo = new Map();
  for (const r of db.prepare(`select substr(trabajo, 1, instr(trabajo, '|') - 1) tipo, count(*) n
    from peticiones where iniciada_en >= ? and resultado='ok' group by tipo order by n desc`).all(desdeIso)) {
    porTipo.set(r.tipo, r.n);
    totales.porTipo.set(r.tipo, (totales.porTipo.get(r.tipo) ?? 0) + r.n);
  }
  // Direcciones distintas terminadas (una misma dirección puede pedirse dos veces en la ventana).
  const distintas = db.prepare(`select count(distinct trabajo) n from peticiones
    where iniciada_en >= ? and resultado='ok'`).get(desdeIso).n;
  for (const r of db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= ? and resultado<>'ok'
    group by resultado order by n desc`).all(desdeIso)) {
    totales.incidencias.set(r.resultado, (totales.incidencias.get(r.resultado) ?? 0) + r.n);
  }
  const actas = db.prepare(`select count(*) n from actas where comprobada_en >= ?`).get(desdeIso).n;
  const jornadas = db.prepare(`select count(*) n from jornadas where comprobada_en >= ?`).get(desdeIso).n;
  const hechas = db.prepare(`select count(*) n from trabajos where estado='hecho' and actualizado_en >= ?`).get(desdeIso).n;
  const enCurso = db.prepare(`select count(*) n from trabajos where estado='en_curso'`).get().n;
  const pausa = db.prepare(`select valor from metadatos where clave='pausa_global_hasta'`).get()?.valor ?? '';
  db.close();

  const registro = join(base, 'worker-programado.log');
  let ultimaLinea = '(sin registro)';
  let edadRegistro = null;
  if (existsSync(registro)) {
    const lineas = readFileSync(registro, 'utf8').trim().split('\n');
    ultimaLinea = (lineas[lineas.length - 1] ?? '').trim().slice(0, 110);
    edadRegistro = Math.round((Date.now() - statSync(registro).mtime.getTime()) / 60000);
  }

  totales.ok += ok; totales.mal += mal; totales.hechas += hechas;
  totales.actas += actas; totales.jornadas += jornadas;
  if (ok || mal || hechas) filas.push({ federacion, ok, mal, distintas, porTipo, actas, jornadas, hechas, enCurso, pausa, ultimaLinea, edadRegistro });
}

const fmt = (m) => [...m.entries()].map(([k, v]) => `${k}=${v}`).join(' ') || '—';
console.log(`╔═ QUÉ SE HA TRABAJADO · ventana de ${minutos} min · ${desde.toISOString()} → ${hasta.toISOString()}`);
console.log(`║  (hora local: ${desde.toLocaleTimeString('es-ES')} → ${hasta.toLocaleTimeString('es-ES')} · memoria libre ${(freemem() / 1024 ** 3).toFixed(2)} GB)`);
console.log(`╚═ federaciones con actividad en la ventana: ${filas.length}`);
for (const f of filas.sort((a, b) => b.ok - a.ok)) {
  console.log(`\n  ${f.federacion}  ·  correctas ${f.ok} · incidencias ${f.mal}${f.pausa ? ` · PAUSA hasta ${f.pausa}` : ''}`);
  console.log(`     de qué: ${fmt(f.porTipo)}`);
  console.log(`     direcciones distintas terminadas: ${f.distintas} · trabajos marcados hechos: ${f.hechas} · en curso ahora: ${f.enCurso}`);
  console.log(`     datos anotados: ${f.jornadas} jornadas · ${f.actas} actas`);
  console.log(`     ahora mismo: ${f.ultimaLinea}   (registro de hace ${f.edadRegistro} min)`);
}
console.log(`\n  TOTAL: correctas ${totales.ok} · incidencias ${totales.mal} · ${totales.hechas} trabajos hechos · ${totales.jornadas} jornadas y ${totales.actas} actas anotadas`);
console.log(`  por tipo: ${fmt(totales.porTipo)}`);
console.log(`  incidencias: ${fmt(totales.incidencias)}`);
