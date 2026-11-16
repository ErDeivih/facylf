import { test } from 'node:test';
import assert from 'node:assert/strict';

import { banderasDeChrome, topeDeNavegadorMb, FUNCIONES_QUE_NO_SE_USAN } from './banderas-chrome.mjs';

/*
 * PRUEBAS DE LAS BANDERAS DE CHROME
 *
 * Defienden lo que se midió: que el navegador de un worker no vuelva a crecer a 36 renderers y 3 GB (las
 * banderas de aislamiento, que son las únicas que ahorran memoria de verdad) y que las funciones que no se
 * usan vayan en UNA sola bandera. Lo que se probó y NO sirvió (techo del montón de V8 y servicios
 * auxiliares) está documentado en el módulo y no se vuelve a meter sin una medición que lo justifique.
 */

test('las banderas de aislamiento están presentes (sin ellas el navegador se dispara a 3 GB)', () => {
  const banderas = banderasDeChrome({ variante: 'pnfg', perfil: 'C:\\perfil', identidad: 'FacylfBot/1.0 (contacto: x)' });
  assert.ok(banderas.includes('--disable-site-isolation-trials'));
  assert.ok(banderas.includes('--process-per-site'));
  assert.ok(banderas.includes('--renderer-process-limit=1'));
  assert.ok(banderas.includes('--blink-settings=imagesEnabled=false'));
});

test('las funciones desactivadas van en una sola bandera y sin colar las que no sirven', () => {
  const banderas = banderasDeChrome({ variante: 'pnfg' });
  const desactivadoras = banderas.filter((b) => b.startsWith('--disable-features='));
  assert.equal(desactivadoras.length, 1, 'repetir --disable-features perdería las anteriores');
  const funciones = desactivadoras[0].replace('--disable-features=', '').split(',');
  for (const funcion of FUNCIONES_QUE_NO_SE_USAN) assert.ok(funciones.includes(funcion), `falta ${funcion}`);
  // Las del aislamiento de sitios son las que ya estaban: no se pueden perder por el camino.
  assert.ok(funciones.includes('IsolateOrigins') && funciones.includes('site-per-process'));
  // Y no se cuelan las que se probaron sin ningún ahorro medible (21/09/2026).
  for (const inutil of ['AudioServiceOutOfProcess', 'MediaRouter', 'Translate', 'OptimizationHints']) {
    assert.equal(funciones.includes(inutil), false, `${inutil} no aporta nada: no debe volver sin medirlo`);
  }
  // Tampoco el techo del montón de V8, que no ahorró memoria en el A/B.
  assert.equal(banderas.some((b) => b.startsWith('--js-flags=')), false);
});

test('la identidad y el perfil de cada federación llegan al navegador', () => {
  const banderas = banderasDeChrome({ variante: 'pnfg', perfil: 'F:\\facylf\\descargas-murcia\\recolector-local\\perfil-chrome', identidad: 'FacylfBot/1.0 (contacto: x)' });
  assert.ok(banderas.includes('--user-data-dir=F:\\facylf\\descargas-murcia\\recolector-local\\perfil-chrome'));
  assert.ok(banderas.includes('--user-agent=FacylfBot/1.0 (contacto: x)'));
  // Y si no hay perfil ni identidad (casos de prueba), no se inventan.
  const sinDatos = banderasDeChrome({ variante: 'pnfg' });
  assert.equal(sinDatos.some((b) => b.startsWith('--user-data-dir=')), false);
  assert.equal(sinDatos.some((b) => b.startsWith('--user-agent=')), false);
});

test('en el PC la ventana se abre fuera de la vista; dentro de Docker, sin cabeza', () => {
  const enPc = banderasDeChrome({ variante: 'pnfg' });
  assert.ok(enPc.includes('--window-position=-32000,-32000'));
  assert.equal(enPc.some((b) => b.startsWith('--headless')), false);

  const enDocker = banderasDeChrome({ variante: 'pnfg', headless: true });
  assert.ok(enDocker.includes('--headless=new'));
  assert.ok(enDocker.includes('--disable-dev-shm-usage'));
  assert.equal(enDocker.includes('--window-position=-32000,-32000'), false);
});

test('Cataluña sigue con su ventana grande, su idioma y sin cabeza', () => {
  const banderas = banderasDeChrome({ variante: 'cataluna', lang: 'ca-ES' });
  assert.ok(banderas.includes('--headless=new'));
  assert.ok(banderas.includes('--window-size=1600,1600'));
  assert.ok(banderas.includes('--lang=ca-ES'));
  assert.ok(banderas.includes('--disable-site-isolation-trials'));
});

test('el techo de reciclado sólo cambia si el valor es un número positivo', () => {
  assert.equal(topeDeNavegadorMb('550'), 550);
  assert.equal(topeDeNavegadorMb(400), 400);
  assert.equal(topeDeNavegadorMb(undefined), 900);
  assert.equal(topeDeNavegadorMb(''), 900);
  assert.equal(topeDeNavegadorMb('no es un número'), 900);
  assert.equal(topeDeNavegadorMb('0'), 900);
  assert.equal(topeDeNavegadorMb('-10'), 900);
});

/*
 * Prueba del interruptor de GPU (16/11/2026): el servidor pinta las páginas 3 veces más lento que el PC.
 * Con `FACYLF_SIN_GPU=0` se dejan de apagar GPU, rasterizado por software y el límite de un renderer, para
 * medir si el hueco es de renderizado. Por defecto NO cambia nada.
 */
test('por defecto se apaga la GPU, como siempre', async () => {
  delete process.env.FACYLF_SIN_GPU;
  const { banderasDeChrome } = await import('./banderas-chrome.mjs');
  const banderas = banderasDeChrome({ variante: 'pnfg', headless: true });
  assert.ok(banderas.includes('--disable-gpu'));
  assert.ok(banderas.includes('--renderer-process-limit=1'));
});

test('con FACYLF_SIN_GPU=0 se deja la GPU y el renderer sin límite', async () => {
  process.env.FACYLF_SIN_GPU = '0';
  const { banderasDeChrome } = await import('./banderas-chrome.mjs');
  const banderas = banderasDeChrome({ variante: 'pnfg', headless: true });
  assert.ok(!banderas.includes('--disable-gpu'), 'no debe apagar la GPU');
  assert.ok(!banderas.includes('--renderer-process-limit=1'), 'no debe limitar el renderer');
  delete process.env.FACYLF_SIN_GPU;
});
