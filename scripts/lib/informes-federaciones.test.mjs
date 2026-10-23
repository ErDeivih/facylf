import test from 'node:test';
import assert from 'node:assert/strict';
import { federacionesReales, federacionPedida, codigosParaSql, nombreFederacion, provinciaPublicada } from './informes-federaciones.mjs';

test('son las 19 territoriales de la configuración, con Castilla y León entre ellas', () => {
  const lista = federacionesReales();
  assert.equal(lista.length, 19);
  assert.ok(lista.some((f) => f.codigo === 'castilla-leon' && f.nombre === 'Castilla y León'));
});

test('una federación desconocida (p. ej. las de prueba del canónico) cae en la de por defecto', () => {
  assert.equal(federacionPedida('madrid'), 'madrid');
  assert.equal(federacionPedida('TODAS'), 'todas');
  assert.equal(federacionPedida('oro-pruebas'), 'castilla-leon');
  assert.equal(federacionPedida("x'; drop table core.person;--"), 'castilla-leon');
  assert.equal(federacionPedida(undefined), 'castilla-leon');
});

test('«todas» se traduce a las 19 y sus 5 provinciales, nunca a un comodín', () => {
  assert.equal(codigosParaSql('todas').length, 24);
  assert.deepEqual(codigosParaSql('cataluna'), ['cataluna']);
  assert.equal(nombreFederacion('valencia'), 'Comunitat Valenciana');
});

test('las provinciales cuentan dentro de su autonomía, y no salen sueltas en el selector', () => {
  assert.deepEqual(codigosParaSql('euskadi').sort(), ['araba', 'bizkaia', 'euskadi', 'gipuzkoa']);
  assert.deepEqual(codigosParaSql('canarias').sort(), ['canarias', 'laspalmas', 'tenerife']);
  assert.equal(federacionesReales().some((f) => f.codigo === 'bizkaia'), false);
  assert.equal(nombreFederacion('bizkaia'), 'Bizkaia (Euskadi)');
  assert.equal(federacionPedida('bizkaia'), 'castilla-leon', 'en pantalla se elige la autonomía');
});

test('la provincia sólo sale si el nombre del grupo la declara', () => {
  assert.equal(provinciaPublicada('Grupo Salamanca'), 'Salamanca');
  assert.equal(provinciaPublicada('Primera Cadete - LLEIDA'), 'Lleida');
  assert.equal(provinciaPublicada('Grupo Santa Cruz de Tenerife'), 'Santa Cruz de Tenerife');
  assert.equal(provinciaPublicada('Grupo A Coruña Norte'), 'A Coruña');
  assert.equal(provinciaPublicada('Grupo Leonés'), '', 'no confunde «Leonés» con León');
  assert.equal(provinciaPublicada('Grupo 1'), '');
});
