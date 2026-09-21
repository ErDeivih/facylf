#!/usr/bin/env node
/**
 * Busca fichas que SÍ traen datos en el HTML archivado pero siguen sin analizar: serían un fallo del
 * parser, no una ausencia de la fuente. Mira una muestra de las actas pendientes de cada federación.
 *
 * Uso: node scripts/_diag-fichas-con-datos-sin-analizar.mjs [muestra-por-federacion]
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';
import { leeArchivo, inspeccionaActa } from './lib/recolector-local.mjs';

const muestra = Number(process.argv[2] ?? 120);
let totalRevisadas = 0;
let totalConDatos = 0;
const ejemplos = [];
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select codigo, temporada, competicion, grupo, jornada, archivo, incidencias
    from actas where estado='pendiente' and archivo is not null order by random() limit ?`).all(muestra);
  let conDatos = 0;
  for (const f of filas) {
    const html = leeArchivo(f.archivo)?.toString('utf8') ?? '';
    if (!html) continue;
    totalRevisadas++;
    const i = inspeccionaActa(html);
    if (Number(i.jugadores ?? 0) > 0 || Number(i.goles ?? 0) > 0) {
      conDatos++;
      totalConDatos++;
      if (ejemplos.length < 12) ejemplos.push({ fed: d.replace('descargas-', ''), ...f, jugadores: i.jugadores, conNombre: i.conNombre, goles: i.goles });
    }
  }
  if (filas.length) console.log(`${d.replace('descargas-', '').padEnd(21)} revisadas ${String(filas.length).padStart(4)} · con datos sin analizar ${conDatos}`);
  db.close();
}
console.log(`\nTOTAL revisadas ${totalRevisadas} · con datos sin analizar ${totalConDatos}`);
for (const e of ejemplos) {
  console.log(`  ${e.fed} t${e.temporada} c${e.competicion} g${e.grupo} J${e.jornada} acta=${e.codigo} · jugadores=${e.jugadores} conNombre=${e.conNombre} goles=${e.goles} · ${e.incidencias}`);
}
