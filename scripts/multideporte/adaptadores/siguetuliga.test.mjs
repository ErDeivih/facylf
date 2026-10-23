import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import adaptador, { esAficionada, fechaIso, ligasDelSitemap, partidosDelCalendario } from './siguetuliga.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('siguetuliga: ligas aficionadas (también de menores desde el 05/10/2026), sin federadas ni otros deportes', () => {
  assert.equal(esAficionada('galicia-veteranos-a-coruna---division-de-honor'), true);
  assert.equal(esAficionada('galicia-ligas-locales-lugo-adfs-lugo-1-division'), true);
  assert.equal(esAficionada('galicia-biberones-vigo-local-grupo-a---2016-17'), true);
  assert.equal(esAficionada('galicia-futbol-sala-santiago-benxamin-gr-1'), true);
  assert.equal(esAficionada('canarias-gran-canaria-xxv-torneo-lucha-corrida---1-categoria---grupo-a'), false);
  assert.equal(esAficionada('preferente-galicia-grupo-norte'), false);
  assert.equal(esAficionada('baloncesto-andalucia-primera-nacional'), false);
  assert.equal(esAficionada('baleares-1-regional---futbol-sala-1-regional'), false);
  assert.equal(esAficionada('galicia-veteranos-ourense---primera-division'), true);
  assert.ok(ligasDelSitemap(F('siguetuliga-ligas.xml')).length > 10);
});

test('siguetuliga: calendario con fecha de jornada, equipos con id y marcador', () => {
  assert.equal(fechaIso('Sábado, 19 de Septiembre de 2026'), '2026-09-19');
  const ps = partidosDelCalendario(F('siguetuliga-calendario.html'));
  assert.equal(ps.length, 9);
  assert.deepEqual(ps[0], { id_partido: '1739649', jornada: 1, fecha_jornada: '2026-09-12', fecha_texto: 'Sábado, 12 de Septiembre de 2026',
    hora: null, local: { id: '55610', nombre: 'UD Carral' }, visitante: { id: '55627', nombre: 'Fontemaior' },
    goles_local: 2, goles_visitante: 1, jugado: true });
  const r = adaptador.tipos.calendario.interpreta(F('siguetuliga-calendario.html'), { contexto: { liga: 'x' } });
  assert.equal(r.registros.length, 9);
});
