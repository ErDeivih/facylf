#!/usr/bin/env node
/**
 * Grupos que nunca podrán publicarse porque tienen una jornada que la fuente no publica.
 * Separa lo que es "todavía no publicado" (temporada en curso) de lo que ya no va a aparecer.
 */
import { DatabaseSync } from 'node:sqlite';

const rutaDb = process.argv[2];
const db = new DatabaseSync(rutaDb, { readOnly: true });
const ahora = new Date().toISOString();
const filas = db.prepare(`select tipo, ultimo_error, temporada, competicion, grupo, count(*) n,
    min(intentos) mini, max(intentos) maxi
  from trabajos where estado in ('pendiente','bloqueado') and ultimo_error is not null
  group by tipo, ultimo_error, temporada, competicion, grupo`).all();
const porMotivo = new Map();
for (const f of filas) {
  const clave = `${f.tipo} · ${f.ultimo_error}`;
  const actual = porMotivo.get(clave) ?? { grupos: 0, trabajos: 0, temporadas: new Set(), mini: 9, maxi: 0 };
  actual.grupos += 1;
  actual.trabajos += f.n;
  actual.temporadas.add(f.temporada);
  actual.mini = Math.min(actual.mini, f.mini);
  actual.maxi = Math.max(actual.maxi, f.maxi);
  porMotivo.set(clave, actual);
}
console.log(`== ${rutaDb} (${ahora})`);
for (const [motivo, d] of [...porMotivo.entries()].sort((a, b) => b[1].grupos - a[1].grupos).slice(0, 10)) {
  const temps = [...d.temporadas].sort().join(',');
  console.log(`  ${String(d.grupos).padStart(5)} grupos · ${String(d.trabajos).padStart(5)} trabajos · intentos ${d.mini}-${d.maxi} · t${temps}`);
  console.log(`        ${motivo.slice(0, 120)}`);
}
db.close();
