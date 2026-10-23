import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideActaAbierta } from './acta-abierta.mjs';

const base = { temporada: '22', temporadaActual: 22, hoy: '2026-10-22', fechaPartido: '2026-10-18' };

test('acta abierta de la temporada en curso: no se da por hecha', () => {
  assert.deepEqual(decideActaAbierta({ ...base, actaCerrada: '0', enJuego: '1' }).dias, 0.25);
  assert.deepEqual(decideActaAbierta({ ...base, actaCerrada: '0', enJuego: '0' }).dias, 1);
});

test('se guarda como siempre: cerrada, suspendida, temporada pasada, partido viejo o campo ausente', () => {
  assert.equal(decideActaAbierta({ ...base, actaCerrada: '1', enJuego: '0' }), null);
  assert.equal(decideActaAbierta({ ...base, actaCerrada: '0', suspendido: '1' }), null);
  assert.equal(decideActaAbierta({ ...base, actaCerrada: '0', temporada: '21' }), null);
  assert.equal(decideActaAbierta({ ...base, actaCerrada: '0', fechaPartido: '2026-09-01' }), null);
  assert.equal(decideActaAbierta({ ...base, actaCerrada: undefined }), null);
});
