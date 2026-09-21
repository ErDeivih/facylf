#!/usr/bin/env node
/**
 * Control de calidad de las actas de Cataluña: ¿cuadra lo que se interpreta con lo que publica la web?
 *
 * Se compara el marcador (que viene de la propia ficha, dato independiente) con la lista de goles
 * leída. Una diferencia delata un error de interpretación, no del dato.
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const actas = db.prepare(`select codigo, jornada, datos, calidad, archivo from actas where estado='hecha'`).all();
let cuadran = 0; let descuadran = 0; let sinMarcador = 0; let titularesRaros = 0;
const ejemplos = [];
for (const a of actas) {
  let d;
  try { d = JSON.parse(a.datos); } catch { continue; }
  const porLado = { local: 0, visitante: 0 };
  for (const g of d.goles ?? []) {
    if (g.tipo !== 'propia-puerta') porLado[g.lado] = (porLado[g.lado] ?? 0) + 1;
    else porLado[g.lado === 'local' ? 'visitante' : 'local'] += 1;
  }
  const marcador = [d.golesLocal, d.golesVisitante];
  if (marcador[0] === null || marcador[1] === null) { sinMarcador += 1; continue; }
  if (marcador[0] === porLado.local && marcador[1] === porLado.visitante) cuadran += 1;
  else {
    descuadran += 1;
    if (ejemplos.length < 5) ejemplos.push(`${a.codigo} J${a.jornada}: marcador ${marcador.join('-')}, goles leídos ${porLado.local}-${porLado.visitante}`);
  }
  const titulares = (d.lineups?.local?.titulares?.length ?? 0) + (d.lineups?.visitante?.titulares?.length ?? 0);
  if (titulares !== 22) titularesRaros += 1;
}
console.log(`actas analizadas: ${actas.length}`);
console.log(`  marcador y goles cuadran: ${cuadran}`);
console.log(`  descuadran: ${descuadran}`);
console.log(`  sin marcador: ${sinMarcador}`);
console.log(`  con titulares distintos de 22: ${titularesRaros}`);
if (ejemplos.length) { console.log('  ejemplos:'); for (const e of ejemplos) console.log(`    ${e}`); }
console.log('\nreparto por estado:', JSON.stringify(db.prepare('select calidad, count(*) n from actas group by calidad').all()));
console.log('eventos por tipo:', JSON.stringify(db.prepare('select tipo, count(*) n from eventos_acta group by tipo').all()));
console.log('participaciones por condición:', JSON.stringify(db.prepare('select condicion, count(*) n from participaciones group by condicion').all()));
db.close();
