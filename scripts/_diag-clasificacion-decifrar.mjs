#!/usr/bin/env node
/**
 * ¿Qué significan los números de la tabla de clasificación de la FCF?
 *
 *  La web de la federación pinta celdas como «1515» o «98», que no se pueden interpretar a ojo. Aquí
 *  se calcula la clasificación real desde los partidos ya descargados de ese grupo y se compara con
 *  lo que trae la tabla, para deducir a qué corresponde cada celda.
 */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const RAIZ = resolve(import.meta.dirname, '..');
const [temporada, competicion, grupo] = process.argv.slice(2);
const db = new DatabaseSync(join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const equipos = new Map();
for (const p of db.prepare(`select local, visitante, goles_local gl, goles_visitante gv from partidos
  where temporada=? and competicion=? and grupo=? and goles_local is not null`).all(temporada, competicion, grupo)) {
  for (const [nombre, gf, gc] of [[p.local, p.gl, p.gv], [p.visitante, p.gv, p.gl]]) {
    const t = equipos.get(nombre) ?? { j: 0, g: 0, e: 0, p: 0, f: 0, c: 0, pts: 0 };
    t.j += 1; t.f += gf; t.c += gc;
    if (gf > gc) { t.g += 1; t.pts += 3; } else if (gf === gc) { t.e += 1; t.pts += 1; } else { t.p += 1; }
    equipos.set(nombre, t);
  }
}
console.log('calculado desde los partidos descargados:');
for (const [nombre, t] of [...equipos].sort((a, b) => b[1].pts - a[1].pts).slice(0, 4)) {
  console.log(`  ${nombre.padEnd(32)} J=${t.j} G=${t.g} E=${t.e} P=${t.p} F=${t.f} C=${t.c} pts=${t.pts}`);
}
console.log('  partidos con resultado:', db.prepare(`select count(*) n from partidos where temporada=? and competicion=? and grupo=? and goles_local is not null`).get(temporada, competicion, grupo).n);

const ruta = join(RAIZ, 'descargas-cataluna', `t${temporada}-2025-26`, `comp-${competicion}`, `grupo-${grupo}`, 'clasificacion.json');
try {
  const doc = JSON.parse(readFileSync(ruta, 'utf8'));
  console.log('\ntabla guardada de la federación (primeras 4 filas):');
  for (const fila of (doc.filas ?? []).slice(0, 4)) console.log('  ' + JSON.stringify(fila.slice(0, 9)));
} catch (error) { console.log('no se pudo leer la clasificación guardada:', error.message); }
db.close();
