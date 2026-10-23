#!/usr/bin/env node
/*
 * QUÉ HA ENTRADO Y QUÉ NO, LEÍDO DEL REGISTRO DE LA IMPORTACIÓN MASIVA.
 *
 * `scripts/importar-todo.mts` deja una línea por grupo en `pruebas/reconstruccion/importacion-todo.jsonl`.
 * Ese fichero es la memoria del trabajo —es lo que permite reanudar— y también la respuesta a «¿qué falta?».
 * Esto lo resume: cuántos han entrado, cuántos no, agrupados por federación, por temporada y **por motivo**.
 *
 * El agrupado por motivo es lo que sirve de verdad: 200 fallos con 200 causas distintas es un problema
 * distinto de 200 fallos con 5 causas, y la segunda se arregla.
 *
 * Uso:
 *   node scripts/resumen-importacion.mjs
 *   node scripts/resumen-importacion.mjs --federacion cataluna
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRO = join(RAIZ, 'pruebas', 'reconstruccion', 'importacion-todo.jsonl');

const argumentos = process.argv.slice(2);
const iFederacion = argumentos.indexOf('--federacion');
const filtroFederacion = iFederacion >= 0 ? argumentos[iFederacion + 1] : null;

if (!existsSync(REGISTRO)) {
  console.error(`No hay registro de importación en ${REGISTRO}. Lánzala con \`pnpm importar:todo\`.`);
  process.exit(1);
}

/** Un motivo se agrupa por su principio, quitando los números y las rutas: «R1: la posición…». */
const familia = (motivo) => String(motivo)
  .replace(/[A-Z]:\\[^\s]+/g, '<ruta>')
  .replace(/\d+/g, 'N')
  .slice(0, 90)
  .trim();

const porFederacion = new Map();
const porTemporada = new Map();
const motivos = new Map();
const fallos = [];

/*
 * ── SE CUENTA EL ÚLTIMO INTENTO DE CADA GRUPO, NO TODOS ───────────────────────────────────────────────
 *
 * El registro es un DIARIO DE INTENTOS, no una foto del estado: un grupo que falló por la mañana y entró
 * por la tarde aparece dos veces. Contando todas las líneas, los fallos ya arreglados siguen saliendo como
 * fallos para siempre y el resumen miente. Pasó el 24/09/2026: se leían «547 fallidos» cuando buena parte
 * eran intentos viejos de grupos que después entraron bien.
 *
 * Se queda la ÚLTIMA entrada de cada (federación, temporada, grupo), que es lo que de verdad se sabe hoy.
 */
const ultimoPorGrupo = new Map();
let totalLineas = 0;
for (const linea of readFileSync(REGISTRO, 'utf8').split('\n')) {
  if (linea.trim() === '') continue;
  let r;
  try { r = JSON.parse(linea); } catch { continue; }   // una línea a medias de un corte no invalida el resto
  if (filtroFederacion && r.federacion !== filtroFederacion) continue;
  totalLineas += 1;
  ultimoPorGrupo.set(`${r.federacion}|${r.etiqueta}|${r.grupo}`, r);
}

let ok = 0;
let total = 0;
for (const r of ultimoPorGrupo.values()) {
  total += 1;
  if (r.ok === true) {
    ok += 1;
    porFederacion.set(r.federacion, { ok: (porFederacion.get(r.federacion)?.ok ?? 0) + 1, fallos: porFederacion.get(r.federacion)?.fallos ?? 0 });
    porTemporada.set(r.etiqueta, (porTemporada.get(r.etiqueta) ?? 0) + 1);
  } else {
    porFederacion.set(r.federacion, { ok: porFederacion.get(r.federacion)?.ok ?? 0, fallos: (porFederacion.get(r.federacion)?.fallos ?? 0) + 1 });
    const f = familia(r.motivo);
    motivos.set(f, (motivos.get(f) ?? 0) + 1);
    fallos.push(r);
  }
}

const porcentaje = (n) => (total === 0 ? '0' : ((n / total) * 100).toFixed(1));

console.log(`último intento de cada grupo: ${total} grupo(s)${filtroFederacion ? ` de ${filtroFederacion}` : ''} · `
  + `${ok} importados (${porcentaje(ok)} %) · ${fallos.length} fallidos (${porcentaje(fallos.length)} %)`);
console.log(`(el registro acumula ${totalLineas} intentos; un grupo puede aparecer varias veces)`);

console.log('\npor federación:');
for (const [f, c] of [...porFederacion].sort((a, b) => (b[1].ok + b[1].fallos) - (a[1].ok + a[1].fallos))) {
  const suyos = c.ok + c.fallos;
  console.log(`  ${f.padEnd(20)} ok ${String(c.ok).padStart(5)} · fallos ${String(c.fallos).padStart(5)}  (${((c.fallos / suyos) * 100).toFixed(0)} % de ${suyos})`);
}

console.log('\npor temporada:');
for (const [t, n] of [...porTemporada].sort((a, b) => b[1] - a[1])) console.log(`  ${t}  ${String(n).padStart(5)}`);

if (motivos.size > 0) {
  console.log(`\nfallos agrupados por motivo (${motivos.size} causas distintas):`);
  for (const [m, n] of [...motivos].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(5)} × ${m}`);
}
