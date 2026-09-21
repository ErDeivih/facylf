#!/usr/bin/env node
/** SÓLO LECTURA: ¿guarda la acta el desempate por penaltis, o `(P)` es su único rastro en la cola? */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const db = new DatabaseSync(join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante,
    goles_local gl, goles_visitante gv from partidos where local like '%(P)%' or visitante like '%(P)%'`).all();
console.log(`filas con (P): ${filas.length}`);

const claves = new Map();
let conActa = 0;
let conClavePenaltis = 0;
const ejemplos = [];
for (const f of filas) {
  if (!f.codigo_acta) continue;
  const a = db.prepare('select datos from actas where codigo=? and temporada=? and competicion=? and grupo=?')
    .get(f.codigo_acta, f.temporada, f.competicion, f.grupo);
  if (!a?.datos) continue;
  conActa += 1;
  let d; try { d = JSON.parse(a.datos); } catch { continue; }
  for (const k of Object.keys(d)) claves.set(k, (claves.get(k) ?? 0) + 1);
  const sospechosas = Object.entries(d).filter(([k, v]) =>
    /penal|zigor|desempate|prorroga|prórroga|tanda|shootout/i.test(k) || /penal|zigor/i.test(String(v)));
  if (sospechosas.length) {
    conClavePenaltis += 1;
    if (ejemplos.length < 6) ejemplos.push({ f, sospechosas });
  }
}
console.log(`con acta leída: ${conActa} · con alguna clave o valor que mencione penaltis: ${conClavePenaltis}`);
console.log('\nclaves presentes en las actas de esas filas:');
for (const [k, n] of [...claves.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${n}`);
console.log('\nejemplos con mención de penaltis:');
for (const e of ejemplos) {
  console.log(`  t${e.f.temporada} g${e.f.grupo} J${e.f.jornada} acta ${e.f.codigo_acta} · fila ${e.f.gl}-${e.f.gv}`);
  for (const [k, v] of e.sospechosas) console.log(`      ${k} = ${JSON.stringify(v).slice(0, 120)}`);
}

// Y el marcador: ¿la fila de la cola es un empate? Un desempate por penaltis tiene que venir de un empate.
const conMarcador = filas.filter((f) => f.gl !== null && f.gv !== null);
console.log(`\nfilas con marcador: ${conMarcador.length} · de ellas empatadas: ${conMarcador.filter((f) => f.gl === f.gv).length}`);
console.log('  (una tanda de penaltis sólo puede venir de un empate, así que las NO empatadas son la pista de que el marcador de la cola no es el de la tanda)');
db.close();
