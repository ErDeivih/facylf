#!/usr/bin/env node
/**
 * Cuenta, por federación y para un día dado, cuántas sesiones terminaron con cada código de salida.
 * Sirve para detectar caídas del recolector (código distinto de 0) sin leer todos los registros.
 *
 * Uso: node scripts/_diag-sesiones.mjs [fecha YYYY-MM-DD]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const fecha = process.argv[2] ?? new Date().toISOString().slice(0, 10);
console.log(`Sesiones del ${fecha} por federación (código de salida)`);
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/worker-programado.log`;
  if (!existsSync(ruta)) continue;
  const texto = readFileSync(ruta, 'utf8');
  const codigos = new Map();
  let sesiones = 0;
  for (const l of texto.split('\n')) {
    if (!l.trimStart().startsWith(`${fecha} `)) continue;
    const m = /El worker termino con codigo (-?\d+)/.exec(l);
    if (m) { sesiones++; codigos.set(m[1], (codigos.get(m[1]) ?? 0) + 1); }
  }
  if (sesiones) console.log(`  ${d.replace('descargas-', '').padEnd(21)} ${String(sesiones).padStart(4)} sesiones · ${[...codigos.entries()].map(([k, v]) => `codigo ${k}: ${v}`).join(' · ')}`);
}
