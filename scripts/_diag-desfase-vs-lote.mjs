// Cruza la evidencia desfasada con lo que un lote ya aplicado tocó.
//
// La reconstrucción compara las filas de la COLA contra el HTML ARCHIVADO, pero el que reescribe el HTML
// en el sitio es el worker: la copia de la cola es una foto y el HTML sigue vivo. Si el HTML cambió
// después de esa foto, las diferencias que encuentre la herramienta no son defectos del extractor, son
// desfase de evidencia — y una corrección o una retirada derivada de ahí no está sostenida.
//
// Este diagnóstico dice, para una copia y un manifiesto ya aplicado, si alguna de las jornadas con
// evidencia desfasada tiene cambios o retiradas dentro. Sólo lee.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const raiz = process.argv[2];
const manifiesto = process.argv[3];
if (!raiz || !manifiesto) {
  console.error('uso: node scripts/_diag-desfase-vs-lote.mjs <raiz-datos> <manifiesto.json>');
  process.exit(2);
}

function huella(ruta) {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    const t = /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
    return createHash('sha256').update(t).digest('hex');
  }
  return null;
}

const rutaCola = `${raiz.replace(/[\\/]+$/, '')}/descargas-euskadi/recolector-local/cola-v2.sqlite`;
const db = new DatabaseSync(rutaCola, { readOnly: true });
const desfasadas = new Map();
try {
  for (const j of db.prepare('select competicion, grupo, numero, archivo, hash, comprobada_en from jornadas where archivo is not null').iterate()) {
    const h = huella(j.archivo);
    if (!h || h === j.hash) continue;
    desfasadas.set(`${j.competicion}/${j.grupo}/${j.numero}`, { ...j, disco: h });
  }
} finally { db.close(); }

const doc = JSON.parse(readFileSync(manifiesto, 'utf8'));
const jornadas = doc.jornadas ?? [];
console.log(`cola ${rutaCola}`);
console.log(`jornadas con evidencia desfasada: ${desfasadas.size}`);
console.log(`manifiesto ${manifiesto} · id ${doc.id ?? '(sin id)'} · ${jornadas.length} jornadas`);

let conCambios = 0, conRetiradas = 0, filasCambiadas = 0, filasRetiradas = 0;
for (const j of jornadas) {
  const clave = `${j.competicion}/${j.grupo}/${j.numero}`;
  if (!desfasadas.has(clave)) continue;
  const c = j.cambios?.length ?? 0;
  const r = j.retiradas?.length ?? 0;
  if (!c && !r) continue;
  if (c) { conCambios++; filasCambiadas += c; }
  if (r) { conRetiradas++; filasRetiradas += r; }
  console.log(`  ${clave} · cambios ${c} · retiradas ${r}`);
}
console.log(`\nfilas cambiadas en jornadas desfasadas: ${filasCambiadas} en ${conCambios} jornadas`);
console.log(`filas retiradas en jornadas desfasadas: ${filasRetiradas} en ${conRetiradas} jornadas`);

const totalCambios = jornadas.reduce((s, j) => s + (j.cambios?.length ?? 0), 0);
const totalRetiradas = jornadas.reduce((s, j) => s + (j.retiradas?.length ?? 0), 0);
console.log(`total del lote: ${totalCambios} cambios · ${totalRetiradas} retiradas`);
