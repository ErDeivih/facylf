#!/usr/bin/env node
/**
 * SÓLO LECTURA: vocabulario y POSICIÓN de los marcadores de estado en los nombres de la cola.
 *
 * Es lo que fija la regla de la fase 2: qué marcadores se quitan, dónde están y cuáles no se conocen.
 * Se miden TODOS los paréntesis de todos los nombres de equipo de las 18 colas, con su posición
 * (principio, medio o final) y cuántas veces apparaen. Un paréntesis que no esté en esta lista no se
 * toca: se registra.
 *
 * Uso: node scripts/_diag-marcadores-vocabulario.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion: entrada.name.replace(/^descargas-/, ''), ruta });
}

/** posición de cada paréntesis dentro del nombre */
const posiciones = new Map();
const cuentas = new Map();
const porFederacion = new Map();
let nombres = 0, conParentesis = 0, parentesis = 0;
const ejemplos = new Map();

for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const vistos = new Set();
  for (const p of db.prepare('select local, visitante from partidos').all()) {
    for (const nombre of [p.local, p.visitante]) {
      if (!nombre || vistos.has(nombre)) continue;
      vistos.add(nombre);
      nombres++;
      if (!nombre.includes('(')) continue;
      conParentesis++;
      const marcas = [...nombre.matchAll(/\(([^()]{1,20})\)/g)];
      for (const m of marcas) {
        parentesis++;
        const token = m[0];
        const antes = nombre.slice(0, m.index).trim();
        const despues = nombre.slice(m.index + token.length).trim();
        const posicion = antes === '' ? 'principio' : (despues === '' ? 'final' : 'medio');
        const clave = `${token}`;
        if (!posiciones.has(clave)) posiciones.set(clave, new Map());
        posiciones.get(clave).set(posicion, (posiciones.get(clave).get(posicion) ?? 0) + 1);
        cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1);
        const kf = `${federacion}`;
        porFederacion.set(kf, (porFederacion.get(kf) ?? 0) + 1);
        if (!ejemplos.has(clave)) ejemplos.set(clave, []);
        if (ejemplos.get(clave).length < 3) ejemplos.get(clave).push(`${federacion}: «${nombre}»`);
      }
    }
  }
  db.close();
}

console.log(`nombres distintos en las 18 colas: ${nombres} · con paréntesis: ${conParentesis} (${(100 * conParentesis / nombres).toFixed(2)} %)`);
console.log(`paréntesis totales: ${parentesis}\n`);
console.log('token                 veces   posiciones                              ejemplos');
for (const [token, n] of [...cuentas.entries()].sort((a, b) => b[1] - a[1])) {
  const pos = [...posiciones.get(token).entries()].map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`${token.padEnd(20)} ${String(n).padStart(6)}   ${pos.padEnd(38)} ${(ejemplos.get(token) ?? []).slice(0, 2).join(' · ')}`);
}
console.log(`\n--- por federación ---`);
for (const [f, n] of [...porFederacion.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(22)} ${n}`);
