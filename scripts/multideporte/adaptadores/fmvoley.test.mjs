import assert from 'node:assert/strict';
import { test } from 'node:test';

test('fmvoley: partido normalizado; sin finalizar no hay marcador (no 0-0) y «DESCANSA» no es un partido', async () => {
  const { partidoFmvoley } = await import('./fmvoley.mjs');
  const base = { fecha: '26/09/2026', hora: '17:00', pabellon: 'POLI', pista: '1', equipo_local: 'VP MADRID', equipo_visitante: 'MADRID CHAMBERÍ',
    img_local: 'x?Id=52035&rnd=3', img_visitante: 'x?Id=52162&rnd=9', sets_local: '2', sets_visitante: '1',
    puntos_local_juego_1: '25', puntos_visitante_juego_1: '17', puntos_local_juego_2: '25', puntos_visitante_juego_2: '20',
    puntos_local_juego_3: '28', puntos_visitante_juego_3: '30', puntos_local_juego_4: '0', puntos_visitante_juego_4: '0', finalizado: true };
  const p = partidoFmvoley(base);
  assert.equal(p.fecha, '2026-09-26');
  assert.deepEqual([p.sets_local, p.sets_visitante], [2, 1]);
  assert.deepEqual(p.parciales, [[25, 17], [25, 20], [28, 30]]);
  assert.equal(p.local.id, '52035');
  const futuro = partidoFmvoley({ ...base, finalizado: false, sets_local: '0', sets_visitante: '0', hora: '0:00' });
  assert.equal(futuro.sets_local, null); assert.equal(futuro.hora, null); assert.equal(futuro.parciales, null);
  const hueco = partidoFmvoley({ ...base, equipo_local: 'DESCANSA...', sets_local: '0', sets_visitante: '0' });
  assert.equal(hueco.descanso, true); assert.equal(hueco.sets_local, null);
});
