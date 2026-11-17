/*
 * El marcador del acta manda sobre el de la jornada.
 *
 * Caso real (David, 17/11/2026): la federación publica en la jornada el resultado del descanso. Si el
 * partido va 1-0 al descanso y acaba 2-1, la web estaba sirviendo el 1-0 porque la corrección desde el
 * acta sólo actuaba cuando el marcador guardado estaba vacío o en 0-0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { corrigeMarcadorDesdeActa } from './recolector-local.mjs';

function base({ golesPartido = [1, 0], datosActa = { golesLocal: 2, golesVisitante: 1 } }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    create table actas (temporada text, competicion text, grupo text, jornada text, codigo text, datos text);
    create table partidos (temporada text, competicion text, grupo text, jornada text, codigo_acta text, goles_local integer, goles_visitante integer);
    create table eventos_acta (temporada text, competicion text, grupo text, jornada text, acta text, tipo text, lado text, subtipo text, lado_beneficiado text);
  `);
  db.prepare('insert into partidos values (?,?,?,?,?,?,?)').run('22', 'c', 'g', '7', 'a1', golesPartido[0], golesPartido[1]);
  if (datosActa) db.prepare('insert into actas values (?,?,?,?,?,?)').run('22', 'c', 'g', '7', 'a1', JSON.stringify(datosActa));
  return db;
}

const ref = { temporada: '22', competicion: 'c', grupo: 'g', jornada: '7', acta: 'a1' };

test('un resultado provisional de la jornada se corrige con el final del acta', () => {
  const db = base({ golesPartido: [1, 0], datosActa: { golesLocal: 2, golesVisitante: 1 } });
  corrigeMarcadorDesdeActa(db, ref);
  const p = db.prepare('select goles_local l, goles_visitante v from partidos').get();
  assert.deepEqual({ l: p.l, v: p.v }, { l: 2, v: 1 });
});

test('si el acta no trae marcador en la cabecera, no se toca el de la jornada', () => {
  const db = base({ golesPartido: [1, 0], datosActa: { eventos: [] } });
  corrigeMarcadorDesdeActa(db, ref);
  const p = db.prepare('select goles_local l from partidos').get();
  assert.equal(p.l, 1);
});

test('sin acta guardada no se toca nada', () => {
  const db = base({ golesPartido: [1, 0], datosActa: null });
  assert.equal(corrigeMarcadorDesdeActa(db, ref), 0);
  assert.equal(db.prepare('select goles_local l from partidos').get().l, 1);
});
