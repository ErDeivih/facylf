import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  esCompeticionDeFinalDeTemporada, esperaSinPublicar, preparaRachaSinPublicar, unoDeAbrilDeLaTemporada,
} from './espera-publicacion.mjs';

const AHORA = new Date('2026-09-30T10:00:00Z');
const H = 3_600_000;

test('escalera 48 h → 4 d → 8 d → 14 d y no pasa de 14', () => {
  const base = { esTemporadaActual: true, anioInicio: 2026, nombreCompeticion: 'Segona Divisió Benjamí', ahora: AHORA };
  const horas = [1, 2, 3, 4, 5, 40].map((racha) => (esperaSinPublicar({ ...base, racha }).hasta - AHORA) / H);
  assert.deepEqual(horas, [48, 96, 192, 336, 336, 336]);
  assert.equal(esperaSinPublicar({ ...base, racha: 1 }).texto, 'en 48 h');
  assert.equal(esperaSinPublicar({ ...base, racha: 2 }).texto, 'en 4 días');
});

test('racha ausente o absurda cuenta como primera vez', () => {
  for (const racha of [0, -3, null, undefined, 'x']) {
    const r = esperaSinPublicar({ racha, esTemporadaActual: false, anioInicio: 2025, nombreCompeticion: 'X', ahora: AHORA });
    assert.equal((r.hasta - AHORA) / H, 48);
  }
});

test('promoción de la temporada en curso espera al 1 de abril de Madrid', () => {
  const r = esperaSinPublicar({
    racha: 1, esTemporadaActual: true, anioInicio: 2026,
    nombreCompeticion: 'Promoció ascens a Tercera Catalana', ahora: AHORA,
  });
  assert.equal(r.motivo, 'promocion');
  assert.equal(r.hasta.toISOString(), '2027-03-31T22:00:00.000Z');
});

test('promoción de otra temporada o pasado el 1 de abril usa la escalera', () => {
  const vieja = esperaSinPublicar({ racha: 1, esTemporadaActual: false, anioInicio: 2025,
    nombreCompeticion: 'Promoció Tercera Aleví', ahora: AHORA });
  assert.equal(vieja.motivo, 'escalera');
  const mayo = new Date('2027-05-02T10:00:00Z');
  const tarde = esperaSinPublicar({ racha: 3, esTemporadaActual: true, anioInicio: 2026,
    nombreCompeticion: 'Promoción de ascenso', ahora: mayo });
  assert.equal(tarde.motivo, 'escalera');
  assert.equal((tarde.hasta - mayo) / H, 192);
});

test('reconoce promoción/ascenso en catalán y castellano, y nada más', () => {
  for (const n of ['Promoció ascens Tercera Benjamí', 'PROMOCIÓN', 'Fase d\'ascens', 'Ascenso a Preferente']) {
    assert.ok(esCompeticionDeFinalDeTemporada(n), n);
  }
  for (const n of ['Tercera Aleví', 'Segona Divisió', '', null]) assert.ok(!esCompeticionDeFinalDeTemporada(n), String(n));
  assert.equal(unoDeAbrilDeLaTemporada(2026).toISOString(), '2027-03-31T22:00:00.000Z');
});

test('preparaRachaSinPublicar crea la columna, siembra sólo los atascados y es idempotente', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table trabajos (clave text primary key, estado text, intentos integer not null default 0,
    ultimo_error text)`);
  const ins = db.prepare('insert into trabajos values (?,?,?,?)');
  ins.run('a', 'pendiente', 9, 'el calendario no muestra ninguna jornada [...]');
  ins.run('b', 'pendiente', 2, 'grupo de la temporada actual todavía sin datos publicados');
  ins.run('c', 'pendiente', 5, 'wait timed out');
  ins.run('d', 'hecho', 4, 'el calendario no muestra ninguna jornada');
  assert.deepEqual(preparaRachaSinPublicar(db), { creada: true, sembrados: 2 });
  const racha = Object.fromEntries(db.prepare('select clave, sin_publicar_seguidos r from trabajos').all()
    .map((f) => [f.clave, f.r]));
  assert.deepEqual(racha, { a: 9, b: 2, c: 0, d: 0 });
  assert.deepEqual(preparaRachaSinPublicar(db), { creada: false, sembrados: 0 });
});
