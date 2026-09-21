// ¿Cuántas jornadas de una cola tienen el HTML archivado en un estado DISTINTO del que la cola registró?
//
// La evidencia de la reconstrucción es el HTML archivado, pero quien escribe ese archivo es el worker, y
// lo reescribe EN EL SITIO cada vez que vuelve a comprobar la jornada. Si el HTML cambió después de que la
// cola escribiera sus filas, la reconstrucción compararía filas viejas contra un HTML nuevo: las
// diferencias que encontraría no serían defectos del extractor, serían desfase de evidencia.
//
// `jornadas.hash` guarda el sha256 del contenido que el worker leyó cuando escribió esas filas, así que la
// comprobación es directa. Sólo lee.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const raiz = process.argv[2] ?? '.';
const muestra = Number(process.argv[3] ?? 10);

function huella(ruta) {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    const t = /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
    return { sha: createHash('sha256').update(t).digest('hex'), ruta: r, mtime: statSync(r).mtime };
  }
  return null;
}

const federaciones = ['aragon', 'cantabria', 'castilla-la-mancha', 'castilla-y-leon', 'cataluna', 'ceuta',
  'euskadi', 'galicia', 'madrid', 'murcia', 'navarra', 'rioja', 'valencia'];

for (const fed of federaciones) {
  const ruta = join(raiz, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  let total = 0, desfasadas = 0, ausentes = 0, sinHash = 0;
  const ejemplos = [];
  try {
    for (const j of db.prepare('select temporada, competicion, grupo, numero, archivo, hash, comprobada_en from jornadas where archivo is not null').iterate()) {
      total++;
      if (!j.hash) { sinHash++; continue; }
      const f = huella(j.archivo);
      if (!f) { ausentes++; continue; }
      if (f.sha === j.hash) continue;
      desfasadas++;
      if (ejemplos.length < muestra) {
        ejemplos.push({ j: `${j.temporada}/${j.competicion}/${j.grupo}/J${j.numero}`, cola: j.hash.slice(0, 12), disco: f.sha.slice(0, 12), html: f.mtime, comprobada: j.comprobada_en });
      }
    }
  } finally { db.close(); }
  console.log(`\n=== ${fed} · ${total} jornadas con archivo`);
  console.log(`  desfasadas (el HTML del disco no es el que la cola registró): ${desfasadas}`);
  console.log(`  sin hash en la cola: ${sinHash} · archivo ausente: ${ausentes}`);
  for (const e of ejemplos) console.log(`    ${e.j} · cola ${e.cola}… · disco ${e.disco}… · html ${e.html.toISOString()} · comprobada ${e.comprobada}`);
}
