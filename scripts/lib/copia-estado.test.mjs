/*
 * Pruebas de la lista de ficheros de estado del traspaso (`listaDeEstado`).
 *
 * Lo que se protege: que el traspaso rápido lleve TODO lo que el worker necesita para arrancar (el catálogo)
 * y NADA del archivo de evidencia (que pesa cientos de veces más), y que no se cuele la cola —que se copia por
 * instantánea, no como fichero suelto— ni el registro del PC, que pisaría el del servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { listaDeEstado } from './copia-estado.mjs';

/** Disco de mentira: se declara qué existe y qué cuelga de cada carpeta. */
function discoFalso({ ficheros = [], carpetas = [], directorios = [] }) {
  const existentes = new Set([...ficheros, ...carpetas]);
  const hijos = new Map();
  for (const f of ficheros) {
    const i = f.lastIndexOf('/');
    const padre = i < 0 ? '' : f.slice(0, i);
    if (!hijos.has(padre)) hijos.set(padre, []);
    hijos.get(padre).push(f.slice(i + 1));
  }
  for (const c of carpetas) {
    const i = c.lastIndexOf('/');
    const padre = i < 0 ? '' : c.slice(0, i);
    if (!hijos.has(padre)) hijos.set(padre, []);
    hijos.get(padre).push(c.slice(i + 1));
  }
  return {
    existe: (p) => existentes.has(p.replace(/\\/g, '/')),
    listar: (p) => hijos.get(p.replace(/\\/g, '/')) ?? [],
    esDirectorio: (p) => directorios.includes(p.replace(/\\/g, '/')),
  };
}

const RAIZ = '/proyecto';

test('el traspaso rápido lleva el catálogo y el estado, y deja fuera el archivo', () => {
  const fs = discoFalso({
    carpetas: ['/proyecto/descargas-murcia', '/proyecto/descargas-murcia/recolector-local'],
    ficheros: [
      '/proyecto/descargas-murcia/competiciones-por-temporada.json',
      '/proyecto/descargas-murcia/recolector-local/temporadas.json',
      '/proyecto/descargas-murcia/recolector-local/inventario-codigos.json.gz',
      '/proyecto/descargas-murcia/recolector-local/cola-v2.sqlite',
      '/proyecto/descargas-murcia/recolector-local/cola-v2.sqlite-wal',
      '/proyecto/descargas-murcia/recolector-local/worker-programado.log',
      '/proyecto/descargas-murcia/recolector-local/t22-2026-27/acta-1.gz',
    ],
    directorios: ['/proyecto/descargas-murcia/recolector-local/perfil-chrome',
      '/proyecto/descargas-murcia/recolector-local/t22-2026-27'],
  });

  const rutas = listaDeEstado(RAIZ, 'murcia', fs);

  assert.ok(rutas.includes('descargas-murcia/competiciones-por-temporada.json'),
    'sin el catálogo el worker no arranca: tiene que ir en la pasada rápida');
  assert.ok(rutas.includes('descargas-murcia/recolector-local/temporadas.json'));
  assert.ok(rutas.includes('descargas-murcia/recolector-local/inventario-codigos.json.gz'));

  assert.ok(!rutas.some((r) => r.includes('cola-v2.sqlite')),
    'la cola va por instantánea coherente (VACUUM INTO), no como fichero suelto');
  assert.ok(!rutas.some((r) => r.endsWith('.log')),
    'el registro es del PC; copiarlo pisaría el del servidor');
  assert.ok(!rutas.some((r) => r.includes('perfil-chrome')), 'la caché del navegador no se copia nunca');
  assert.ok(!rutas.some((r) => r.includes('t22-2026-27')),
    'el archivo de evidencia se sincroniza en la pasada lenta, no en esta');
});

test('una federación sin estado no revienta: devuelve lo que haya', () => {
  const vacio = discoFalso({});
  assert.deepEqual(listaDeEstado(RAIZ, 'inexistente', vacio), []);

  const soloCarpeta = discoFalso({ carpetas: ['/proyecto/descargas-rioja'] });
  assert.deepEqual(listaDeEstado(RAIZ, 'rioja', soloCarpeta), []);
});

test('`rechazadas` sólo entra si es una carpeta de verdad', () => {
  const conCarpeta = discoFalso({
    carpetas: ['/proyecto/descargas-murcia/recolector-local'],
    ficheros: ['/proyecto/descargas-murcia/recolector-local/rechazadas'],
    directorios: ['/proyecto/descargas-murcia/recolector-local/rechazadas'],
  });
  assert.ok(listaDeEstado(RAIZ, 'murcia', conCarpeta)
    .includes('descargas-murcia/recolector-local/rechazadas'));

  const comoFichero = discoFalso({
    carpetas: ['/proyecto/descargas-murcia/recolector-local'],
    ficheros: ['/proyecto/descargas-murcia/recolector-local/rechazadas'],
  });
  assert.ok(!listaDeEstado(RAIZ, 'murcia', comoFichero)
    .includes('descargas-murcia/recolector-local/rechazadas'));
});

test('la lista sale ordenada y sin repetidos', () => {
  const fs = discoFalso({
    carpetas: ['/proyecto/descargas-galicia', '/proyecto/descargas-galicia/recolector-local'],
    ficheros: [
      '/proyecto/descargas-galicia/competiciones-por-temporada.json',
      '/proyecto/descargas-galicia/recolector-local/temporadas.json',
      '/proyecto/descargas-galicia/recolector-local/inventario-codigos.json.gz',
    ],
  });
  const rutas = listaDeEstado(RAIZ, 'galicia', fs);
  assert.deepEqual(rutas, [...rutas].sort());
  assert.equal(new Set(rutas).size, rutas.length);
});
