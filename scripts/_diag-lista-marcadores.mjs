#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿qué lista CERRADA de marcadores cierra los 174 casos de Euskadi?
 *
 * La lista no puede ser «cualquier paréntesis»: `(Juv.)`, `(Femenino)` y `(VETERANOS)` identifican al
 * equipo (su categoría o su género) y quitarlos fusionaría al equipo femenino con el masculino del
 * mismo club. Se prueban tres listas y se mide cuántos de los 174 casos cierra cada una, y qué casos
 * quedan fuera con su evidencia.
 *
 * Uso: node scripts/_diag-lista-marcadores.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Estados: describen la situación del equipo, no quién es. Medidos, en las dos lenguas del corpus. */
const ESTADOS = ['(sailkatua)', '(irabazlea)', '(ganador)', '(clasificado)'];
/** Categoría y género: identifican al equipo. NO se quitan nunca. */
const IDENTIFICAN = ['(juv.)', '(femenino)', '(veteranos)'];
/** Ambiguos: se registran y no se tocan. */
const AMBIGUOS = ['(p)', '(ret)', '(c)', '(d)'];

const quita = (nombre, lista) => {
  let salida = String(nombre ?? '');
  for (const m of lista) {
    // Sólo el token exacto entre paréntesis, y sólo al principio o al final del nombre.
    const literal = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\s*${literal}\\s*|\\s*${literal}\\s*$`, 'gi');
    salida = salida.replace(re, ' ');
  }
  return salida.replace(/\s+/g, ' ').trim();
};

const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion: entrada.name.replace(/^descargas-/, ''), ruta });
}

const listas = {
  'sólo estados (4)': ESTADOS,
  'estados + ambiguos': [...ESTADOS, ...AMBIGUOS],
  'estados + ambiguos + identifican': [...ESTADOS, ...AMBIGUOS, ...IDENTIFICAN],
};
const cierres = new Map(Object.keys(listas).map((k) => [k, 0]));
let total = 0;
const residuales = [];
const porMarcador = new Map();

for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.datos,
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
    const marcas = [...String(f.plocal).matchAll(/\([^()]{1,20}\)/g), ...String(f.pvisitante).matchAll(/\([^()]{1,20}\)/g)]
      .map((m) => m[0].toLowerCase());
    porMarcador.set(marcas.join('+'), (porMarcador.get(marcas.join('+')) ?? 0) + 1);
    for (const [nombre, lista] of Object.entries(listas)) {
      const ok = normaliza(quita(f.plocal, lista)) === normaliza(quita(d.local, lista))
        && normaliza(quita(f.pvisitante, lista)) === normaliza(quita(d.visitante, lista));
      if (ok) cierres.set(nombre, cierres.get(nombre) + 1);
    }
    // Residual con la lista más estricta (sólo estados).
    const cierraEstricta = normaliza(quita(f.plocal, ESTADOS)) === normaliza(quita(d.local, ESTADOS))
      && normaliza(quita(f.pvisitante, ESTADOS)) === normaliza(quita(d.visitante, ESTADOS));
    if (!cierraEstricta && residuales.length < 25) {
      residuales.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden} · acta ${f.codigo}\n`
        + `      calendario: «${f.plocal}» vs «${f.pvisitante}»\n      acta:       «${d.local}» vs «${d.visitante}»`);
    }
  }
  db.close();
}

console.log(`casos incompatibles: ${total}\n`);
console.log('--- cuántos cierra cada lista ---');
for (const [k, v] of cierres) console.log(`  ${k.padEnd(34)} ${v} de ${total}`);
console.log(`\n--- combinaciones de marcadores que aparecen en los nombres del calendario ---`);
for (const [k, v] of [...porMarcador.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${(k || '(sin marcadores)').padEnd(40)} ${v}`);
console.log(`\n--- casos que la lista estricta NO cierra (${residuales.length} mostrados) ---`);
for (const r of residuales) console.log(`  ${r}`);
