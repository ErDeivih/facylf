import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretaCabeceraJornadaFcf, jornadasTodasIguales } from './calendario-cataluna.mjs';

test('lee la cabecera actual de la FCF, con la fecha en el mismo nodo', () => {
  assert.deepEqual(interpretaCabeceraJornadaFcf('JORNADA 1 2025-09-20'), {
    numero: 1,
    fecha: '2025-09-20',
  });
});

test('sigue aceptando la maqueta anterior sin fecha y espacios variables', () => {
  assert.deepEqual(interpretaCabeceraJornadaFcf('  JORNADA   30  '), { numero: 30, fecha: null });
});

test('no confunde botones, resultados u otros textos con una cabecera', () => {
  for (const texto of ['30', 'RESULTATS', 'PROPERA JORNADA 2', '', null]) {
    assert.equal(interpretaCabeceraJornadaFcf(texto), null);
  }
});

/* ── La huella del defecto de copia ─────────────────────────────────────────────────────────────────── */

const jornada = (numero, partidos) => ({
  numero,
  fecha: '2026-09-19',
  partidos: partidos.map(([local, visitante]) => ({ local, visitante })),
});

test('detecta un calendario donde todas las jornadas traen las mismas parejas', () => {
  // El caso real: 30 jornadas y sólo 8 parejas, el mismo bloque repetido (grupo 58161868).
  const parejas = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J'], ['K', 'L'], ['M', 'N'], ['O', 'P']];
  const jornadas = Array.from({ length: 30 }, (_, i) => jornada(i + 1, parejas));
  assert.equal(jornadasTodasIguales(jornadas), true);
});

test('una ida y una vuelta NO son la misma jornada, aunque jueguen los mismos equipos', () => {
  // Este caso es el que destapó el error de la primera versión: ordenaba los nombres y la vuelta parecía
  // la ida. Medido el 24/09/2026: 434 grupos de fuera de Cataluña salían como «imposibles» sin serlo.
  const ida = jornada(1, [['A', 'B'], ['C', 'D']]);
  const vuelta = jornada(2, [['B', 'A'], ['D', 'C']]);
  assert.equal(jornadasTodasIguales([ida, vuelta]), false);
});

test('pero repetir el lado SÍ es la misma jornada: es el defecto de copia', () => {
  const a = jornada(1, [['A', 'B'], ['C', 'D']]);
  const b = jornada(2, [['A', 'B'], ['C', 'D']]);
  assert.equal(jornadasTodasIguales([a, b]), true);
});

test('un calendario de verdad NO se marca: cada jornada empareja distinto', () => {
  const jornadas = [jornada(1, [['A', 'B'], ['C', 'D']]), jornada(2, [['A', 'C'], ['B', 'D']]), jornada(3, [['A', 'D'], ['B', 'C']])];
  assert.equal(jornadasTodasIguales(jornadas), false);
});

test('una sola jornada publicada no es una repetición', () => {
  assert.equal(jornadasTodasIguales([jornada(1, [['A', 'B']])]), false);
  assert.equal(jornadasTodasIguales([]), false);
  assert.equal(jornadasTodasIguales(null), false);
});

test('las jornadas vacías no cuentan para decidir: un grupo a medio publicar es normal', () => {
  // Sólo dos jornadas tienen partidos y son distintas: no hay repetición aunque las demás estén vacías.
  const jornadas = [jornada(1, [['A', 'B']]), jornada(2, []), jornada(3, [['A', 'C']]), jornada(4, [])];
  assert.equal(jornadasTodasIguales(jornadas), false);
});

test('las jornadas vacías tampoco tapan la repetición de las que sí traen partidos', () => {
  const jornadas = [jornada(1, [['A', 'B']]), jornada(2, []), jornada(3, [['A', 'B']]), jornada(4, [])];
  assert.equal(jornadasTodasIguales(jornadas), true);
});

/* ── Jornadas ya jugadas que vienen vacías (20/10/2026) ─────────────────────────────────────────────── */
import { calendarioIncompleto } from './calendario-cataluna.mjs';

test('29 jornadas jugadas vacías y sólo la última llena es un calendario INCOMPLETO', () => {
  const jornadas = Array.from({ length: 30 }, (_, i) => ({
    numero: i + 1, fecha: `2026-0${1 + Math.floor(i / 6)}-1${i % 6}`, partidos: i === 29 ? [{ local: 'A', visitante: 'B' }] : [],
  }));
  const r = calendarioIncompleto(jornadas, '2026-10-20');
  assert.equal(r.jugadas, 30);
  assert.equal(r.vacias, 29);
  assert.equal(r.incompleto, true);
});

test('las jornadas futuras vacías no cuentan, y una jugada vacía suelta se tolera', () => {
  const llena = [{ local: 'A', visitante: 'B' }];
  const jornadas = [
    { numero: 1, fecha: '2026-09-20', partidos: llena },
    { numero: 2, fecha: '2026-09-27', partidos: [] },
    { numero: 3, fecha: '2026-10-04', partidos: llena },
    { numero: 4, fecha: '2026-11-01', partidos: [] },
    { numero: 5, fecha: null, partidos: [] },
  ];
  const r = calendarioIncompleto(jornadas, '2026-10-20');
  assert.equal(r.jugadas, 3);
  assert.equal(r.vacias, 1);
  assert.equal(r.incompleto, false);
});
