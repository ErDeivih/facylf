#!/usr/bin/env node
/**
 * Medición de SÓLO LECTURA, categorizada: qué forma tiene cada desacuerdo entre el calendario y el acta.
 *
 * Formas posibles, para el MISMO `codigo_acta`:
 *   · fuga      → calendario (X, L) frente a acta (L, V). El equipo que descansa en esa jornada se
 *                 coló como `local` del partido siguiente, el `local` verdadero pasó a `visitante` y
 *                 el `visitante` verdadero se perdió. X no juega ningún otro partido de esa jornada.
 *   · invertido → calendario (V, L) frente a acta (L, V): sólo el campo está cambiado.
 *   · otro      → cualquier otra combinación.
 *
 * Uso: node scripts/_diag-forma-desacuerdo.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const normaliza = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const colas = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const ruta = join(raiz, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (existsSync(ruta)) colas.push({ federacion: entrada.name.replace(/^descargas-/, ''), ruta });
}

const cuenta = new Map();
const ejemplosFuga = [];
const ejemplosOtro = [];
let totalComparables = 0;

for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada, a.datos,
      p.jornada as pjornada, p.orden, p.local as plocal, p.visitante as pvisitante
    from actas a
    join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo
   where a.datos is not null`).all();

  // Para comprobar que el equipo «fugado» no juega ningún otro partido de la jornada.
  const porGrupoJornada = new Map();
  for (const p of db.prepare('select temporada, competicion, grupo, jornada, local, visitante from partidos').all()) {
    const clave = `${p.temporada}|${p.competicion}|${p.grupo}|${p.jornada}`;
    if (!porGrupoJornada.has(clave)) porGrupoJornada.set(clave, []);
    porGrupoJornada.get(clave).push(p);
  }

  for (const f of filas) {
    let d;
    try { d = JSON.parse(f.datos); } catch { continue; }
    const localActa = d?.local, visitanteActa = d?.visitante;
    if (!localActa || !visitanteActa) continue;
    totalComparables++;
    const cL = normaliza(f.plocal), cV = normaliza(f.pvisitante);
    const aL = normaliza(localActa), aV = normaliza(visitanteActa);
    if (cL === aL && cV === aV) continue;

    let forma;
    if (cV === aL && cL !== aV) forma = 'fuga';
    else if (cL === aV && cV === aL) forma = 'invertido';
    else forma = 'otro';

    if (forma === 'fuga') {
      // ¿El equipo que el calendario pone como local juega algo más en esa jornada?
      const deLaJornada = porGrupoJornada.get(`${f.temporada}|${f.competicion}|${f.grupo}|${f.pjornada}`) ?? [];
      const otros = deLaJornada.filter((p) => !(normaliza(p.local) === cL && normaliza(p.visitante) === cV)
        && !(normaliza(p.local) === cV && normaliza(p.visitante) === cL) === false);
      const aparece = deLaJornada.filter((p) => p !== undefined && (normaliza(p.local) === cL || normaliza(p.visitante) === cL))
        .filter((p) => !(normaliza(p.local) === cL && normaliza(p.visitante) === cV));
      if (aparece.length === 0) forma = 'fuga (el local fantasma no juega nada más esa jornada)';
      void otros;
    }

    if (!cuenta.has(forma)) cuenta.set(forma, new Map());
    const porFed = cuenta.get(forma);
    porFed.set(federacion, (porFed.get(federacion) ?? 0) + 1);

    if (forma.startsWith('fuga') && ejemplosFuga.length < 6) {
      ejemplosFuga.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden} · acta ${f.codigo}\n`
        + `      calendario: ${f.plocal} vs ${f.pvisitante}\n      acta:       ${localActa} vs ${visitanteActa}`);
    }
    if (forma === 'otro' && ejemplosOtro.length < 6) {
      ejemplosOtro.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden} · acta ${f.codigo}\n`
        + `      calendario: ${f.plocal} vs ${f.pvisitante}\n      acta:       ${localActa} vs ${visitanteActa}`);
    }
  }
  db.close();
}

console.log(`actas comparables (con datos y fila de partido): ${totalComparables}\n`);
let suma = 0;
for (const [forma, porFed] of [...cuenta.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
  const n = [...porFed.values()].reduce((a, b) => a + b, 0);
  suma += n;
  console.log(`${forma}: ${n}`);
  for (const [fed, k] of [...porFed.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${fed.padEnd(20)} ${k}`);
}
console.log(`\ntotal de desacuerdos: ${suma}`);
if (ejemplosFuga.length) console.log(`\n--- ejemplos de fuga ---\n${ejemplosFuga.join('\n')}`);
if (ejemplosOtro.length) console.log(`\n--- ejemplos de «otro» ---\n${ejemplosOtro.join('\n')}`);
