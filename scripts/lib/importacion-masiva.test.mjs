import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ordenaTemporadas, ordenaUnidades, claveDeUnidad, esIncidenciaQueAparta,
  unidadesPendientes, resumenDeImportacion, textoDeApartado,
} from './importacion-masiva.mjs';

/*
 * PRUEBAS DE LA IMPORTACIÓN MASIVA
 *
 * Lo que defienden: que lo reciente y con más actas entre primero (para poder usar la plataforma cuanto antes),
 * que lo ya importado no se repita, que la incidencia conocida del calendario y el acta —los 242 partidos que
 * hoy detienen el lote— aparte la unidad SIN parar la importación, y que un fallo distinto NO se confunda con
 * esa incidencia (apartar por error una unidad buena sería perder datos de vista).
 */

const unidad = (federacion, temporada, grupo, actas) => ({ federacion, temporada, grupo, actas });

test('Castilla y León abre la tanda aunque otras federaciones tengan más actas', () => {
  const orden = ordenaUnidades([
    unidad('andalucia', '2026-27', 'g1', 300),
    unidad('castilla-leon', '2024-25', 'g2', 8),
    unidad('castilla-leon', '2026-27', 'g3', 12),
  ]);
  assert.deepEqual(orden.map((u) => u.grupo), ['g3', 'g2', 'g1']);
});

test('lo reciente va primero', () => {
  // El comparador devuelve la diferencia de años (sirve para ordenar, no para comparar con −1 exacto).
  assert.ok(ordenaTemporadas('2026-27', '2025-26') < 0, '2026-27 antes que 2025-26');
  assert.ok(ordenaTemporadas('2024-25', '2015-16') < 0);
  assert.ok(ordenaTemporadas('2015-16', '2024-25') > 0, 'y al revés, después');
  assert.equal(ordenaTemporadas('2025-26', '2025-26'), 0);
  assert.ok(ordenaTemporadas('sin fecha', '2015-16') > 0, 'lo que no se entiende va al final');
});

test('a igual temporada, primero el grupo con más actas', () => {
  const orden = ordenaUnidades([
    unidad('murcia', '2025-26', 'g1', 10),
    unidad('murcia', '2025-26', 'g2', 300),
    unidad('navarra', '2026-27', 'g3', 5),
  ]);
  assert.deepEqual(orden.map((u) => u.grupo), ['g3', 'g2', 'g1']);
});

test('la clave de una unidad es siempre la misma forma', () => {
  assert.equal(claveDeUnidad(unidad('murcia', '2025-26', 'g1', 0)), 'murcia|2025-26|g1');
});

test('se apartan los dos motivos que necesitan revisión, y sólo esos', () => {
  // La incidencia del calendario y el acta (los 242 del informe).
  assert.equal(esIncidenciaQueAparta('242 partidos donde el calendario y el acta no comparten ningún equipo'), true);
  assert.equal(esIncidenciaQueAparta('CALENDARIO y ACTA sin equipos en comun'), true);
  // Y el rechazo de validación medido el 21/09/2026 con el grupo 22841470 de Navarra.
  assert.equal(esIncidenciaQueAparta('✗ La validación del lote 2452 ha fallado: actas analizadas 27≠18, '
    + 'participaciones 1031≠685, eventos 766≠504, técnicos 207≠134'), true);
  // Un fallo pasajero NO se aparta: se reintenta.
  assert.equal(esIncidenciaQueAparta('terminado en timeout'), false);
  assert.equal(esIncidenciaQueAparta('connection refused'), false);
  assert.equal(esIncidenciaQueAparta(''), false);
  assert.equal(esIncidenciaQueAparta(undefined), false);
});

test('lo apartado se puede volver a poner en la cola cuando el motivo ya está arreglado', () => {
  const unidades = [unidad('navarra', '2026-27', 'g1', 10)];
  const estado = { apartados: { 'navarra|2026-27|g1': { motivo: 'validación del lote' } } };
  assert.equal(unidadesPendientes(unidades, estado).length, 0, 'por defecto no se reintenta');
  assert.equal(unidadesPendientes(unidades, estado, { reintentarApartados: true }).length, 1);
});

test('lo hecho y lo apartado no se vuelve a pedir; los fallos se reintentan con tope', () => {
  const unidades = [
    unidad('murcia', '2025-26', 'hecho', 10),
    unidad('murcia', '2025-26', 'apartado', 10),
    unidad('murcia', '2025-26', 'fallado', 10),
    unidad('murcia', '2025-26', 'nuevo', 10),
  ];
  const estado = {
    hechos: { 'murcia|2025-26|hecho': { filas: 100 } },
    apartados: { 'murcia|2025-26|apartado': { motivo: 'sin equipos en común' } },
    fallos: { 'murcia|2025-26|fallado': { intentos: 1 } },
  };
  const pendientes = unidadesPendientes(unidades, estado).map((u) => u.grupo).sort();
  assert.deepEqual(pendientes, ['fallado', 'nuevo']);

  // Y con los intentos agotados, tampoco.
  const agotado = { ...estado, fallos: { 'murcia|2025-26|fallado': { intentos: 3 } } };
  assert.deepEqual(unidadesPendientes(unidades, agotado).map((u) => u.grupo), ['nuevo']);
});

test('el resumen cuenta unidades, filas y lo que queda', () => {
  const unidades = [1, 2, 3, 4, 5].map((n) => unidad('f', '2025-26', `g${n}`, n));
  const resumen = resumenDeImportacion({
    hechos: { 'f|2025-26|g1': { filas: 1000 }, 'f|2025-26|g2': { filas: 500 } },
    apartados: { 'f|2025-26|g3': { motivo: 'sin equipos en común' } },
    fallos: {},
    actualizado: '2026-09-21T18:00:00.000Z',
  }, unidades);
  assert.equal(resumen.unidades, 5);
  assert.equal(resumen.hechas, 2);
  assert.equal(resumen.apartadas, 1);
  assert.equal(resumen.pendientes, 2);
  assert.equal(resumen.filasImportadas, 1500);
});

test('el aviso de una unidad apartada dice cuál y por qué', () => {
  const texto = textoDeApartado(unidad('euskadi', '2025-26', '1234', 10), 'calendario y acta sin equipos en común');
  assert.match(texto, /euskadi\|2025-26\|1234/);
  assert.match(texto, /sin equipos en común/);
});
