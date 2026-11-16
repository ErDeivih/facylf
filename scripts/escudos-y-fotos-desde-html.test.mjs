/*
 * Prueba de los dos parsers de `escudos-y-fotos-desde-html.mjs`.
 *
 * Se trabaja con trozos de HTML reales del portal (recortados): un bloque de equipo con su escudo y una
 * fila de jugador con la foto embebida en base64. Lo que se comprueba es lo que puede fallar en silencio:
 * que no se cuele un marcador genérico como si fuera una foto, y que el código de jugador sea el que
 * identifica a la persona (`jugador=`, no `cod_primaria=`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraeEscudos, extraeFotos, decodificaDataUri } from './escudos-y-fotos-desde-html.mjs';

const bloqueEquipo = `
<div class="wrapper_widget">
  <a href="NFG_Equipo?Codigo_Equipo=7639&amp;cod_primaria=1"><img src="/pnfg/img/escudos/7639.png"></a>
</div>
<div class="wrapper_widget">
  <a href="NFG_Equipo?Codigo_Equipo=7521"><img src="https://filesrfcylf.filesnovanet.es/x/escudo_sm_resultados_1.png"></a>
</div>`;

const filaJugador = `
<tr onclick="location.href='NFG_EstadisticasJugador?cod_primaria=3000328&amp;jugador=19821&amp;codacta=3134966';">
  <td>1</td>
  <td><img src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" class="fotojug"></td>
  <td>Alberto Garrosa</td>
</tr>
<tr onclick="location.href='NFG_EstadisticasJugador?cod_primaria=3000999&amp;jugador=20555&amp;codacta=3134966';">
  <td>2</td>
  <td><img src="https://filesrfcylf.filesnovanet.es/pnfg/img/web_responsive_2/ESP/retrato_licencia.jpg" class="fotojug"></td>
  <td>Manuel De Juan</td>
</tr>`;

test('los escudos salen del bloque del equipo y se descartan los marcadores', () => {
  const escudos = extraeEscudos(bloqueEquipo, 'https://www.rfcylf.es');
  assert.equal(escudos.size, 1, 'el escudo genérico de resultados no es un escudo de club');
  assert.equal(escudos.get('7639'), 'https://www.rfcylf.es/pnfg/img/escudos/7639.png');
});

test('las fotos salen embebidas y se asocian al código de jugador', () => {
  const fotos = extraeFotos(filaJugador);
  assert.equal(fotos.size, 1, 'el retrato de licencia es un marcador, no una foto');
  const foto = fotos.get('19821');
  assert.ok(foto, 'la clave es el código `jugador=`, no `cod_primaria=`');
  assert.match(foto.mime, /^image\//);
  assert.ok(foto.contenido.length > 0);
});

test('una imagen base64 se decodifica a bytes y conserva su tipo', () => {
  const { mime, contenido } = decodificaDataUri('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(mime, 'image/png');
  assert.equal(contenido.subarray(0, 4).toString('hex'), '89504e47');
});

test('sin fotos ni escudos no inventa nada', () => {
  assert.equal(extraeEscudos('<html></html>', 'https://x').size, 0);
  assert.equal(extraeFotos('<html></html>').size, 0);
});
