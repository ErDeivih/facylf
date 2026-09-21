#!/usr/bin/env node
/**
 * Comprueba, pidiendo unas pocas fichas reales, si las actas cuyo HTML se perdió tenían datos.
 * Es una prueba de 5 peticiones espaciadas: sólo sirve para saber si hay que volver a bajarlas.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { inspeccionaActa } from './lib/recolector-local.mjs';

const rutaDb = process.argv[2];
const cuantas = Number(process.argv[3] ?? 5);
const db = new DatabaseSync(rutaDb, { readOnly: true });

const filas = db.prepare(`select codigo, temporada, competicion, grupo, jornada, archivo
  from actas where archivo like '%.html.gz' and estado='hecha' order by random() limit 60`).all();
const sospechosas = [];
for (const f of filas) {
  if (!existsSync(f.archivo)) continue;
  const cab = readFileSync(f.archivo).subarray(0, 2);
  if (cab[0] === 0x1f && cab[1] === 0x8b) continue; // es gzip de verdad
  sospechosas.push(f);
  if (sospechosas.length >= cuantas) break;
}
console.log(`fichas dudosas encontradas: ${sospechosas.length} (de ${filas.length} revisadas)`);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [i, s] of sospechosas.entries()) {
  const peticion = db.prepare(`select url from peticiones where trabajo like ? order by id desc limit 1`)
    .get(`acta|%|%|%|${s.jornada}|${s.codigo}`);
  if (!peticion) { console.log(`  ${s.codigo}: sin URL registrada`); continue; }
  process.stdout.write(`  ${s.codigo} (J${s.jornada}) … `);
  try {
    const respuesta = await fetch(peticion.url, {
      headers: {
        'user-agent': 'FACyLF/1.0 (+recoleccion responsable; contacto en recolector.config.json)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(30_000),
    });
    const html = await respuesta.text();
    const d = inspeccionaActa(html);
    console.log(`HTTP ${respuesta.status} · ${html.length} B · jugadores=${d.jugadores} conNombre=${d.conNombre} goles=${d.goles} cambios=${d.cambios} tarjetas=${d.tarjetas}`);
  } catch (error) {
    console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (i < sospechosas.length - 1) await espera(4000);
}
db.close();
