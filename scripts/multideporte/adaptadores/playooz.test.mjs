import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorPlayooz } from './playooz.mjs';
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const a = creaAdaptadorPlayooz();
const ctx = { host: 'ligafutbolmadrid.es', provincia: 'Madrid', evento: { id: 429 }, ronda: { id: 179 }, grupo: { id: 574 } };

test('playooz: cabecera de cliente y cadena evento → ronda → grupo', () => {
  assert.deepEqual(a.cabeceras({ contexto: JSON.stringify(ctx) })['X-Tenant-Host'], 'ligafutbolmadrid.es');
  const ev = a.tipos.eventos.interpreta(fx('playooz-eventos.json'), { contexto: { host: 'ligafutbolmadrid.es' } });
  assert.equal(ev.registros.length, 3); assert.equal(ev.enlaces.length, 3);
  assert.match(ev.enlaces[0].url, /\/event\/rounds\?eventId=429$/);
  const r = a.tipos.rondas.interpreta(fx('playooz-rondas.json'), { contexto: ctx });
  assert.match(r.enlaces[0].url, /groups\?roundId=179$/);
  const g = a.tipos.grupos.interpreta(fx('playooz-grupos.json'), { contexto: ctx });
  assert.equal(g.enlaces.length, 4);
  assert.match(g.enlaces[0].url, /result\/matches\?eventId=429&type=1&roundId=179&groupId=574$/);
});

test('playooz: partidos (marcador null = sin jugar) y clasificación sin logos', () => {
  const p = a.tipos.partidos.interpreta(fx('playooz-partidos.json'), { contexto: ctx });
  assert.equal(p.registros.length, 8);
  const [x, y] = p.registros.map((r) => r.datos);
  assert.equal(x.jugado, false); assert.equal(x.goles_local, null); assert.equal(x.local.nombre, 'Fénix F. C.'); assert.equal(x.fecha, '2026-10-05');
  assert.equal(y.jugado, true); assert.equal(y.goles_local, 3); assert.equal(y.goles_visitante, 2);
  assert.equal(p.revisitarHoras, 24);
  const c = a.tipos.clasificacion.interpreta(fx('playooz-clasificacion.json'), { contexto: ctx });
  assert.ok(c.registros[0].datos.filas.length >= 10);
  assert.ok(!/logo|X-Amz/i.test(JSON.stringify(c.registros)));
  assert.ok(!/X-Amz/i.test(JSON.stringify(p.registros)));
});
