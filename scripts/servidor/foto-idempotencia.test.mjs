/*
 * Prueba de `foto-idempotencia.mjs`: se monta una cola SQLite mínima (trabajos, peticiones, actas, jornadas)
 * y se comprueba que la foto cuenta bien los estados y que **no escribe nada** en la cola.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const GUION = resolve(dirname(fileURLToPath(import.meta.url)), 'foto-idempotencia.mjs');

function colaDeEjemplo() {
  const base = mkdtempSync(join(tmpdir(), 'foto-'));
  const ruta = join(base, 'cola-v2.sqlite');
  const db = new DatabaseSync(ruta);
  db.exec(`
    create table trabajos (clave text primary key, tipo text, estado text, actualizado_en text);
    create table peticiones (id integer primary key, url text, creada_en text);
    create table actas (id integer primary key);
    create table jornadas (id integer primary key);
  `);
  const inserta = db.prepare('insert into trabajos values (?, ?, ?, ?)');
  inserta.run('a', 'acta', 'hecho', '2026-11-16T10:00:00Z');
  inserta.run('b', 'acta', 'hecho', '2026-11-16T17:19:00Z');
  inserta.run('c', 'acta', 'pendiente', null);
  inserta.run('d', 'jornada', 'pendiente', null);
  inserta.run('e', 'acta', 'en_curso', null);
  inserta.run('f', 'acta', 'cancelado', null);
  db.exec("insert into peticiones (url, creada_en) values ('u1','2026-11-16T17:00:00Z'), ('u2','2026-11-16T17:10:00Z')");
  db.exec('insert into actas (id) values (1),(2),(3)');
  db.exec('insert into jornadas (id) values (1)');
  db.close();
  return ruta;
}

test('cuenta los estados, las peticiones y la última actualización', () => {
  const ruta = colaDeEjemplo();
  const r = spawnSync(process.execPath, [GUION, ruta, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const foto = JSON.parse(r.stdout);
  assert.deepEqual(foto.trabajos, { hecho: 2, pendiente: 2, en_curso: 1, cancelado: 1 });
  assert.equal(foto.peticiones, 2);
  assert.equal(foto.actas, 3);
  assert.equal(foto.jornadas, 1);
  assert.equal(foto.ultima_actualizacion, '2026-11-16T17:19:00Z');
});

test('la foto no modifica la cola', () => {
  const ruta = colaDeEjemplo();
  const antes = (() => {
    const db = new DatabaseSync(ruta, { readOnly: true });
    const n = db.prepare('select count(*) n from trabajos').get().n;
    const estados = db.prepare('select estado, count(*) n from trabajos group by estado order by estado').all();
    db.close();
    return JSON.stringify({ n, estados });
  })();
  spawnSync(process.execPath, [GUION, ruta, '--json'], { encoding: 'utf8' });
  const db = new DatabaseSync(ruta, { readOnly: true });
  const n = db.prepare('select count(*) n from trabajos').get().n;
  const estados = db.prepare('select estado, count(*) n from trabajos group by estado order by estado').all();
  db.close();
  assert.equal(JSON.stringify({ n, estados }), antes);
});

test('si la cola no existe, falla con mensaje claro', () => {
  const r = spawnSync(process.execPath, [GUION, join(tmpdir(), 'no-existe-jamas.sqlite'), '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no existe|No existe/);
});
