import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { corrigeMarcadorDesdeActa, corrigeMarcadoresDesdeActas, marcadorConGolesDeActa } from './recolector-local.mjs';

function base() {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table metadatos(clave text primary key, valor text);
    create table partidos(temporada text, competicion text, grupo text, jornada integer, orden integer, codigo_acta text,
      goles_local integer, goles_visitante integer);
    create table eventos_acta(temporada text, competicion text, grupo text, jornada integer, acta text, orden integer,
      tipo text, lado text, lado_beneficiado text, subtipo text);`);
  const p = db.prepare('insert into partidos values (?,?,?,?,?,?,?,?)');
  p.run('9', 'c', 'g', 1, 0, 'A1', 0, 0);       // 0-0 falso: el acta trae 3-1
  p.run('9', 'c', 'g', 1, 1, 'A2', 0, 0);       // 0-0 de verdad: el acta no tiene goles
  p.run('9', 'c', 'g', 1, 2, 'A3', 2, 1);       // resultado publicado: no se toca
  p.run('9', 'c', 'g', 1, 3, 'A4', null, null); // sin resultado y con goles en el acta
  p.run('9', 'c', 'g', 1, 4, 'A5', 0, 0);       // un gol sin equipo: no se calcula
  const e = db.prepare('insert into eventos_acta values (?,?,?,?,?,?,?,?,?,?)');
  let o = 0;
  for (const [acta, lado, ben] of [['A1', 'local', 'local'], ['A1', 'local', 'local'], ['A1', 'visitante', 'local'],
    ['A1', 'visitante', 'visitante'], ['A3', 'local', 'local'], ['A4', 'visitante', 'visitante'], ['A5', null, null]]) {
    e.run('9', 'c', 'g', 1, acta, o++, 'gol', lado, ben, null);
  }
  e.run('9', 'c', 'g', 1, 'A2', o++, 'amarilla', 'local', null, null);
  // Eventos viejos sin `lado_beneficiado`: el gol en propia del visitante suma al local.
  p.run('9', 'c', 'g', 1, 5, 'A6', 0, 0);
  e.run('9', 'c', 'g', 1, 'A6', o++, 'gol', 'visitante', null, 'propia-puerta');
  e.run('9', 'c', 'g', 1, 'A6', o++, 'gol', 'local', null, 'normal');
  return db;
}
const marcador = (db, acta) => db.prepare('select goles_local l, goles_visitante v from partidos where codigo_acta=?').get(acta);

test('el 0-0 de la jornada se calcula con los goles del acta (la propia puerta suma al rival)', () => {
  const db = base();
  const ref = { temporada: '9', competicion: 'c', grupo: 'g', jornada: 1 };
  assert.deepEqual(marcadorConGolesDeActa(db, { ...ref, acta: 'A1' }, 0, 0), { golesLocal: 3, golesVisitante: 1, calculado: true });
  assert.deepEqual(marcadorConGolesDeActa(db, { ...ref, acta: 'A2' }, 0, 0), { golesLocal: 0, golesVisitante: 0, calculado: false });
  assert.deepEqual(marcadorConGolesDeActa(db, { ...ref, acta: 'A3' }, 2, 1).calculado, false);
  assert.deepEqual(marcadorConGolesDeActa(db, { ...ref, acta: 'A4' }, null, null), { golesLocal: 0, golesVisitante: 1, calculado: true });
  assert.equal(marcadorConGolesDeActa(db, { ...ref, acta: 'A5' }, 0, 0).calculado, false);
  assert.equal(corrigeMarcadorDesdeActa(db, { ...ref, acta: 'A1' }), 1);
  assert.deepEqual({ ...marcador(db, 'A1') }, { l: 3, v: 1 });
});

test('la corrección de lo guardado va una vez y no toca los 0-0 de verdad ni los resultados publicados', () => {
  const db = base();
  assert.equal(corrigeMarcadoresDesdeActas(db), 3); // A1, A4 y A6
  assert.deepEqual({ ...marcador(db, 'A6') }, { l: 2, v: 0 });
  assert.equal(corrigeMarcadoresDesdeActas(db), 0);
  assert.deepEqual({ ...marcador(db, 'A2') }, { l: 0, v: 0 });
  assert.deepEqual({ ...marcador(db, 'A3') }, { l: 2, v: 1 });
  assert.deepEqual({ ...marcador(db, 'A4') }, { l: 0, v: 1 });
  assert.deepEqual({ ...marcador(db, 'A5') }, { l: 0, v: 0 });
});
