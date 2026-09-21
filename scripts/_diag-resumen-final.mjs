#!/usr/bin/env node
/** Resumen de datos por federación, para la foto final. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
for (const [etiqueta, dir] of [['Madrid', 'descargas-madrid'], ['Cataluña', 'descargas-cataluna'],
  ['Baleares', 'descargas-baleares']]) {
  const db = new DatabaseSync(join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
  const n = (sql) => { try { return db.prepare(sql).get().n; } catch { return null; } };
  console.log(`${etiqueta}:`);
  console.log(`  competiciones ${n('select count(*) n from competiciones')} · grupos ${n('select count(*) n from grupos')}` +
    ` · jornadas ${n('select count(*) n from jornadas')} · partidos ${n('select count(*) n from partidos')}`);
  console.log(`  equipos ${n('select count(*) n from equipos')} · personas ${n('select count(*) n from personas')}` +
    ` · participaciones ${n('select count(*) n from participaciones')} · eventos ${n('select count(*) n from eventos_acta')}` +
    ` · técnicos ${n('select count(*) n from tecnicos_acta')}`);
  console.log(`  actas: ${n("select count(*) n from actas where estado='hecha'")} hechas de ${n('select count(*) n from actas')}` +
    ` (${n("select count(*) n from actas where calidad='revisar'")} en revisión) · partidos con resultado ${n('select count(*) n from partidos where goles_local is not null')}`);
  db.close();
}
