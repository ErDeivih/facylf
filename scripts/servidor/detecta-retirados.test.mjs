/*
 * Pruebas del detector de equipos retirados.
 *
 * La regla: un equipo está retirado si sus ÚLTIMOS partidos jugados no tienen acta (al menos 3 seguidos)
 * y antes sí tenía. Un aplazamiento suelto en medio no lo convierte en retirado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizaEquipo } from './detecta-retirados.mjs';

const p = (fecha, tieneActa) => ({ fecha, tieneActa, jornada: '1' });

test('sin partidos sin acta no es retirado', () => {
  assert.equal(analizaEquipo([p('2026-09-01', true), p('2026-09-08', true)]).retirado, false);
});

test('tres partidos seguidos sin acta al final y con actas antes: retirado', () => {
  const r = analizaEquipo([
    p('2026-09-01', true), p('2026-09-08', true),
    p('2026-09-15', false), p('2026-09-22', false), p('2026-09-29', false),
  ]);
  assert.equal(r.retirado, true);
  assert.equal(r.sinActa, 3);
  assert.equal(r.desde, '2026-09-15');
});

test('un hueco en medio no lo convierte en retirado', () => {
  const r = analizaEquipo([
    p('2026-09-01', true), p('2026-09-08', false), p('2026-09-15', true),
    p('2026-09-22', true), p('2026-09-29', true),
  ]);
  assert.equal(r.retirado, false);
});

test('si nunca tuvo acta pero tiene varios partidos, es candidato (motivo «nunca»)', () => {
  // El grupo sí tiene actas para los demás equipos; este no tiene ninguna. Quien llama comprueba que el
  // grupo tenga actas de otros; si no, no lo marca.
  const r = analizaEquipo([p('2026-09-01', false), p('2026-09-08', false), p('2026-09-15', false)]);
  assert.equal(r.retirado, true);
  assert.equal(r.motivo, 'nunca');
});

test('con menos de 3 sin acta no se declara', () => {
  const r = analizaEquipo([p('2026-09-01', true), p('2026-09-08', true), p('2026-09-15', false), p('2026-09-22', false)]);
  assert.equal(r.retirado, false);
});
