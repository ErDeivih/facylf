/*
 * Pruebas de la lista de ficheros de estado del traspaso (`listaDeEstado`).
 *
 * Lo que se protege: que el traspaso rápido lleve TODO lo que el worker necesita para arrancar (el catálogo)
 * y NADA del archivo de evidencia (que pesa cientos de veces más), y que no se cuele la cola —que se copia por
 * instantánea, no como fichero suelto— ni el registro del PC, que pisaría el del servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { listaDeEstado, veredictoDeIntegridad, decisionDeCopia } from './copia-estado.mjs';

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

/*
 * ── LA VERIFICACIÓN DE INTEGRIDAD ────────────────────────────────────────────────────────────────────────
 *
 * Estas pruebas fijan el caso real del 21/09/2026: la cola de Galicia copiada encima de una carpeta con el
 * `-wal` de la sesión anterior del contenedor. El tamaño del fichero cuadraba —la verificación vieja decía
 * «verificada»— y la base estaba ilegible. Si esto no distingue «íntegra» de «malformed», el traspaso vuelve
 * a dar por bueno un dato que no se puede abrir.
 */
test('una cola con el diario de otra sesión NO se da por buena', () => {
  const salida = 'abriendo /datos/descargas-galicia/recolector-local/cola-v2.sqlite\n'
    + 'Error: database disk image is malformed\n'
    + "    errcode: 11,\n    errstr: 'database disk image is malformed'";
  const veredicto = veredictoDeIntegridad(salida);
  assert.equal(veredicto.ok, false, 'una base malformed no puede pasar la verificación');
  assert.match(veredicto.motivo, /malformed/);
});

test('una cola que no abre tampoco se da por buena', () => {
  const veredicto = veredictoDeIntegridad('NO ABRE: unable to open database file');
  assert.equal(veredicto.ok, false);
  assert.match(veredicto.motivo, /unable to open/);
});

test('una salida vacía es un fallo, no un aprobado', () => {
  const veredicto = veredictoDeIntegridad('');
  assert.equal(veredicto.ok, false);
  assert.equal(veredicto.motivo, 'sin salida de la comprobación');
});

test('una cola íntegra pasa, y deja ver el trabajo que trae', () => {
  const veredicto = veredictoDeIntegridad('integridad=ok  peticiones=418779  pendientes=47941');
  assert.deepEqual(veredicto, { ok: true, motivo: 'íntegra', peticiones: 418779, pendientes: 47941 });
});

test('un `integrity_check` que devuelve otra cosa que ok no pasa', () => {
  const veredicto = veredictoDeIntegridad('integridad=*** in database main ***  peticiones=10  pendientes=2');
  assert.equal(veredicto.ok, false);
  assert.match(veredicto.motivo, /integridad=/);
});

/*
 * ── Y NO SE COPIA CON EL RECOLECTOR DENTRO ───────────────────────────────────────────────────────────────
 *
 * El caso que costó Madrid, Murcia y Valencia: `scp` reescribe el fichero que el recolector tiene abierto y la
 * base queda ilegible. Copiar tiene que negarse, no avisar.
 */
test('con el recolector en marcha no se copia', () => {
  const decision = decisionDeCopia({ contenedorEnMarcha: true });
  assert.equal(decision.copiar, false);
  assert.match(decision.motivo, /en marcha/);
});

test('con el recolector parado sí se copia', () => {
  assert.equal(decisionDeCopia({ contenedorEnMarcha: false }).copiar, true);
});

test('`--forzar` es la única forma de copiar con el recolector dentro, y lo dice', () => {
  const decision = decisionDeCopia({ contenedorEnMarcha: true, forzar: true });
  assert.equal(decision.copiar, true);
  assert.match(decision.motivo, /forzado/);
});

test('sin datos del contenedor se copia (una federación que nunca se ha levantado)', () => {
  assert.equal(decisionDeCopia({}).copiar, true);
});
