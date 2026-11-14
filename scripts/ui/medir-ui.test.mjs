#!/usr/bin/env node
// medir-ui.test.mjs — pruebas de las piezas puras del medidor de interfaz.
//
// El medidor real necesita Chrome y la foto servida; aquí se prueba lo que puede
// romperse sin navegador: nombres de captura, normalización de rutas, veredicto y
// construcción de la tabla resumen.
//
// Uso: node --test scripts/ui/medir-ui.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugDe, normalizarRutas, evaluarVeredicto, filaResumen, medirEnPagina } from './medir-ui.mjs';

test('slugDe genera nombres en minúsculas y sin tildes', () => {
  assert.equal(slugDe('/'), 'inicio');
  assert.equal(slugDe('/explorar'), 'explorar');
  assert.equal(slugDe('/explorar/competicion/2939'), 'explorar-competicion-2939');
  assert.equal(slugDe('/explorar/competicion/2939/jornada/6/'), 'explorar-competicion-2939-jornada-6');
  assert.equal(slugDe('/explorar/federacion/castilla-leon?x=1'), 'explorar-federacion-castilla-leon');
});

test('normalizarRutas limpia la lista de --rutas', () => {
  assert.deepEqual(normalizarRutas('/, /explorar ,, entrar'), ['/', '/explorar', '/entrar']);
  assert.deepEqual(normalizarRutas([]), []);
});

test('evaluarVeredicto cruza los tres criterios del encargo', () => {
  const medida = {
    primerContenido: { visible: true },
    scrollHorizontal: false,
    textosCortados: { total: 0 },
  };
  const veredicto = evaluarVeredicto(medida);
  assert.equal(veredicto.primerContenidoVisible, true);
  assert.equal(veredicto.sinScrollHorizontal, true);
  assert.equal(veredicto.sinTextoRecortado, true);
  assert.equal(veredicto.ok, true);

  const malo = evaluarVeredicto({
    primerContenido: { visible: false },
    scrollHorizontal: true,
    textosCortados: { total: 3 },
  });
  assert.equal(malo.ok, false);
  assert.equal(malo.primerContenidoVisible, false);
  assert.equal(malo.sinScrollHorizontal, false);
  assert.equal(malo.sinTextoRecortado, false);
});

test('un control tapado por una barra fija tumba el veredicto (fallo de Garmin/EntrenoLab)', () => {
  const medida = {
    primerContenido: { visible: true },
    scrollHorizontal: false,
    textosCortados: { total: 0 },
    controlesTapados: { total: 1, muestra: [{ selector: 'button.enviar', tapadoPor: 'footer.fijo' }] },
  };
  const veredicto = evaluarVeredicto(medida);
  assert.equal(veredicto.sinControlesTapados, false);
  assert.equal(veredicto.ok, false);
  assert.equal(filaResumen('/x', '390x844', medida).controlesTapados, 1);
});

test('evaluarVeredicto no inventa: sin primer contenido deja null', () => {
  const veredicto = evaluarVeredicto({
    primerContenido: null,
    scrollHorizontal: false,
    textosCortados: { total: 0 },
  });
  assert.equal(veredicto.primerContenidoVisible, null);
  assert.equal(veredicto.ok, false);
});

test('filaResumen produce una fila estable ruta × tamaño', () => {
  const fila = filaResumen(
    '/explorar',
    '390',
    {
      status: 200,
      bytesHtml: 49025,
      primerContenido: { y: 132, visible: true },
      scrollHorizontal: true,
      desbordan: [{ selector: 'table', ancho: 720, derecha: 742 }],
      textosCortados: { total: 2 },
      objetivosPequenos: { total: 14 },
      imagenesSinAlt: [{ selector: 'img.x', src: '/a.png' }],
      nodosDom: 830,
    },
  );
  assert.equal(fila.ruta, '/explorar');
  assert.equal(fila.tamano, '390');
  assert.equal(fila.scrollHorizontal, true);
  assert.equal(fila.textosCortados, 2);
  assert.equal(fila.nodosDom, 830);
  assert.equal(fila.veredicto.ok, false);
});

test('medirEnPagina es una función serializable para page.evaluate', () => {
  assert.equal(typeof medirEnPagina, 'function');
  assert.match(medirEnPagina.toString(), /scrollHorizontal/);
});
