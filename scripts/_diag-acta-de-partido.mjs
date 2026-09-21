#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿a qué partido pertenece realmente un acta?
 *
 * Cruza la fila de `partidos` de la cola con lo que dice la propia acta archivada (equipos y
 * marcador) y con las participaciones guardadas. Es la comprobación que decide si el error está en
 * la página de jornada o en la fila del calendario.
 *
 * Uso: node scripts/_diag-acta-de-partido.mjs <acta> [temporada] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parseaActa } from '../packages/ingesta/dist/src/parsers/acta.js';

const [acta, temporada = '20', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const fila = db.prepare(`select jornada, orden, local, visitante, goles_local, goles_visitante, codigo_acta
  from partidos where temporada=? and competicion=? and grupo=? and codigo_acta=?`).get(temporada, competicion, grupo, acta);
console.log('fila de partidos:', JSON.stringify(fila));

const a = db.prepare(`select codigo, jornada, estado, calidad, archivo, hash from actas
  where temporada=? and competicion=? and grupo=? and codigo=?`).get(temporada, competicion, grupo, acta);
console.log('fila de actas:   ', JSON.stringify(a));

if (a?.archivo) {
  const candidatas = [a.archivo, `${a.archivo}.gz`, a.archivo.replace(/\.gz$/, '')];
  const existente = candidatas.find((r) => existsSync(r));
  if (existente) {
    const html = /\.gz$/i.test(existente) ? gunzipSync(readFileSync(existente)).toString('utf8') : readFileSync(existente, 'utf8');
    const p = parseaActa(html);
    console.log(`\nacta archivada (${existente}):`);
    console.log(`  equipos:   «${p.local ?? p.equipoLocal ?? '?'}» vs «${p.visitante ?? p.equipoVisitante ?? '?'}»`);
    console.log(`  marcador:  ${p.golesLocal ?? '?'} - ${p.golesVisitante ?? '?'}`);
    console.log(`  claves del parseo: ${Object.keys(p).join(', ')}`);
    const t = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    for (const nombre of ['Almaz', 'Villaralbo', 'Burgos']) {
      const i = t.indexOf(nombre);
      console.log(`  «${nombre}» en el texto visible: ${i < 0 ? 'NO APARECE' : `offset ${i}: …${t.slice(Math.max(0, i - 120), i + 60)}…`}`);
    }
  } else {
    console.log(`\nno hay HTML archivado para el acta (${a.archivo})`);
  }
}

console.log('\nparticipaciones guardadas (equipos distintos citados por el acta):');
for (const r of db.prepare(`select lado, count(*) n from participaciones
    where temporada=? and competicion=? and grupo=? and acta=? group by lado`).all(temporada, competicion, grupo, acta)) {
  console.log(`  ${r.lado}: ${r.n}`);
}
console.log('\ntécnicos guardados:');
for (const r of db.prepare(`select lado, rol, nombre from tecnicos_acta
    where temporada=? and competicion=? and grupo=? and acta=? order by lado, rol limit 8`).all(temporada, competicion, grupo, acta)) {
  console.log(`  ${r.lado} · ${r.rol} · ${r.nombre}`);
}
db.close();
