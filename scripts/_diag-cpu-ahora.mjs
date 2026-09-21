#!/usr/bin/env node
/**
 * Quién está consumiendo CPU AHORA: compara el tiempo de proceso entre dos muestras y ordena por
 * diferencia. Sirve para saber si el freno son los recolectores o las demás aplicaciones del equipo.
 *
 * Uso: node scripts/_diag-cpu-ahora.mjs [segundos] [cuantos]
 */
import { execFileSync } from 'node:child_process';

const segundos = Number(process.argv[2] ?? 8);
const cuantos = Number(process.argv[3] ?? 18);
const ps = `Get-Process | Where-Object { $_.CPU -ne $null } | Select-Object Id,ProcessName,CPU,@{n='MB';e={[int]($_.WorkingSet64/1MB)}} | ConvertTo-Json -Compress`;
const leer = () => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const primera = leer();
await new Promise((r) => setTimeout(r, segundos * 1000));
const segunda = leer();
const antes = new Map(primera.map((p) => [p.Id, p]));
const filas = [];
for (const p of segunda) {
  const a = antes.get(p.Id);
  if (!a) continue;
  const delta = Number(p.CPU ?? 0) - Number(a.CPU ?? 0);
  if (delta > 0) filas.push({ id: p.Id, nombre: p.ProcessName, uso: (delta / segundos) * 100, mb: p.MB });
}
filas.sort((x, y) => y.uso - x.uso);
const nucleos = (await import('node:os')).cpus().length;
console.log(`muestra de ${segundos} s · ${nucleos} núcleos lógicos · uso en % de UN núcleo`);
for (const f of filas.slice(0, cuantos)) {
  console.log(`  ${String(f.uso.toFixed(0)).padStart(4)} %  ${f.nombre.padEnd(22)} pid ${String(f.id).padStart(6)}  ${String(f.mb).padStart(6)} MB`);
}
const porNombre = new Map();
for (const f of filas) porNombre.set(f.nombre, (porNombre.get(f.nombre) ?? 0) + f.uso);
console.log('\nsuma por aplicación:');
for (const [nombre, uso] of [...porNombre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(uso.toFixed(0)).padStart(5)} %  ${nombre}`);
}
