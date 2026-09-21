#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo } from './lib/recolector-local.mjs';

const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const codigo of process.argv.slice(3)) {
  const acta = db.prepare('select codigo,archivo,datos from actas where codigo=? limit 1').get(codigo);
  if (!acta) { console.log(`${codigo}: no encontrada`); continue; }
  const crudo = JSON.parse(leeArchivo(acta.archivo).toString('utf8'));
  const normalizado = JSON.parse(acta.datos ?? '{}');
  console.log(`\n${codigo}: ${acta.archivo}`);
  console.log(`normalizado: ${normalizado.lineups?.local?.titulares?.length ?? 0}+${normalizado.lineups?.visitante?.titulares?.length ?? 0} titulares; `
    + `${normalizado.lineups?.local?.suplentes?.length ?? 0}+${normalizado.lineups?.visitante?.suplentes?.length ?? 0} suplentes`);
  for (const lado of ['local', 'visitante']) {
    const jugadores = crudo[`jugadores_equipo_${lado}`] ?? [];
    console.log(`${lado} (${jugadores.length}):`);
    console.log(jugadores.slice(0, 20).map((j) => ({
      nombre: j.nombre_visible ?? j.nombre_jugador ?? j.nombre_real,
      dorsal: j.dorsal, titular: j.titular, suplente: j.suplente,
      juega: j.juega, alineacion: j.alineacion, condicion: j.condicion,
    })));
  }
}
db.close();
