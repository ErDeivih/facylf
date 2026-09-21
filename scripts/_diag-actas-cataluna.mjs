#!/usr/bin/env node
/** Comprueba la coherencia de las actas capturadas: marcador, goles por lado y alineaciones. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const a of db.prepare(`select codigo, jornada, estado, calidad, archivo, datos from actas where estado='hecha' order by codigo`).all()) {
  const datos = JSON.parse(a.datos);
  const goles = datos.goles ?? [];
  const porLado = goles.reduce((m, g) => ({ ...m, [g.lado]: (m[g.lado] ?? 0) + 1 }), {});
  console.log(`\nacta ${a.codigo} · J${a.jornada} · ${a.calidad} · ${a.archivo}`);
  console.log(`  marcador ${datos.golesLocal}-${datos.golesVisitante} · goles leídos ${goles.length} ` +
    `(local ${porLado.local ?? 0}, visitante ${porLado.visitante ?? 0}) · tipos ${JSON.stringify([...new Set(goles.map((g) => g.tipo))])}`);
  console.log(`  titulares L/V: ${datos.lineups.local.titulares.length}/${datos.lineups.visitante.titulares.length}` +
    ` · suplentes L/V: ${datos.lineups.local.suplentes.length}/${datos.lineups.visitante.suplentes.length}` +
    ` · portero L/V: ${JSON.stringify([datos.lineups.local.portero, datos.lineups.visitante.portero])}`);
  console.log(`  tarjetas ${(datos.tarjetas ?? []).length} · cambios ${(datos.cambios ?? []).length} · técnicos ${(datos.tecnicos ?? []).length}`);
  console.log(`  primeros goles: ${JSON.stringify(goles.slice(0, 3))}`);
  console.log(`  técnicos: ${JSON.stringify((datos.tecnicos ?? []).slice(0, 3))}`);
}
console.log('\nresumen global:');
console.log('  personas:', db.prepare('select count(*) n from personas').get().n);
console.log('  participaciones:', db.prepare('select count(*) n from participaciones').get().n);
console.log('  eventos_acta:', db.prepare('select count(*) n from eventos_acta').get().n);
console.log('  tecnicos_acta:', db.prepare('select count(*) n from tecnicos_acta').get().n);
console.log('  por tipo de evento:', JSON.stringify(db.prepare('select tipo, count(*) n from eventos_acta group by tipo').all()));
console.log('  partidos con marcador:', db.prepare('select count(*) n from partidos where goles_local is not null').get().n);
console.log('  partidos con árbitro:', db.prepare('select count(*) n from partidos where arbitro is not null').get().n);
db.close();
