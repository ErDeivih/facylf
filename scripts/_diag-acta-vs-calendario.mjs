#!/usr/bin/env node
/**
 * Medición de SÓLO LECTURA en las 18 colas: ¿la pareja de equipos que declara el ACTA coincide con la
 * pareja que el calendario (`partidos`) le cuelga a ese mismo `codigo_acta`?
 *
 * El acta es el documento del partido: nombra a los dos equipos y es relativa a ellos todo su
 * contenido (alineaciones, goles, tarjetas, cuerpo técnico). Si el calendario los nombra de otra
 * manera para el MISMO `codigo_acta`, una de las dos filas está mal y hay que saber cuánto pesa.
 *
 * Uso: node scripts/_diag-acta-vs-calendario.mjs [--detalle]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const detalle = process.argv.includes('--detalle');
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
console.log(`colas encontradas: ${colas.length}\n`);

const total = { actas: 0, comparables: 0, distintas: 0, sinFilaDePartido: 0, sinDatos: 0 };
const porFederacion = [];
const ejemplos = [];

for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  let actas = 0, comparables = 0, distintas = 0, sinFila = 0, sinDatos = 0;
  const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada, a.datos,
      p.jornada as pjornada, p.orden, p.local as plocal, p.visitante as pvisitante
    from actas a
    left join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.codigo_acta=a.codigo`).all();
  for (const f of filas) {
    actas++;
    if (!f.datos) { sinDatos++; continue; }
    if (!f.plocal) { sinFila++; continue; }
    let d;
    try { d = JSON.parse(f.datos); } catch { sinDatos++; continue; }
    const local = d?.local, visitante = d?.visitante;
    if (!local || !visitante) { sinDatos++; continue; }
    comparables++;
    const iguales = normaliza(local) === normaliza(f.plocal) && normaliza(visitante) === normaliza(f.pvisitante);
    const cruzados = normaliza(local) === normaliza(f.pvisitante) && normaliza(visitante) === normaliza(f.plocal);
    if (iguales) continue;
    distintas++;
    if (detalle && ejemplos.length < 40) {
      ejemplos.push(`${federacion} · t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} ord ${f.orden} acta ${f.codigo}\n`
        + `      calendario: ${f.plocal} vs ${f.pvisitante}\n`
        + `      acta:       ${local} vs ${visitante}${cruzados ? '  (CAMPO INVERTIDO)' : ''}`);
    }
  }
  db.close();
  total.actas += actas; total.comparables += comparables; total.distintas += distintas;
  total.sinFilaDePartido += sinFila; total.sinDatos += sinDatos;
  if (distintas || sinFila) porFederacion.push({ federacion, actas, comparables, distintas, sinFila, sinDatos });
}

console.log('federación            actas  comparables  NO COINCIDEN  acta sin fila de partido  sin datos');
for (const f of porFederacion.sort((a, b) => b.distintas - a.distintas)) {
  console.log(`${f.federacion.padEnd(20)} ${String(f.actas).padStart(6)} ${String(f.comparables).padStart(11)} ${String(f.distintas).padStart(13)} ${String(f.sinFila).padStart(25)} ${String(f.sinDatos).padStart(10)}`);
}
console.log(`\nTOTAL actas: ${total.actas} · comparables: ${total.comparables} · no coinciden: ${total.distintas}`
  + ` · acta sin fila de partido: ${total.sinFilaDePartido} · sin datos: ${total.sinDatos}`);
if (ejemplos.length) console.log(`\n--- ejemplos ---\n${ejemplos.join('\n')}`);
