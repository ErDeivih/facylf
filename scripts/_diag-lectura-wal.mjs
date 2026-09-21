// ¿La cola en modo WAL da la misma lectura abierta de sólo lectura que abierta de lectura/escritura?
//
// Si no la da, las copias que se hacen con `copiar-cola.mjs` (conexión de sólo lectura + API de backup)
// pueden estar viendo el estado del ÚLTIMO checkpoint y no el de la cola, sin ningún error: una copia que
// parece completa y le faltan las transacciones que sólo están en el `-wal`. Eso convertiría en
// "diferencias contra el HTML" lo que en realidad es desfase de evidencia.
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
if (!ruta) { console.error('uso: node scripts/_diag-lectura-wal.mjs <cola.sqlite>'); process.exit(2); }

const CONSULTAS = [
  ['partidos', 'select count(*) n from partidos'],
  ['partidos · sello más reciente', 'select max(actualizado_en) n from partidos'],
  ['jornadas comprobadas hoy', `select count(*) n from jornadas where comprobada_en >= date('now') || 'T00'`],
  ['jornadas · sello más reciente', 'select max(comprobada_en) n from jornadas'],
  ['trabajos · actualizado más reciente', 'select max(actualizado_en) n from trabajos'],
  ['equipos', 'select count(*) n from equipos'],
];

function mide(etiqueta, opciones) {
  let db;
  try {
    db = new DatabaseSync(ruta, opciones);
  } catch (e) {
    console.log(`  ${etiqueta.padEnd(22)} no se pudo abrir: ${e.code ?? e.message}`);
    return;
  }
  try {
    console.log(`  ${etiqueta}`);
    console.log(`    journal_mode = ${db.prepare('pragma journal_mode').get().journal_mode} · ` +
      `wal_autocheckpoint = ${db.prepare('pragma wal_autocheckpoint').get().wal_autocheckpoint}`);
    for (const [nombre, sql] of CONSULTAS) {
      try { console.log(`    ${nombre.padEnd(38)} ${db.prepare(sql).get().n ?? '·null·'}`); }
      catch (e) { console.log(`    ${nombre.padEnd(38)} ERROR ${e.message}`); }
    }
  } finally { db.close(); }
}

console.log(`cola: ${ruta}`);
mide('sólo lectura', { readOnly: true });
mide('lectura/escritura', { readOnly: false, timeout: 15000 });
