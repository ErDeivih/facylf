#!/usr/bin/env node
/** ¿Por qué falla la reinterpretación de las actas guardadas? */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const actas = db.prepare(`select codigo,temporada,competicion,grupo,jornada,menores,archivo,version_parser
  from actas where estado='hecha' limit 3`).all();
for (const a of actas) {
  console.log(`\nacta ${a.codigo} · v${a.version_parser} · ${a.archivo}`);
  try {
    const texto = readFileSync(a.archivo, 'utf8');
    console.log(`  fichero ${texto.length} B`);
    const doc = JSON.parse(texto.replace(/^\uFEFF/, ''));
    console.log(`  claves: ${Object.keys(doc).join(', ')}`);
    console.log(`  equipos: ${JSON.stringify(doc.equipos)} · secciones: ${doc.secciones?.length} · marcador: ${JSON.stringify(doc.marcador)}`);
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
  }
}
db.close();
