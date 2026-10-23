import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorOwbasket, descodifica, partidosDelGrupo } from './owbasket.mjs';
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
const a = creaAdaptadorOwbasket({ ahora: () => new Date('2026-10-01T10:00:00Z') });

test('owbasket: descodifica base64 y JSON', () => {
  assert.equal(descodifica(b64(fx('owbasket-zonas.json'))).length, 10);
  assert.equal(descodifica(fx('owbasket-zonas.json')).length, 10);
  assert.equal(descodifica('basura'), null);
});

test('owbasket: zonas → categorías por temporada → grupos', () => {
  const z = a.tipos.zonas.interpreta(b64(fx('owbasket-zonas.json')), { contexto: { fede: 'fbcyl' } });
  assert.equal(z.enlaces.length, 40);
  assert.match(z.enlaces[0].url, /fbcyl\/1\/jR4r.*CategoryRegistered\/getByZoneAndSeason\/1\/2026$/);
  assert.ok(z.enlaces.find((e) => e.contexto.temporada === 2026).prioridad < z.enlaces.find((e) => e.contexto.temporada === 2023).prioridad);
  const c = a.tipos.categorias.interpreta(b64(fx('owbasket-categorias.json')), { contexto: { fede: 'fbcyl', zona: { id: '1' }, temporada: 2024 } });
  assert.ok(c.enlaces.some((e) => /getCompetitionGroupVisibleWeb\/937\/1$/.test(e.url)));
  const g = a.tipos.grupos.interpreta(b64(fx('owbasket-grupos.json')), { contexto: { fede: 'fbcyl', zona: { id: '1' }, temporada: 2024 } });
  assert.ok(g.enlaces.some((e) => /getAllGamesByGrupWithMatchRecords\/5430$/.test(e.url)));
});

test('owbasket: partidos y clasificación del grupo', () => {
  const datos = descodifica(fx('owbasket-partidos-grupo.json'));
  const { partidos, clasificacion } = partidosDelGrupo(datos);
  assert.ok(partidos.length >= 14);
  const p = partidos.find((x) => x.id_partido === '111737');
  assert.equal(p.local.nombre, 'ECOLE-BVM 2012'); assert.equal(p.puntos_local, 47); assert.equal(p.puntos_visitante, 45);
  assert.equal(p.fecha, '2025-04-25'); assert.equal(p.hora, '20:30'); assert.equal(p.jornada, 30); assert.equal(p.jugado, true);
  assert.equal(clasificacion[0].posicion, 1); assert.equal(clasificacion[0].equipo.nombre, 'BASKET ELOY VILLANUEVA');
  const r = a.tipos.partidos.interpreta(b64(fx('owbasket-partidos-grupo.json')), { contexto: { fede: 'fbcyl', zona: { id: '1' }, temporada: 2024, grupo: { id: '5430' } } });
  assert.equal(r.registros.filter((x) => x.tipo === 'partido').length, partidos.length);
  assert.equal(r.revisitarHoras, undefined);
  const texto = JSON.stringify(r.registros);
  assert.ok(!/dni|birth|email/i.test(texto));
});
