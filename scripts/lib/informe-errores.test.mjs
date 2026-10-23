import test from 'node:test';
import assert from 'node:assert/strict';
import { InformeNoConsultable, paginaNoConsultable, respuestaDeError } from './informe-errores.mjs';

test('un equipo no consultable devuelve su código y su motivo, en HTML', () => {
  const r = respuestaDeError(new InformeNoConsultable({ status: 422, titulo: 'Temporada 2023-24 a medias', detalle: '7 de 26 partidos' }));
  assert.equal(r.status, 422);
  assert.match(r.html, /Temporada 2023-24 a medias/);
  assert.match(r.html, /7 de 26 partidos/);
  assert.match(r.html, /href="\/"/);
});

test('un error inesperado no filtra su mensaje interno (SQL, rutas, trazas)', () => {
  const r = respuestaDeError(new Error('relation core.secreta does not exist at C:\\Users\\x'));
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.html, /core\.secreta|C:\\\\Users/);
});

test('una dirección mal codificada es un 400, no un 500', () => {
  let error; try { decodeURIComponent('/equipo/%E0%A4%A'); } catch (e) { error = e; }
  assert.equal(respuestaDeError(error).status, 400);
});

test('el agotamiento de tiempo se distingue y se explica', () => {
  assert.equal(respuestaDeError(Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM' })).status, 504);
});

test('el texto de la fuente se escapa', () => {
  assert.doesNotMatch(paginaNoConsultable({ titulo: '<script>alert(1)</script>' }), /<script>alert/);
});
