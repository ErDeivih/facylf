// Comprobación LOCAL del extractor de Euskadi con el HTML ARCHIVADO, sin forzar ninguna petición.
//
// El worker de Euskadi no está corriendo (su tarea programada vuelve el 2026-09-17 06:05) y su último
// trabajo fue a las 09:18Z, así que no se puede observar «una petición posterior al reinicio». Lo que sí se
// puede hacer —y es la alternativa que el propio encargo prevé para este caso— es cargar el MISMO módulo
// que carga el worker y pasarle el HTML que ya tiene archivado, para ver qué devuelve hoy el código nuevo.
//
// Uso: npx tsx scripts/_verifica-extractor-euskadi.mjs [raiz-datos] [n-jornadas]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { extraePartidosWidget, extraeFilasInformativas } from './lib/recolector-local.mjs';

const raiz = process.argv[2] ?? '.';
const cuantas = Number(process.argv[3] ?? 40);
const rutaCola = `${raiz.replace(/[\\/]+$/, '')}/descargas-euskadi/recolector-local/cola-v2.sqlite`;

/** El vocabulario de la maqueta, tal y como lo declara el extractor. */
const DESCANDO = ['descansa', 'atsedena'];
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const esDescanso = (t) => DESCANDO.includes(norm(t));

const db = new DatabaseSync(rutaCola, { readOnly: true });
// Las jornadas que la cola tiene como fantasma: son las que el extractor DEBE dejar de emitir.
const conFantasma = db.prepare(`select distinct j.temporada, j.competicion, j.grupo, j.numero, j.archivo
  from jornadas j join partidos p on p.temporada=j.temporada and p.competicion=j.competicion
    and p.grupo=j.grupo and p.jornada=j.numero
  where (lower(trim(p.local)) in ('descansa','atsedena','descans')
      or lower(trim(p.visitante)) in ('descansa','atsedena','descans')) and j.archivo is not null
  limit ?`).all(cuantas);
const total = db.prepare(`select count(1) n from partidos where lower(trim(local)) in ('descansa','atsedena','descans')
  or lower(trim(visitante)) in ('descansa','atsedena','descans')`).get().n;
db.close();

let emitidos = 0;
let emitidosDeDescanso = 0;
let informativas = 0;
let sospechosas = 0;
let sinArchivo = 0;
const ejemplos = [];

for (const j of conFantasma) {
  let contenido = null;
  for (const r of [j.archivo, `${j.archivo}.gz`, j.archivo.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    contenido = /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
    break;
  }
  if (!contenido) { sinArchivo++; continue; }
  const partidos = extraePartidosWidget(contenido);
  emitidos += partidos.length;
  for (const p of partidos) {
    if (!esDescanso(p.local) && !esDescanso(p.visitante)) continue;
    emitidosDeDescanso++;
    if (ejemplos.length < 5) ejemplos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: «${p.local} vs ${p.visitante}»`);
  }
  const filas = extraeFilasInformativas(contenido);
  for (const f of filas) {
    if (f.informativa) informativas++;
    if (f.sospechosa) sospechosas++;
  }
}

console.log(`extractor de Euskadi (extraePartidosWidget) sobre HTML ARCHIVADO · ${conFantasma.length} jornadas con descanso en la cola`);
console.log(`  jornadas sin HTML legible ....... ${sinArchivo}`);
console.log(`  partidos emitidos ............... ${emitidos}`);
console.log(`  EMITIDOS CON PALABRA DE DESCANSO  ${emitidosDeDescanso}   <- tiene que ser 0`);
console.log(`  bloques informativos (no se emiten)  ${informativas}`);
console.log(`  bloques sospechosos (traen acta) .... ${sospechosas}`);
for (const e of ejemplos) console.log(`    ${e}`);
console.log(`\n  filas de descanso que la cola tiene hoy: ${total} (la reparación es un lote aparte, no esto)`);
