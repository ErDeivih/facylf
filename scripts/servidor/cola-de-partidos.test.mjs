/*
 * Prueba de la cola de partidos: cuándo toca mirar un acta y cómo se clasifica.
 *
 * La regla de David: se juega a las 16:00 → se mira a las 19:00; si no está, a las 21:00; a los tres fallos
 * se deja pasar unos días; lo que siga sin acta tras una semana es un aplazado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoToca, clasifica, HORAS_TRAS_INICIO } from './cola-de-partidos.mjs';

const H = 3600e3;
const inicio = Date.parse('2026-11-15T16:00:00+01:00');

test('el acta se mira tres horas después del inicio, no antes', () => {
  assert.equal(cuandoToca({ inicio, intentos: 0 }), inicio + HORAS_TRAS_INICIO * H);
});

test('cada intento fallido la empuja dos horas', () => {
  assert.equal(cuandoToca({ inicio, intentos: 1 }), inicio + 3 * H + 2 * H);
  assert.equal(cuandoToca({ inicio, intentos: 2 }), inicio + 3 * H + 4 * H);
});

test('antes de la hora, espera; a la hora, toca', () => {
  const base = inicio + 3 * H;
  assert.equal(clasifica({ inicio, intentos: 0, ahora: base - 60e3, tieneActa: false }), 'espera');
  assert.equal(clasifica({ inicio, intentos: 0, ahora: base + 60e3, tieneActa: false }), 'toca');
});

test('con acta ya guardada no se vuelve a pedir', () => {
  assert.equal(clasifica({ inicio, intentos: 0, ahora: inicio + 10 * H, tieneActa: true }), 'hecha');
});

test('a los tres fallos se aparta, y tras una semana es aplazado', () => {
  const tres = inicio + 3 * H + 6 * H; // tercer intento ya hecho
  assert.equal(clasifica({ inicio, intentos: 3, ahora: tres + 1 * 86400e3, tieneActa: false }), 'apartado');
  assert.equal(clasifica({ inicio, intentos: 3, ahora: tres + 8 * 86400e3, tieneActa: false }), 'aplazado');
});
