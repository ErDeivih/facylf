import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparaConAnteriores, esErrorDeLaFuente, evaluaFederacion, evaluaMaquina } from './vigia-colas.mjs';

const AHORA = Date.parse('2026-10-22T10:00:00Z');
const ctx = { maquina: 'pc', ahora: AHORA, uptimeMin: 600, propias: new Set(['galicia', 'cataluna']) };
const sana = {
  federacion: 'galicia', portal: 'www.futgal.es', hosts24: { 'www.futgal.es': 4000 },
  ultimaPeticion: '2026-10-22T09:58:00Z', vencido: 1000, aplazado: 10,
  resultados1h: { ok: 400, error: 2 }, errores1hNuestros: 2, peticiones24: 4500, peticionesPorDia7: [4400, 4600, 4700, 4500, 4300, 4800],
  jornadasLeidas24: 300, jornadasVacias24: 3, jornadasConPartidos24: 280, jornadasSinActas24: 5,
};
const codigos = (xs) => xs.map((a) => a.codigo).sort();

test('una federación sana no da avisos', () => {
  assert.deepEqual(evaluaFederacion(sana, ctx), []);
});

test('el fallo del 21/10: peticiones a la web de otra federación → crítico', () => {
  const a = evaluaFederacion({ ...sana, hosts24: { 'www.futgal.es': 3000, 'www.rfcylf.es': 333 } }, ctx);
  assert.deepEqual(codigos(a), ['portal_ajeno']);
  assert.equal(a[0].nivel, 'critico');
  assert.match(a[0].texto, /www\.rfcylf\.es ×333/);
});

test('el fallo de Cataluña: casi todas las jornadas jugadas leídas vienen vacías → aviso', () => {
  const a = evaluaFederacion({ ...sana, federacion: 'cataluna', portal: 'www.fcf.cat', hosts24: { 'www.fcf.cat': 500 },
    jornadasLeidas24: 900, jornadasVacias24: 870 }, ctx);
  assert.deepEqual(codigos(a), ['lecturas_vacias']);
});

test('el fallo de la fecha: se leen partidos pero no dejan actas en cola → aviso', () => {
  const a = evaluaFederacion({ ...sana, jornadasConPartidos24: 500, jornadasSinActas24: 500 }, ctx);
  assert.deepEqual(codigos(a), ['sin_actas']);
});

test('parada: trabajo vencido, sin pausa y 3 h sin pedir; pero no si la máquina acaba de encenderse', () => {
  const m = { ...sana, ultimaPeticion: '2026-10-22T07:00:00Z' };
  assert.deepEqual(codigos(evaluaFederacion(m, ctx)), ['parada']);
  assert.deepEqual(codigos(evaluaFederacion(m, { ...ctx, uptimeMin: 10 })), []);
  // en pausa (por un 503 corto) no es «parada»
  assert.deepEqual(codigos(evaluaFederacion({ ...m, pausaHasta: '2026-10-22T11:00:00Z', pausaMotivo: 'HTTP 503' }, ctx)), []);
});

test('bloqueo: un 403 en la última hora o una pausa por 403/429 es crítico', () => {
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, resultados1h: { ok: 10, bloqueo: 1 } }, ctx)), ['bloqueo']);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, pausaHasta: '2026-10-29T00:00:00Z', pausaMotivo: 'HTTP 403 en …/api' }, ctx)), ['bloqueo']);
  // una pausa larga sin bloqueo es sólo aviso
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, pausaHasta: '2026-10-29T00:00:00Z', pausaMotivo: 'mantenimiento' }, ctx)), ['pausa_larga']);
});

test('errores: cuentan los nuestros, no los de la fuente', () => {
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, resultados1h: { ok: 20, error: 30 }, errores1hNuestros: 30, errorTop1h: 'timeout' }, ctx)), ['errores']);
  assert.equal(esErrorDeLaFuente('la página del acta viene vacía y el partido es de hace más de dos meses'), true);
  assert.equal(esErrorDeLaFuente('timeout: Timed out receiving message from renderer'), false);
});

test('ritmo hundido frente a la mediana de su semana', () => {
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, peticiones24: 900 }, ctx)), ['ritmo_bajo']);
});

test('una copia vieja de otra máquina sólo avisa si pide a otro portal', () => {
  const ajena = { ...sana, federacion: 'madrid', portal: 'www.rffm.es', hosts24: {}, ultimaPeticion: '2026-09-01T00:00:00Z' };
  assert.deepEqual(evaluaFederacion(ajena, ctx), []);
});

test('máquina: disco crítico y memoria baja', () => {
  assert.deepEqual(codigos(evaluaMaquina({ discoLibreGb: 3, memoriaLibreGb: 1 })), ['disco', 'memoria']);
});

test('nuevo, recordatorio cada 6 h y resuelto', () => {
  const a = [{ federacion: 'galicia', nivel: 'aviso', codigo: 'parada', texto: 'x' }];
  const r1 = comparaConAnteriores(a, {}, AHORA);
  assert.equal(r1.nuevos.length, 1);
  const r2 = comparaConAnteriores(a, r1.estado, AHORA + 3600e3);
  assert.equal(r2.nuevos.length + r2.recordar.length, 0);
  const r3 = comparaConAnteriores(a, r2.estado, AHORA + 7 * 3600e3);
  assert.equal(r3.recordar.length, 1);
  const r4 = comparaConAnteriores([], r3.estado, AHORA + 8 * 3600e3);
  assert.deepEqual(r4.resueltos.map((x) => x.codigo), ['parada']);
  assert.deepEqual(r4.estado, {});
});

test('calidad del lector: salto brusco de actas sin alineaciones frente a la semana', () => {
  const t = (m24) => ({ calidadPorTemporada: [{ etiqueta: '2026-27', n24: 400, m24, n7: 3000, m7: 300 }] });
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ...t(50) }, ctx)), []);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ...t(300) }, ctx)), ['calidad_actas']);
  // Una temporada vieja que empieza a leerse hoy (sin semana con la que comparar) no salta.
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, calidadPorTemporada: [{ etiqueta: '2022-23', n24: 1968, m24: 297, n7: 0, m7: 0 }] }, ctx)), []);
});

test('en el servidor (plazas por turnos) esperar unas horas no es «parada»; un día entero, sí', () => {
  const srv = { ...ctx, maquina: 'servidor' };
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ultimaPeticion: '2026-10-22T05:00:00Z' }, srv)), []);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ultimaPeticion: '2026-10-21T20:00:00Z' }, srv)), ['parada']);
});

test('casi todo «aún no publicado» de repente (la web cambió de maqueta) → aviso', () => {
  const sp = { sinPublicarPorDia7: [0.05, 0.04, 0.06, 0.05, 0.07, 0.05, 0.04] };
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ...sp, sinPublicar24: 0.08 }, ctx)), []);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, ...sp, sinPublicar24: 0.7 }, ctx)), ['sin_publicar_salto']);
});

test('resultados atrasados: la semana pasada sigue sin marcadores → aviso', () => {
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, semanaPasada: { jornadas: 200, sinResultados: 10 } }, ctx)), []);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, semanaPasada: { jornadas: 200, sinResultados: 150 } }, ctx)), ['resultados_atrasados']);
});

test('riqueza de las actas: avisa si tarjetas, cambios o códigos se hunden frente a su semana (y no al revés)', () => {
  const t = { etiqueta: '2026-27', n24: 200, tarj24: 120, camb24: 100, jug24: 7000, cod24: 7000, n7: 900, tarj7: 540, camb7: 450, jug7: 30000, cod7: 30000 };
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, riquezaPorTemporada: [t] }, ctx)), []);
  const rota = { ...t, tarj24: 2, cod24: 0 };
  const a = evaluaFederacion({ ...sana, riquezaPorTemporada: [rota] }, ctx);
  assert.deepEqual(codigos(a), ['riqueza_actas']);
  assert.match(a[0].texto, /tarjetas en el 1 %.*códigos de jugador en el 0 %/);
  // Cataluña el 22/10: antes 0 % y ahora mucho: es una mejora, no avisa.
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, riquezaPorTemporada: [{ ...t, tarj7: 0, camb7: 0, cod7: 0 }] }, ctx)), []);
  // Sin base suficiente no se juzga.
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, riquezaPorTemporada: [{ ...rota, n24: 10 }] }, ctx)), []);
});

test('calidad: si la subida viene de UNA sola competición (la fuente), no avisa; si son varias, sí', () => {
  const temporada = { etiqueta: '2025-26', n24: 200, m24: 150, n7: 400, m7: 40 };
  const comp = (c, n24, m24, n7, m7) => ({ etiqueta: '2025-26', c, nombre: `C${c}`, n24, m24, n7, m7 });
  const una = evaluaFederacion({ ...sana, calidadPorTemporada: [temporada],
    calidadPorCompeticion: [comp('1', 120, 119, 30, 2), comp('2', 80, 10, 370, 38)] }, ctx);
  assert.deepEqual(una.filter((a) => a.nivel !== 'info').map((a) => a.codigo), []);
  assert.ok(una.some((a) => a.codigo === 'calidad_una_competicion' && /C1: 119 de 120/.test(a.texto)));
  const varias = evaluaFederacion({ ...sana, calidadPorTemporada: [temporada],
    calidadPorCompeticion: [comp('1', 100, 75, 200, 20), comp('2', 100, 75, 200, 20)] }, ctx);
  assert.deepEqual(codigos(varias.filter((a) => a.nivel !== 'info')), ['calidad_actas']);
  // Sin detalle por competición (medida vieja), como antes.
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, calidadPorTemporada: [temporada] }, ctx)), ['calidad_actas']);
});

test('riqueza: una caída en una sola competición no avisa', () => {
  const t = { etiqueta: '2026-27', n24: 200, tarj24: 2, camb24: 100, jug24: 7000, cod24: 7000, n7: 900, tarj7: 540, camb7: 450, jug7: 30000, cod7: 30000 };
  const c = (id, tarj24) => ({ t: '22', c: id, n24: 100, tarj24, camb24: 50, jug24: 3500, cod24: 3500, n7: 450, tarj7: 270, camb7: 225, jug7: 15000, cod7: 15000 });
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, riquezaPorTemporada: [t], riquezaPorCompeticion: [c('1', 1), c('2', 60)] }, ctx)), []);
  assert.deepEqual(codigos(evaluaFederacion({ ...sana, riquezaPorTemporada: [t], riquezaPorCompeticion: [c('1', 1), c('2', 1)] }, ctx)), ['riqueza_actas']);
});
