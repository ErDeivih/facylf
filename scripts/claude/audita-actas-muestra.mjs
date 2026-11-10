/**
 * Audita una muestra de actas recién recogidas de una temporada (por defecto 2018-19): si el JSON parsea, si los
 * goles cuadran con el marcador, cuántos titulares trae cada equipo y si falta el árbitro. Solo lee la cola.
 *
 * Uso: node tmp/audita-actas-2018-19.mjs [temporada] [muestra]
 */
import { DatabaseSync } from 'node:sqlite';
const ETIQUETA = process.argv[2] ?? '2018-19';
const MUESTRA = Number(process.argv[3] ?? 50);

const db = new DatabaseSync('E:/facylf-datos/descargas-federacion/recolector-local/cola-v2.sqlite', { readOnly: true, timeout: 20000 });
const codigo = db.prepare('select codigo from temporadas where etiqueta = ?').get(ETIQUETA)?.codigo;
if (!codigo) { console.error(`la cola no conoce ${ETIQUETA}`); process.exit(1); }

const filas = db.prepare("select codigo, datos, calidad from actas where temporada = ? and estado = 'hecha' order by comprobada_en desc limit ?").all(String(codigo), MUESTRA);
let parseMal = 0, golesMal = 0, sinArbitro = 0, titularesCortos = 0, sinLineups = 0;
const ejemplos = [];
for (const f of filas) {
  let d;
  try { d = JSON.parse(f.datos); } catch { parseMal += 1; continue; }
  const gl = Number(d.golesLocal), gv = Number(d.golesVisitante);
  const goles = Array.isArray(d.goles) ? d.goles.length : -1;
  if (Number.isFinite(gl) && Number.isFinite(gv) && goles >= 0 && goles !== gl + gv) {
    golesMal += 1;
    if (ejemplos.length < 3) ejemplos.push(`${d.local} ${d.golesLocal}-${d.golesVisitante} ${d.visitante}: goles ${goles}, marcador ${gl + gv}`);
  }
  const arb = d.arbitro;
  if (arb == null || String(arb).trim() === '' || String(arb).trim() === 'null') sinArbitro += 1;
  const lin = d.lineups;
  if (!lin || !lin.local || !lin.visitante) sinLineups += 1;
  else {
    const titulares = (equipo) => (Array.isArray(equipo) ? equipo : (equipo.titulares ?? [])).length;
    if (titulares(lin.local) < 11 || titulares(lin.visitante) < 11) titularesCortos += 1;
  }
}
const n = filas.length;
console.log(`muestra de ${n} actas de ${ETIQUETA} (código ${codigo})`);
console.log(`  JSON que no parsea: ${parseMal}`);
console.log(`  goles que no cuadran con el marcador: ${golesMal}`);
console.log(`  sin árbitro: ${sinArbitro} (${n ? Math.round((sinArbitro / n) * 100) : 0} %)`);
console.log(`  sin alineaciones: ${sinLineups}`);
console.log(`  con menos de 11 titulares en algún equipo: ${titularesCortos}`);
if (ejemplos.length) console.log('  ejemplos de descuadre:\n    ' + ejemplos.join('\n    '));
db.close();
