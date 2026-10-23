import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorTotalFutbol, fasesYGrupos, partidosDeJornada } from './totalfutbol.mjs';
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const a = creaAdaptadorTotalFutbol();

test('totalfutbol: fases y grupos', () => {
  const f = fasesYGrupos(fx('totalfutbol-fases.html'));
  assert.equal(f.campeonato, 'Liga F7 Escolapios de Pozuelo diario'); assert.equal(f.fase, 'Fase de Liga');
  assert.deepEqual(f.grupos.map((g) => g.ultima_jornada), ['7578', '7591', '7604']);
  assert.equal(f.grupos[0].nombre, '1ª División'); assert.ok(f.grupos[0].equipos.includes('Kpax'));
  assert.equal(f.fase_anterior, 'FasesGrupos.aspx?IdF=605');
  const r = a.tipos.fase.interpreta(fx('totalfutbol-fases.html'), { contexto: { idc: 340 } });
  assert.equal(r.enlaces.length, 4);
});

test('totalfutbol: jornada con partidos y jornada anterior', () => {
  const j = partidosDeJornada(fx('totalfutbol-jornada.html'));
  assert.equal(j.jornada, 7); assert.equal(j.anterior, 'Resultados.aspx?IdJ=7577');
  assert.equal(j.partidos.length, 2);
  const p = j.partidos[0];
  assert.equal(p.local.nombre, 'Clasico CF'); assert.equal(p.local.id, '4455'); assert.equal(p.visitante.nombre, 'Kpax');
  assert.equal(p.goles_local, 2); assert.equal(p.goles_visitante, 9); assert.equal(p.fecha, '2020-03-09'); assert.equal(p.hora, '20:00');
  assert.equal(p.id_partido, '28778');
  const r = a.tipos.jornada.interpreta(fx('totalfutbol-jornada.html'), { contexto: { idc: 340, grupo: '1ª División' }, url: 'https://www.totalfutbol.es/ges/laweb/Resultados.aspx?IdJ=7578' });
  assert.equal(r.registros.length, 2); assert.equal(r.enlaces[0].url, 'https://www.totalfutbol.es/ges/laweb/Resultados.aspx?IdJ=7577');
});

test('totalfutbol: plantilla nueva (2026) con hora «12h» y campo', () => {
  const j = partidosDeJornada(fx('totalfutbol-jornada-2026.html'));
  assert.ok(j.partidos.length >= 2);
  const p = j.partidos[0];
  assert.equal(p.local.nombre, 'Flamingos FC'); assert.equal(p.goles_local, 2); assert.equal(p.goles_visitante, 2);
  assert.equal(p.fecha, '2026-01-11'); assert.equal(p.hora, '12:00'); assert.equal(p.campo, 'Campo F7'); assert.equal(p.id_partido, '39361');
});

test('totalfutbol: sede → campeonatos; página vacía no se repite', () => {
  const s = a.tipos.sede.interpreta(fx('totalfutbol-sede.html'));
  assert.ok(s.enlaces.length >= 6); assert.match(s.enlaces[0].url, /FasesGrupos\.aspx\?idc=\d+$/);
  assert.deepEqual(a.tipos.fase.interpreta('<html></html>', { contexto: { idc: 9999 } }), { registros: [], enlaces: [] });
});
