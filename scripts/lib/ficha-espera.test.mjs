import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { latidoDeFicha } from './ficha-espera.mjs';

/*
 * PRUEBAS DEL LATIDO DE LAS FICHAS DE ESPERA DE PLAZA
 *
 * Defienden un fallo real: al limpiar las fichas de espera abandonadas, el recolector las lista con
 * `readdirSync` y después les hace `statSync` para saber cuándo latieron. Otra sesión puede borrar la
 * ficha entre las dos llamadas (es justo lo que hacen los demás al retirar las abandonadas), y entonces
 * `statSync` lanza ENOENT y el worker termina con código 1. Medido el 09/11/2026: 876 salidas con
 * código 1 en Castilla y León por esta carrera, con 5 plazas y varias federaciones esperando.
 */

const dir = mkdtempSync(join(tmpdir(), 'fichas-'));
const ruta = join(dir, 'espera-pnfg-abc-1.ficha');

test('una ficha que existe devuelve su fecha de último latido', () => {
  writeFileSync(ruta, '123 host 1');
  const cuando = new Date('2026-11-09T22:00:00.000Z');
  utimesSync(ruta, cuando, cuando);
  assert.equal(latidoDeFicha(ruta), cuando.getTime());
});

test('una ficha que otra sesión borró entre listar y mirar devuelve null, no lanza', () => {
  rmSync(ruta, { force: true });
  assert.equal(latidoDeFicha(ruta), null);
});

test('un error que no es «no existe» tampoco tumba al worker: se trata como sin latido', () => {
  const lanza = () => { throw new Error('EACCES: permiso denegado'); };
  assert.equal(latidoDeFicha('/no/importa', { stat: lanza }), null);
});
