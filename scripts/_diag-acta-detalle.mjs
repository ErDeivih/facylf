#!/usr/bin/env node
/** Vuelca lo que se guardó de un acta concreta: marcador, secciones de goles y filas crudas. */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo } from './lib/recolector-local.mjs';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const codigo of process.argv.slice(3)) {
  const a = db.prepare('select codigo, jornada, datos, archivo from actas where codigo=?').get(codigo);
  if (!a) { console.log(`${codigo}: no está`); continue; }
  console.log(`\n########## acta ${a.codigo} J${a.jornada} · ${a.archivo}`);
  const d = JSON.parse(a.datos);
  console.log(`  marcador interpretado: ${d.golesLocal}-${d.golesVisitante}`);
  console.log(`  goles interpretados: ${JSON.stringify((d.goles ?? []).map((g) => `${g.minuto}' ${g.lado} ${g.jugador}`))}`);
  const crudo = JSON.parse(leeArchivo(a.archivo).toString('utf8'));
  console.log(`  equipos: ${JSON.stringify(crudo.equipos)} · marcador de la ficha: ${JSON.stringify(crudo.marcador)}`);
  for (const s of crudo.secciones ?? []) {
    if (!/gol/i.test(s.titulo)) continue;
    console.log(`  sección «${s.titulo}» (${s.filas.length} filas):`);
    for (const f of s.filas) console.log(`    texto=${JSON.stringify(f.texto)} imagenes=${JSON.stringify(f.imagenes)} minutos=${JSON.stringify(f.minutos)}`);
  }
}
db.close();

