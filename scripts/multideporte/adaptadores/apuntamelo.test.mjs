import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorApuntamelo } from './apuntamelo.mjs';
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const a = creaAdaptadorApuntamelo();
const ctx = { org: { id: 4, nombre: 'Tiki Taka BCN' }, division: { id: 951, nombre: 'Alpha (Lunes)' } };

test('apuntamelo: divisiones sin amistosos', () => {
  const r = a.tipos.divisiones.interpreta(fx('apuntamelo-divisiones.json'), { contexto: { org: { id: 4 } } });
  assert.ok(r.enlaces.length >= 2 && r.enlaces.every((e) => !/AMISTOS/.test(e.contexto.division.nombre)));
  assert.equal(r.enlaces[0].url, 'https://apuntamelo.com/obtenerPartidosPorJornadaDivision?organizacion=4&division=951');
});

test('apuntamelo: partidos y clasificación sin fotos ni capitanes', () => {
  const p = a.tipos.partidos.interpreta(fx('apuntamelo-partidos.json'), { contexto: ctx });
  const [x, y] = p.registros.map((r) => r.datos);
  assert.equal(x.jugado, false); assert.equal(x.goles_local, null); assert.equal(x.local.nombre, 'Double Tap'); assert.equal(x.fecha, '2026-10-05'); assert.equal(x.hora, '19:20');
  assert.equal(y.jugado, true); assert.equal(y.goles_local, 4); assert.equal(y.validado, true);
  const c = a.tipos.clasificacion.interpreta(fx('apuntamelo-ligas.json'), { contexto: ctx });
  assert.ok(c.registros[0].datos.filas.length > 3);
  const t = JSON.stringify([p.registros, c.registros]);
  assert.ok(!/Escudo|Capitan|jugador_|rembg/.test(t));
});
