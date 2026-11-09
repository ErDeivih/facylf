import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decisionDeRepaso, metadatoDeRepaso, HORAS_ENTRE_REPASOS } from './repaso-actas.mjs';

/*
 * PRUEBAS DEL REPASO DE ACTAS
 *
 * Defienden un coste que se paga en cada arranque de sesión: contar las actas con parser viejo recorre
 * entera la tabla `actas` (2,4 GB con el JSON de cada acta) y en el PC, con la cola en HDD, son 40-60
 * minutos de congelación. Medido el 09/11/2026: el worker se quedó 42 minutos bloqueado en el paso 25 de
 * una sesión y no hizo ni una petición. Basta con no repetir el recuento si el parser no ha cambiado y el
 * último dejó la cola limpia; cuando hay actas pendientes, se cuenta siempre (para poder repararlas).
 */

const AHORA = Date.parse('2026-11-09T23:00:00.000Z');
const HORA = 3_600_000;

test('sin metadato se cuenta: la primera vez no hay nada de lo que fiarse', () => {
  assert.equal(decisionDeRepaso({ guardado: null, versionActual: 17, ahoraMs: AHORA }), 'contar');
  assert.equal(decisionDeRepaso({ guardado: {}, versionActual: 17, ahoraMs: AHORA }), 'contar');
});

test('cola limpia, mismo parser y repaso reciente: se salta', () => {
  const guardado = metadatoDeRepaso({ versionActual: 17, pendientes: 0, ahoraMs: AHORA - 2 * HORA });
  const leido = JSON.parse(guardado);
  assert.equal(decisionDeRepaso({ guardado: leido, versionActual: 17, ahoraMs: AHORA }), 'saltar');
});

test('si cambia el parser hay que contar otra vez, aunque esté limpio y sea reciente', () => {
  const leido = JSON.parse(metadatoDeRepaso({ versionActual: 16, pendientes: 0, ahoraMs: AHORA - HORA }));
  assert.equal(decisionDeRepaso({ guardado: leido, versionActual: 17, ahoraMs: AHORA }), 'contar');
});

test('si había actas pendientes se cuenta siempre: hay trabajo que hacer', () => {
  const leido = JSON.parse(metadatoDeRepaso({ versionActual: 17, pendientes: 5, ahoraMs: AHORA - HORA }));
  assert.equal(decisionDeRepaso({ guardado: leido, versionActual: 17, ahoraMs: AHORA }), 'contar');
});

test('pasadas las horas máximas se vuelve a contar: la cola pudo cambiar por fuera', () => {
  const leido = JSON.parse(metadatoDeRepaso({ versionActual: 17, pendientes: 0, ahoraMs: AHORA - (HORAS_ENTRE_REPASOS + 2) * HORA }));
  assert.equal(decisionDeRepaso({ guardado: leido, versionActual: 17, ahoraMs: AHORA }), 'contar');
});

test('un reloj raro o una fecha ilegible no se usan para saltarse el repaso', () => {
  const futuro = JSON.parse(metadatoDeRepaso({ versionActual: 17, pendientes: 0, ahoraMs: AHORA + 5 * HORA }));
  assert.equal(decisionDeRepaso({ guardado: futuro, versionActual: 17, ahoraMs: AHORA }), 'contar');
  assert.equal(decisionDeRepaso({ guardado: { version: 17, limpio: true, cuando: 'no-es-fecha' }, versionActual: 17, ahoraMs: AHORA }), 'contar');
});
