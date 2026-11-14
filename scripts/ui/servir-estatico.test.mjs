#!/usr/bin/env node
// servir-estatico.test.mjs — pruebas de integración del servidor estático.
//
// Levanta `servir-estatico.mjs` en un puerto libre y comprueba con fetch lo que exige
// la evidencia «antes»: la foto se sirve tal cual, con prefijo `/fondo-popular-demo/`,
// con las fuentes sin prefijo y con el PNG sin extensión.
//
// Uso: node --test scripts/ui/servir-estatico.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ_PROYECTO = resolve(AQUI, '..', '..');
const RAIZ_FOTO = join(RAIZ_PROYECTO, 'tmp', 'site-pages');
const PUERTO = 4399;
const BASE = `http://127.0.0.1:${PUERTO}`;

let servidor = null;

function primeroDe(dir, extension) {
  const archivo = readdirSync(dir).find((nombre) => nombre.endsWith(extension));
  return archivo ? join(dir, archivo) : null;
}

async function esperarServidor() {
  for (let intento = 0; intento < 60; intento++) {
    try {
      const respuesta = await fetch(`${BASE}/__estado`);
      if (respuesta.ok) return;
    } catch {
      // todavía arrancando
    }
    await new Promise((listo) => setTimeout(listo, 150));
  }
  throw new Error('El servidor estático no arrancó a tiempo');
}

before(async () => {
  servidor = spawn(process.execPath, [join(AQUI, 'servir-estatico.mjs'), '--puerto', String(PUERTO), '--silencioso'], {
    cwd: RAIZ_PROYECTO,
    stdio: 'ignore',
  });
  await esperarServidor();
});

after(() => {
  if (servidor) servidor.kill();
});

async function pedir(ruta) {
  const respuesta = await fetch(`${BASE}${ruta}`);
  return { respuesta, cuerpo: Buffer.from(await respuesta.arrayBuffer()) };
}

test('sirve la portada con el prefijo de la foto y en la raíz', async () => {
  const conPrefijo = await pedir('/fondo-popular-demo/');
  assert.equal(conPrefijo.respuesta.status, 200);
  assert.match(conPrefijo.respuesta.headers.get('content-type') || '', /text\/html/);
  assert.ok(conPrefijo.cuerpo.length > 10000, `HTML pequeño: ${conPrefijo.cuerpo.length} B`);
  assert.match(conPrefijo.cuerpo.toString('utf8'), /<main/);

  const enRaiz = await pedir('/');
  assert.equal(enRaiz.respuesta.status, 200);
  assert.equal(enRaiz.cuerpo.length, conPrefijo.cuerpo.length);
});

test('sirve una ruta de exportación de Next sin barra final', async () => {
  const { respuesta, cuerpo } = await pedir('/fondo-popular-demo/explorar/competiciones');
  assert.equal(respuesta.status, 200);
  assert.ok(cuerpo.length > 1000);
  assert.match(cuerpo.toString('utf8'), /<main/);
});

test('sirve el CSS de _next con y sin prefijo', async () => {
  const css = primeroDe(join(RAIZ_FOTO, '_next', 'static', 'css'), '.css');
  assert.ok(css, 'La foto no tiene CSS en _next/static/css');
  const nombre = css.split(/[\\/]/).pop();
  for (const ruta of [`/fondo-popular-demo/_next/static/css/${nombre}`, `/_next/static/css/${nombre}`]) {
    const { respuesta, cuerpo } = await pedir(ruta);
    assert.equal(respuesta.status, 200, `${ruta} debería devolver 200`);
    assert.match(respuesta.headers.get('content-type') || '', /text\/css/);
    assert.ok(cuerpo.length > 10000);
  }
});

test('sirve una fuente de _next/static/media (el CSS la pide sin prefijo)', async () => {
  const archivos = readdirSync(join(RAIZ_FOTO, '_next', 'static', 'media'));
  const fuente = archivos.find((nombre) => nombre.endsWith('.woff2'));
  assert.ok(fuente, 'La foto no tiene fuentes woff2');
  const { respuesta } = await pedir(`/_next/static/media/${fuente}`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') || '', /font\/woff2/);
});

test('sirve un escudo PNG con prefijo', async () => {
  const escudo = primeroDe(join(RAIZ_FOTO, 'escudos'), '.png');
  assert.ok(escudo, 'La foto no tiene escudos');
  const nombre = escudo.split(/[\\/]/).pop();
  const { respuesta, cuerpo } = await pedir(`/fondo-popular-demo/escudos/${nombre}`);
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') || '', /image\/png/);
  assert.deepEqual([...cuerpo.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('adivina image/png en el escudo de federación sin extensión', async () => {
  const archivo = join(RAIZ_FOTO, 'escudos-fed', 'castilla-leon');
  const { respuesta, cuerpo } = await pedir('/fondo-popular-demo/escudos-fed/castilla-leon');
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type') || '', /image\/png/);
  assert.deepEqual([...cuerpo.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.ok(archivo.length > 0);
});

test('devuelve 404 con la página de la foto y lo cuenta en /__estado', async () => {
  await fetch(`${BASE}/__reiniciar`);
  const { respuesta, cuerpo } = await pedir('/fondo-popular-demo/no-existe-esta-ruta');
  assert.equal(respuesta.status, 404);
  assert.match(cuerpo.toString('utf8'), /no est/i);
  const estado = await (await fetch(`${BASE}/__estado`)).json();
  assert.equal(estado.noEncontradas, 1);
  assert.equal(estado.rutas404[0].ruta, '/fondo-popular-demo/no-existe-esta-ruta');
});

test('rechaza rutas que intentan salir del directorio', async () => {
  const { respuesta } = await pedir('/fondo-popular-demo/..%2f..%2fpackage.json');
  assert.equal(respuesta.status, 404);
});
