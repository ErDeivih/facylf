/*
 * Diagnóstico de las filas AMBIGUAS de un manifiesto, con su contexto.
 *
 * Una ambigua publicada sin su jornada no se puede comprobar: hay que ver la fila de la cola, la que el
 * HTML publica en esa posición y las de al lado, porque el defecto típico de esta herramienta es un
 * DESPLAZAMIENTO de una posición y sólo se ve mirando la vecindad.
 *
 * Uso:  npx tsx scripts/_diag-ambigua.mjs <manifiesto.json> [--html]
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: _diag-ambigua.mjs <manifiesto.json> [--html]');
  process.exit(1);
}
const conHtml = process.argv.includes('--html');
const manifiesto = JSON.parse(readFileSync(ruta, 'utf8'));

for (const j of manifiesto.jornadas) {
  if (!j.ambiguos?.length) continue;
  console.log(`\nt${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} · ${j.archivo}`);
  console.log(`  filas en la cola: ${j.filas} · comparables: ${j.filas - (j.filasFantasma?.length ?? 0)}`
    + ` · idénticas: ${j.identicas} · correcciones: ${j.cambios.length} · ambiguas: ${j.ambiguos.length}`);
  for (const a of j.ambiguos) {
    console.log(`  ord ${a.orden} [${a.motivo}]`);
    console.log(`      cola: ${a.actual}`);
    console.log(`      html: ${a.html}`);
    console.log(`      vías: local ${a.vias.local} · visitante ${a.vias.visitante}`);
    if (a.marcadores_fuera_de_posicion?.length) console.log(`      marcadores fuera de posición: ${a.marcadores_fuera_de_posicion.join(', ')}`);
    if (a.marcadores_desconocidos?.length) console.log(`      marcadores desconocidos: ${a.marcadores_desconocidos.join(', ')}`);
  }
  if (conHtml && j.archivo) {
    const html = readFileSync(j.archivo, 'utf8');
    // Las parejas que el HTML publica, en orden, para ver si la de la cola está desplazada.
    const filas = [...html.matchAll(/<a[^>]+href="[^"]*NFG_VisEquipos[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (let k = 0; k + 1 < filas.length; k += 2) console.log(`      HTML ${k / 2}: ${filas[k]} vs ${filas[k + 1]}`);
  }
}
const total = manifiesto.jornadas.reduce((n, j) => n + (j.ambiguos?.length ?? 0), 0);
console.log(`\ntotal de ambiguas: ${total}`);
