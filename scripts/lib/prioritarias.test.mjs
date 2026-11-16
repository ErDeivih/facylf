/*
 * Prueba de la reserva de DOS plazas para Castilla y León (16/11/2026).
 *
 * El reparto de plazas tenía UNA plaza reservada. David pide dos navegadores en el servidor, así que la
 * reserva pasa a ser una lista y el reparto de las demás descuenta las reservadas que estén ACTIVAS. Lo que
 * se defiende aquí: que nunca se abran más navegadores de los del presupuesto y que las dos reservadas no se
 * pisen (cada trabajador coge una).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PLAZAS_PRIORITARIAS, plazaPrioritariaLibre, plazasCompartidas, cedePorPrioridad,
} from './presupuesto-memoria.mjs';

test('la reserva son dos plazas y la primera conserva el nombre de siempre', () => {
  assert.equal(PLAZAS_PRIORITARIAS.length, 2);
  assert.equal(PLAZAS_PRIORITARIAS[0], 'slot-prioridad.lock');
});

test('cada trabajador coge la primera plaza reservada libre', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prio-'));
  assert.equal(plazaPrioritariaLibre(dir), 'slot-prioridad.lock');
  writeFileSync(join(dir, 'slot-prioridad.lock'), '111 host');
  assert.equal(plazaPrioritariaLibre(dir), 'slot-prioridad-2.lock');
  writeFileSync(join(dir, 'slot-prioridad-2.lock'), '222 host');
  assert.equal(plazaPrioritariaLibre(dir), null, 'con las dos ocupadas no hay reservada libre');
  rmSync(dir, { recursive: true, force: true });
});

test('las compartidas descuentan las reservadas ACTIVAS, no las posibles', () => {
  assert.equal(plazasCompartidas({ plazas: 4, prioritariasActivas: 0 }), 4);
  assert.equal(plazasCompartidas({ plazas: 4, prioritariasActivas: 1 }), 3);
  assert.equal(plazasCompartidas({ plazas: 4, prioritariasActivas: 2 }), 2, 'dos navegadores de CyL dejan 2 compartidas');
  assert.equal(plazasCompartidas({ plazas: 2, prioritariasActivas: 2 }), 1, 'nunca menos de una');
  // Compatibilidad con la firma antigua (una sola prioritaria activa).
  assert.equal(plazasCompartidas({ plazas: 4, prioritariaActiva: true }), 3);
});

test('con dos reservadas activas, las demás sueltan la plaza que ya no está en el reparto', () => {
  const dos = cedePorPrioridad({ nombreSlot: 'slot-4.lock', plazas: 4, prioritariasActivas: 2 });
  assert.equal(dos.ceder, true);
  const dentro = cedePorPrioridad({ nombreSlot: 'slot-2.lock', plazas: 4, prioritariasActivas: 2 });
  assert.equal(dentro.ceder, false);
  const sin = cedePorPrioridad({ nombreSlot: 'slot-4.lock', plazas: 4, prioritariasActivas: 0 });
  assert.equal(sin.ceder, false);
});
