/*
 * Pruebas de la decisión «la pestaña de clasificación no trae tabla» (Cataluña).
 *
 * El caso real que las motivó: 236 fallos en dos días contra grupos de la temporada recién empezada, cuyo primer
 * partido aún no se había jugado, y que acababan descartados tras tres intentos.
 *
 * Se ejecuta con:  node --test scripts/lib/clasificacion-cataluna.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideClasificacionSinTabla, MENSAJE_CALENDARIO_SIN_LEER, MENSAJE_FORMATO, MENSAJE_SIN_PUBLICAR,
} from './clasificacion-cataluna.mjs';

test('un grupo que todavía no ha jugado no es un error: la federación no publica clasificación', () => {
  // Es el caso de la primera jornada: la pestaña existe, se pulsa, y no hay tabla porque no hay nada que clasificar.
  const d = decideClasificacionSinTabla({ partidosConocidos: 8, partidosJugados: 0 });
  assert.equal(d.clase, 'sin-publicar');
  assert.equal(d.publicacion, true, 'se trata como publicación pendiente, no como fallo');
  assert.equal(d.mensaje, MENSAJE_SIN_PUBLICAR);
});

test('si el grupo ya ha jugado, la tabla tiene que estar: eso sí es un problema', () => {
  // Aquí sí hay que enterarse: hay resultados y la federación no pinta la tabla (maquetación nueva, un fallo…).
  const d = decideClasificacionSinTabla({ partidosConocidos: 8, partidosJugados: 3 });
  assert.equal(d.clase, 'formato');
  assert.equal(d.publicacion, false, 'no se puede esconder como «sin publicar»');
  assert.equal(d.mensaje, MENSAJE_FORMATO);
});

test('sin el calendario leído no se puede saber, así que no se llama error', () => {
  // Ni se descarta el trabajo ni se asegura que sea un fallo de formato: se reintenta y, cuando el calendario esté
  // leído, la próxima vuelta dará una respuesta de verdad.
  const d = decideClasificacionSinTabla({ partidosConocidos: 0, partidosJugados: 0 });
  assert.equal(d.clase, 'calendario-sin-leer');
  assert.equal(d.publicacion, true);
  assert.equal(d.mensaje, MENSAJE_CALENDARIO_SIN_LEER);
});

test('los datos que falten o vengan raros no cambian la respuesta de forma peligrosa', () => {
  // Un `undefined` no puede convertirse en un «ya ha jugado» que dispare un error, ni en un descarte.
  for (const datos of [undefined, {}, { partidosConocidos: null, partidosJugados: null }]) {
    const d = decideClasificacionSinTabla(datos);
    assert.equal(d.clase, 'calendario-sin-leer');
    assert.equal(d.publicacion, true);
  }
  // Y un jugado positivo manda sobre cualquier otra cosa.
  assert.equal(decideClasificacionSinTabla({ partidosConocidos: 0, partidosJugados: 1 }).clase, 'formato');
});
