import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TIMEOUT_CARGA_MS, TIMEOUT_SCRIPT_MS, tiemposNavegador } from './tiempos-navegador.mjs';

/*
 * PRUEBAS DE LOS TIEMPOS DEL NAVEGADOR
 *
 * Defienden lo que se midió el 09/11/2026 en el servidor: con `pageLoad` a 30 s, las peticiones de Castilla
 * y León que tardaban 18-20 s de media se quedaban en el límite y el 83 % se perdía con «Timed out
 * receiving message from renderer». Los demás recolectores de navegador (Cataluña) ya usan 60 s, así que el
 * valor por defecto de este módulo tiene que ser 60 s y no puede volver a bajar sin una prueba que lo diga.
 */

test('el tiempo de carga por defecto es 60 s y el de script 15 s', () => {
  const tiempos = tiemposNavegador({});
  assert.equal(tiempos.pageLoad, 60_000);
  assert.equal(tiempos.script, 15_000);
  assert.equal(TIMEOUT_CARGA_MS, 60_000);
  assert.equal(TIMEOUT_SCRIPT_MS, 15_000);
  assert.ok(tiempos.pageLoad > tiempos.script, 'el script no puede tener más margen que la carga');
});

test('el valor por defecto no vuelve por debajo del que se midió mal (30 s)', () => {
  assert.ok(TIMEOUT_CARGA_MS >= 45_000, 'con 30 s se perdían 8 de cada 10 peticiones');
});

test('la variable de entorno lo cambia, sin tocar el código desplegado', () => {
  const tiempos = tiemposNavegador({ FACYLF_PAGELOAD_MS: '90000', FACYLF_SCRIPT_MS: '45000' });
  assert.equal(tiempos.pageLoad, 90_000);
  assert.equal(tiempos.script, 45_000);
});

test('un valor absurdo, negativo o no numérico se ignora y se queda el por defecto', () => {
  for (const malo of ['0', '-1', 'mucho', 'NaN', 'Infinity', '', '  ']) {
    const tiempos = tiemposNavegador({ FACYLF_PAGELOAD_MS: malo, FACYLF_SCRIPT_MS: malo });
    assert.equal(tiempos.pageLoad, 60_000, `pageLoad con «${malo}»`);
    assert.equal(tiempos.script, 15_000, `script con «${malo}»`);
  }
});
