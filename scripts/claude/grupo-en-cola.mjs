/*
 * grupo-en-cola.mjs — SÓLO LEE. Para un grupo de la cola SQLite de una federación, enseña jornada a jornada
 * los partidos, el resultado, el estado del acta y cuándo se comprobó. Sirve para saber qué máquina tiene
 * la última jornada antes de generar un informe.
 *
 * Uso: node scripts/claude/grupo-en-cola.mjs <cola-v2.sqlite> <codigo-grupo> [texto-equipo]
 */
import { DatabaseSync } from 'node:sqlite';
const [, , ruta, grupo, texto] = process.argv;
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const g = db.prepare('select * from grupos where codigo = ?').all(grupo);
console.log('grupo:', JSON.stringify(g));
const filas = db.prepare(`select p.jornada, p.fecha, p.hora, p.local, p.visitante, p.goles_local gl, p.goles_visitante gv,
    p.codigo_acta, a.estado, a.comprobada_en, length(a.datos) bytes
  from partidos p left join actas a on a.temporada = p.temporada and a.competicion = p.competicion
   and a.grupo = p.grupo and a.jornada = p.jornada and a.codigo = p.codigo_acta
  where p.grupo = ? order by p.jornada, p.orden`).all(grupo);
const porJ = new Map();
for (const f of filas) { if (!porJ.has(f.jornada)) porJ.set(f.jornada, []); porJ.get(f.jornada).push(f); }
for (const [j, fs] of porJ) {
  const hechas = fs.filter((f) => f.estado === 'hecha').length;
  const fecha = fs.map((f) => f.fecha).filter(Boolean).sort()[0] ?? '—';
  if (j > 6 && !texto) continue;
  console.log(`J${j} ${fecha} · partidos ${fs.length} · con resultado ${fs.filter((f) => f.gl != null).length} · actas hechas ${hechas}`);
  for (const f of fs) {
    if (texto && !`${f.local} ${f.visitante}`.toUpperCase().includes(texto.toUpperCase()) && j > 6) continue;
    console.log(`   ${f.fecha ?? ''} ${f.local} ${f.gl ?? '-'}-${f.gv ?? '-'} ${f.visitante} · acta ${f.codigo_acta ?? '—'} ${f.estado ?? ''} ${f.comprobada_en ?? ''} ${f.bytes ?? ''}`);
  }
}
const j = db.prepare(`select * from jornadas where grupo = ? order by 1,2,3,4 limit 40`).all(grupo);
console.log('jornadas (tabla):', j.length, JSON.stringify(j.slice(0, 5)));
db.close();
