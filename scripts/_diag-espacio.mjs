#!/usr/bin/env node
/**
 * ¿Cuánto ocupa cada cosa y cuánto va a ocupar lo que queda?
 *
 *  El disco es el recurso que puede agotarse en silencio: a diferencia de la CPU, cuando se llena la
 *  recolección empieza a fallar sin decir por qué. Se mide con el tamaño REAL de cada fichero
 *  guardado (`archivos.bytes`) y se proyecta con el trabajo que queda.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const porTipo = new Map();
const pendientes = new Map();
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const n = (sql) => { try { return db.prepare(sql).all(); } catch { return []; } };
  for (const t of n(`select tipo, count(*) n, sum(bytes) total, avg(bytes) media from archivos group by tipo`)) {
    const acc = porTipo.get(t.tipo) ?? { n: 0, total: 0 };
    acc.n += t.n; acc.total += t.total ?? 0;
    porTipo.set(t.tipo, acc);
  }
  for (const t of n(`select tipo, count(*) n from trabajos where estado in ('pendiente','bloqueado') group by tipo`)) {
    pendientes.set(t.tipo, (pendientes.get(t.tipo) ?? 0) + t.n);
  }
  db.close();
}

let totalGuardado = 0;
console.log('guardado hasta ahora (tamaño real de los ficheros):');
for (const [tipo, v] of [...porTipo].sort((a, b) => b[1].total - a[1].total)) {
  const media = Math.round(v.total / v.n);
  totalGuardado += v.total;
  console.log(`  ${tipo.padEnd(22)} ${String(v.n).padStart(8)} ficheros · ${String(Math.round(v.total / 1048576)).padStart(6)} MB · media ${media} B`);
}
console.log(`  TOTAL ${Math.round(totalGuardado / 1048576)} MB`);

console.log('\nproyección de lo que queda (media real por tipo × trabajos pendientes):');
let proyectado = 0;
for (const [tipo, n] of [...pendientes].sort((a, b) => b[1] - a[1])) {
  const guardado = porTipo.get(tipo) ?? porTipo.get('acta') ?? { n: 0, total: 0 };
  const media = guardado.n ? guardado.total / guardado.n : 200_000;
  const mb = (n * media) / 1048576;
  proyectado += mb;
  console.log(`  ${tipo.padEnd(22)} ${String(n).padStart(8)} pendientes × ${Math.round(media).toString().padStart(7)} B = ${Math.round(mb).toString().padStart(7)} MB`);
}
console.log(`  TOTAL proyectado ${Math.round(proyectado / 1024)} GB`);
