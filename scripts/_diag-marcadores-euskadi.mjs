#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿cuántos de los casos incompatibles desaparecen al quitar los MARCADORES de estado?
 *
 * En Euskadi la maqueta «nova» publica el estado del equipo dentro del propio nombre: `(Sailkatua)`
 * («clasificado»), `(P)`, `(D)`. El acta, en cambio, publica el nombre limpio. Si al quitar esos
 * marcadores de los dos lados las parejas coinciden, la causa es UNA y es estructural, no 174 averías.
 *
 * Uso: node scripts/_diag-marcadores-euskadi.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Quita de un nombre los paréntesis de estado: `(sailkatua)`, `(p)`, `(d)`, `(c)`, `(r)`. */
const sinMarcadores = (nombre) => String(nombre ?? '')
  .replace(/\(\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{1,12}\s*\)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion: entrada.name.replace(/^descargas-/, ''), ruta });
}

const marcadores = new Map();
let total = 0;
let identicosSinMarcadores = 0;
let siguenDistintosTotal = 0;
const split = new Map();
const porFederacion = new Map();
const ejemplos = [];
const siguenDistintos = [];
for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada, a.datos,
      p.orden, p.local plocal, p.visitante pvisitante, p.jornada pjornada
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo
   where a.datos is not null`).all();
  for (const f of filas) {
    let d; try { d = JSON.parse(f.datos); } catch { continue; }
    if (!d?.local || !d?.visitante) continue;
    const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante), aL = normaliza(d.local), aV = normaliza(d.visitante);
    if (cL === aL && cV === aV) continue;
    if (cL === aV && cV === aL) continue;
    if (cV === aL && cL !== aL && cL !== aV) continue;
    total++;
    porFederacion.set(federacion, (porFederacion.get(federacion) ?? 0) + 1);

    // Los marcadores que aparecen en el nombre del calendario y no en el del acta.
    for (const m of String(f.plocal).matchAll(/\(([^)]{1,12})\)/g)) marcadores.set(m[0], (marcadores.get(m[0]) ?? 0) + 1);
    for (const m of String(f.pvisitante).matchAll(/\(([^)]{1,12})\)/g)) marcadores.set(m[0], (marcadores.get(m[0]) ?? 0) + 1);

    const cL2 = normaliza(sinMarcadores(f.plocal)), cV2 = normaliza(sinMarcadores(f.pvisitante));
    const aL2 = normaliza(sinMarcadores(d.local)), aV2 = normaliza(sinMarcadores(d.visitante));
    if (cL2 === aL2 && cV2 === aV2) {
      identicosSinMarcadores++;
      split.set(`${federacion}|marcadores`, (split.get(`${federacion}|marcadores`) ?? 0) + 1);
      if (ejemplos.length < 8) {
        ejemplos.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden} · acta ${f.codigo}\n`
          + `      calendario: «${f.plocal}» vs «${f.pvisitante}»\n      acta:       «${d.local}» vs «${d.visitante}»`);
      }
    } else if (siguenDistintos.length < 10) {
      siguenDistintosTotal++;
      split.set(`${federacion}|otra`, (split.get(`${federacion}|otra`) ?? 0) + 1);
      siguenDistintos.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden}\n`
        + `      calendario: «${f.plocal}» vs «${f.pvisitante}»\n      acta:       «${d.local}» vs «${d.visitante}»`);
    } else {
      siguenDistintosTotal++;
      split.set(`${federacion}|otra`, (split.get(`${federacion}|otra`) ?? 0) + 1);
    }
  }
  db.close();
}

console.log(`casos incompatibles (calendario y acta sin ningún equipo en común): ${total}`);
console.log(`\n--- qué pasa al quitar los marcadores de estado del nombre ---`);
console.log(`  quedan IDÉNTICOS .................. ${identicosSinMarcadores}`);
console.log(`  siguen distintos .................. ${siguenDistintosTotal}`);
console.log(`\n--- reparto por federación ---`);
for (const [k, n] of [...split.entries()].sort()) {
  const [fed, clase] = k.split('|');
  console.log(`  ${fed.padEnd(22)} ${clase.padEnd(12)} ${n}`);
}
console.log(`\nel calendario lleva marcas entre paréntesis (top 12):`);
for (const [m, n] of [...marcadores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${m.padEnd(16)} ${n}`);
console.log(`\n--- ejemplos que quedan IDÉNTICOS al quitar los marcadores ---\n  ${ejemplos.join('\n  ') || '(ninguno)'}`);
console.log(`\n--- ejemplos que siguen distintos ---\n  ${siguenDistintos.join('\n  ') || '(ninguno)'}`);
