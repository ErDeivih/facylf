#!/usr/bin/env node
/**
 * Pone al frente de la cola los trabajos que quedaron aplazados por «la fuente no publica» y que el
 * arreglo del 13/09/2026 ya sabe resolver (jornadas de descanso y jornadas sin partidos de una
 * temporada cerrada). Sirve para que el arreglo se aplique sin esperar días.
 *
 * Sin --aplicar sólo informa.
 *
 * Uso: node scripts/adelantar-jornadas-sin-partidos.mjs <federacion> [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [fed] = process.argv.slice(2);
const aplicar = process.argv.includes('--aplicar');
const ruta = `descargas-${fed}/recolector-local/cola-v2.sqlite`;
if (!existsSync(ruta)) throw new Error(`no existe ${ruta}`);
const db = new DatabaseSync(ruta);
if (aplicar) db.exec('pragma busy_timeout=30000');

const PATRONES = [
  'la fuente no publica partidos para esta jornada',
  'la jornada ya se jugó pero la fuente aún no publica resultados',
];
const filas = [];
for (const patron of PATRONES) {
  filas.push(...db.prepare(`select clave, temporada, competicion, grupo, jornada, estado, prioridad,
      intentos, siguiente_intento from trabajos where tipo='jornada' and estado in ('pendiente','bloqueado')
      and ultimo_error = ?`).all(patron));
}
const temporadaActual = Number(db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0);
const cerradas = filas.filter((f) => Number(f.temporada) < temporadaActual);
console.log(`trabajos aplazados por «la fuente no publica partidos»: ${filas.length} · en temporadas cerradas: ${cerradas.length}`);
for (const f of cerradas.slice(0, 6)) {
  console.log(`  t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} · ${f.estado} intentos=${f.intentos} sig=${f.siguiente_intento}`);
}
if (!aplicar) { console.log('modo consulta: añade --aplicar'); db.close(); process.exit(0); }
const actualiza = db.prepare(`update trabajos set siguiente_intento=null, prioridad=0, actualizado_en=?
  where clave=?`);
const ahora = new Date().toISOString();
db.exec('begin immediate');
try {
  for (const f of cerradas) actualiza.run(ahora, f.clave);
  db.exec('commit');
} catch (error) {
  db.exec('rollback');
  throw error;
}
console.log(`adelantados ${cerradas.length} trabajos de temporadas cerradas (prioridad 0, sin espera)`);
db.close();
