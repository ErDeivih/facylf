import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarioDeHtml, totalDeCruces } from './calendario-html.mjs';

const equipo = (codigo, nombre) =>
  `<a href="NFG_VisEquipos?cod_primaria=1000120&amp;Codigo_Equipo=${codigo}&amp;codtemporada=22"><span class="x">${nombre}</span></a>`;
const partido = (l, v) => `<table><tr><td>${equipo(...l)}</td><td>-</td><td>${equipo(...v)}</td></tr></table>`;
const jornada = (n, fecha, partidos) =>
  `<table><tr><td colspan="3">Jornada ${n} ${fecha ? `<span id="fecha_jornada_org_${n}">(${fecha})</span>` : ''}</td></tr>`
  + `<tr><td>${partidos.join('')}</td></tr></table>`;

const A = [101, 'C.D. Uno'], B = [102, 'C.D. Dos'], C = [103, 'Atlético Tres "B"'], D = [104, 'U.D. Cuatro'];

test('saca todas las jornadas, jugadas o no, con códigos, orden y fecha', () => {
  const html = `<select><option>Jornada 1</option><option>Jornada 2</option></select>`
    + jornada(1, '20-09-2026', [partido(A, B), partido(C, D)])
    + jornada(2, '27-09-2026', [partido(B, C), partido(D, A)]);
  const c = calendarioDeHtml(html);
  assert.deepEqual(c.problemas, []);
  assert.equal(c.jornadas.length, 2);
  assert.equal(totalDeCruces(c), 4);
  assert.deepEqual(c.jornadas[0], {
    numero: 1, fecha: '2026-09-20',
    partidos: [
      { orden: 1, local: 'C.D. Uno', visitante: 'C.D. Dos', codLocal: '101', codVisitante: '102' },
      { orden: 2, local: 'Atlético Tres "B"', visitante: 'U.D. Cuatro', codLocal: '103', codVisitante: '104' },
    ],
  });
  assert.equal(c.jornadas[1].fecha, '2026-09-27');
});

test('una jornada sin fecha publicada queda sin fecha, no con una inventada', () => {
  const c = calendarioDeHtml(jornada(5, null, [partido(A, B)]));
  assert.equal(c.jornadas[0].fecha, null);
  assert.equal(calendarioDeHtml(jornada(5, '31-02-2027', [partido(A, B)])).jornadas[0].fecha, null);
});

test('el equipo «Descansa» no es un partido', () => {
  const c = calendarioDeHtml(jornada(1, '20-09-2026', [partido(A, B), partido(C, [999, 'Descansa'])]));
  assert.deepEqual(c.problemas, []);
  assert.equal(totalDeCruces(c), 1);
});

test('un equipo dos veces en la misma jornada invalida esa jornada y lo dice', () => {
  const c = calendarioDeHtml(jornada(1, '20-09-2026', [partido(A, B), partido(A, C)]) + jornada(2, null, [partido(C, D)]));
  assert.equal(c.jornadas.length, 1);
  assert.equal(c.jornadas[0].numero, 2);
  assert.match(c.problemas[0], /jornada 1.*juega dos veces/);
});

test('un número impar de equipos enlazados se rechaza', () => {
  const c = calendarioDeHtml(`<td>Jornada 3</td>${equipo(...A)}${equipo(...B)}${equipo(...C)}`);
  assert.equal(c.jornadas.length, 0);
  assert.match(c.problemas[0], /impar/);
});

test('una página sin jornadas lo declara', () => {
  assert.match(calendarioDeHtml('<html><body></body></html>').problemas[0], /ninguna jornada/);
});
