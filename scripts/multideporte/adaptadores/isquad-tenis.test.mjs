import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { creaAdaptadorIsquadTenis, esDeMenores, partidoMinimo } from './isquad-tenis.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('menores y adultos con nombre (menores marcados); nunca licencias ni datos de contacto', () => {
  const ps = JSON.parse(F('isquad-tenis-partidos.json'));
  const min = ps.find((p) => /Sub-12/.test(p.edad_nombre));
  const adu = ps.find((p) => p.edad_nombre === 'Absoluta');
  assert.ok(esDeMenores(min)); assert.ok(!esDeMenores(adu));
  const m = partidoMinimo(min); const a = partidoMinimo(adu);
  assert.equal(m.menores, true);
  assert.ok(m.local.nombre && m.visitante.nombre);
  assert.ok(a.local.nombre);
  const texto = JSON.stringify([m, a]);
  assert.ok(!/licencia|dni|email|telefono|fecha_nacimiento/i.test(texto));
});

test('partido finalizado con sus sets', () => {
  const p = partidoMinimo(JSON.parse(F('isquad-tenis-partidos.json')).find((x) => x.id_partido === '2093996'));
  assert.equal(p.finalizado, true);
  assert.equal(p.sets_local, 2); assert.equal(p.sets_visitante, 1);
  assert.deepEqual(p.parciales, [[4, 6], [6, 3], [10, 6]]);
});

test('de punta a punta: calendario por POST → partidos por POST de cada campeonato', async () => {
  const ad = creaAdaptadorIsquadTenis({ federaciones: ['19'], anios: [2026], ahora: () => new Date('2026-10-01T12:00:00Z') });
  const db = abreCola(':memory:');
  for (const s of ad.semillas()) encola(db, ad.nombre, s);
  const cuerpos = [];
  const pedir = async (u, { cuerpo } = {}) => { cuerpos.push([u, cuerpo]);
    return { estado: 200, bruto: Buffer.from(u.endsWith('/calendar') ? F('isquad-tenis-calendario.json') : F('isquad-tenis-partidos.json')) }; };
  const c = await ejecutaSesion({ db, adaptador: ad, max: 40, pedir, esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  assert.ok(cuerpos.every(([u, b]) => b && !u.includes('inscritos')));
  assert.equal(db.prepare(`select count(*) n from registros where tipo='campeonato'`).get().n, 11);
  assert.equal(db.prepare(`select count(*) n from registros where tipo='partido'`).get().n, 12);
});
