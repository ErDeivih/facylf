import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorLaPreferente, jornadas, meta, partidosDeJornada, temporadas } from './lapreferente.mjs';
const fx = (n) => new TextDecoder('windows-1252').decode(readFileSync(new URL(`../fixtures/${n}`, import.meta.url)));
const a = creaAdaptadorLaPreferente();

test('lapreferente: la página de una competición da las ligas no federadas y de veteranos de su comunidad', () => {
  const r = a.tipos.region.interpreta(fx('lapreferente-competicion.html'));
  const comps = r.enlaces.filter((e) => e.tipo === 'competicion');
  assert.equal(comps.length, 34);
  assert.ok(comps.some((e) => /C23016-1\/liga-andaluza-25\/widget\.html$/.test(e.url) && e.contexto.categoria === 'No Federado'));
  assert.ok(comps.some((e) => e.contexto.categoria === 'Veteranos'));
  assert.ok(r.enlaces.some((e) => e.tipo === 'region' && /temporada=20242025/.test(e.url)));
  assert.ok(r.enlaces.some((e) => /temporada=20222023/.test(e.url)));   // histórico desde 2015-16
  assert.ok(!r.enlaces.some((e) => /temporada=2014201[45]/.test(e.url)));
});

test('lapreferente: meta, jornadas y temporadas de la competición', () => {
  const h = fx('lapreferente-competicion.html');
  const m = meta(h);
  assert.equal(m.id, '23862'); assert.equal(m.categoria, 'No Federado'); assert.equal(m.temporada, '20252026');
  const js = jornadas(h, 23862);
  assert.equal(js.length, 22); assert.equal(js[0].fecha, '2025-10-18'); assert.match(js[0].url, /index\.php\?comp=23862&accion=widget&jor=1$/);
  assert.ok(temporadas(h).length > 3);
});

test('lapreferente: partidos de una jornada (sólo su tabla)', () => {
  const j = partidosDeJornada(fx('lapreferente-jornada.html'), 23016, 5);
  assert.equal(j.fecha, '2025-10-25');
  assert.equal(j.partidos.length, 7);
  const p = j.partidos[0];
  assert.equal(p.local.id, '10558'); assert.equal(p.visitante.nombre, 'Vet. Puente Genil'); assert.equal(p.goles_local, 3); assert.equal(p.goles_visitante, 3);
  const r = a.tipos.jornada.interpreta(fx('lapreferente-jornada.html'), { contexto: { competicion: { id: 23016 }, jornada: 5 } });
  assert.equal(r.registros.length, 7); assert.equal(r.registros[0].clave, '23016|5|10558|10560');
});

test('lapreferente: temporada en curso y pasadas sin revisita', async () => {
  const { temporadaEnCurso } = await import('./lapreferente.mjs');
  assert.equal(temporadaEnCurso(new Date('2026-10-02')), 20262027);
  assert.equal(temporadaEnCurso(new Date('2026-03-01')), 20252026);
});
