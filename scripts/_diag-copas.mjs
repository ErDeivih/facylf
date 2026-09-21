#!/usr/bin/env node
/**
 * Para cada competición que tiene grupos sin índice de jornadas: cuántos grupos tiene en total,
 * cuántos SÍ consiguieron índice y cuántos no. Si dentro de la misma competición unos sí y otros no,
 * el problema es de extracción (parser); si no lo consigue ninguno, la competición no se publica por
 * jornadas y hay que tratarla aparte.
 *
 * Uso: node scripts/_diag-copas.mjs <ruta-cola> [filtro-nombre]
 */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, filtro] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });

const bloqueados = db.prepare(`select distinct competicion from trabajos
  where estado in ('pendiente','bloqueado') and tipo='indice_jornadas'
    and ultimo_error like '%no se pudo descubrir el índice%'`).all().map((f) => f.competicion);

console.log(`competiciones con índice sin descubrir: ${bloqueados.length}`);
let copaOk = 0; let copaNo = 0; let ligaParcial = 0;
for (const competicion of bloqueados) {
  const c = db.prepare(`select nombre from competiciones where codigo=? limit 1`).get(competicion) ?? {};
  const nombre = c.nombre ?? '?';
  if (filtro && !new RegExp(filtro, 'i').test(nombre)) continue;
  const total = db.prepare(`select count(*) n from grupos where competicion=?`).get(competicion).n;
  const conIndice = db.prepare(`select count(*) n from grupos where competicion=? and jornadas > 0`).get(competicion).n;
  const sinIndice = total - conIndice;
  const partidos = db.prepare(`select count(*) n from partidos where competicion=?`).get(competicion).n;
  const jornadas = db.prepare(`select count(*) n from jornadas where competicion=?`).get(competicion).n;
  const etiqueta = conIndice === 0 ? 'SIN NINGÚN ÍNDICE' : conIndice < total ? 'PARCIAL (parser)' : 'todos con índice';
  if (conIndice === 0) copaNo++; else if (conIndice < total) ligaParcial++; else copaOk++;
  console.log(`  c${competicion} [${etiqueta}] grupos ${total} (con índice ${conIndice}, sin ${sinIndice}) · jornadas ${jornadas} · partidos ${partidos}`);
  console.log(`      ${nombre}`);
}
console.log(`\nresumen: ${copaNo} competiciones sin ningún índice · ${ligaParcial} parciales (mirar parser) · ${copaOk} con todos los índices`);
db.close();
