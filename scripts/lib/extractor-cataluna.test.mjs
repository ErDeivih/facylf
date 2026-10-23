/**
 * Prueba del extractor del calendario de la FCF contra las dos maquetas conocidas.
 *
 * No hay navegador ni jsdom aquí: hay un DOM de mentira con lo justo que el extractor usa. Es suficiente
 * porque lo que se está probando es DÓNDE busca el bloque de cada jornada, que es exactamente lo que se
 * rompió —186 de los 447 grupos catalanes del canónico con las 30 jornadas iguales—.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarioSinPartidos, interpretaCabeceraJornadaFcf, jornadasTodasIguales } from './calendario-cataluna.mjs';
import { compilaExtractor } from './extractor-cataluna.mjs';

/* ── Un DOM de mentira, con lo justo ────────────────────────────────────────────────────────────────── */

const SELECTORES = [
  { selector: 'span,div,h3,h4', coincide: (n) => ['span', 'div', 'h3', 'h4'].includes(n.tag) },
  { selector: 'a[href*="/ca/competicio/acta/"]',
    coincide: (n) => n.tag === 'a' && String(n.atributos.href ?? '').includes('/ca/competicio/acta/') },
  { selector: 'a[href*="/ca/clubs/"]',
    coincide: (n) => n.tag === 'a' && String(n.atributos.href ?? '').includes('/ca/clubs/') },
  { selector: 'span[title]', coincide: (n) => n.tag === 'span' && n.atributos.title !== undefined },
  { selector: 'div[class*="cursor-pointer"]',
    coincide: (n) => n.tag === 'div' && String(n.atributos.class ?? '').includes('cursor-pointer') },
];

function coincide(nodo, selector) {
  const regla = SELECTORES.find((r) => r.selector === selector);
  if (!regla) throw new Error(`selector no soportado en la prueba: ${selector}`);
  return regla.coincide(nodo);
}

class Nodo {
  constructor(tag, atributos = {}, texto = '') {
    this.tag = tag; this.atributos = atributos; this.texto = texto; this.hijos = []; this.padre = null;
  }

  get children() { return this.hijos; }

  get parentElement() { return this.padre; }

  get innerText() {
    return [this.texto, ...this.hijos.map((h) => h.innerText)].filter(Boolean).join(' ');
  }

  get textContent() { return this.innerText; }

  anade(...nodos) { for (const n of nodos) { n.padre = this; this.hijos.push(n); } return this; }

  contains(nodo) { return nodo === this || this.hijos.some((h) => h.contains(nodo)); }

  closest(selector) {
    for (let n = this; n; n = n.padre) if (coincide(n, selector)) return n;
    return null;
  }

  getAttribute(nombre) { return this.atributos[nombre] ?? null; }

  click() { this.clics = (this.clics ?? 0) + 1; }

  querySelectorAll(selector) {
    const salida = [];
    const recorre = (n) => { for (const h of n.hijos) { if (coincide(h, selector)) salida.push(h); recorre(h); } };
    recorre(this);
    return salida;
  }
}

/** Una fila de partido: dos nombres con `title`, los enlaces de club y, si se ha jugado, el de acta. */
function filaPartido(local, codigoLocal, visitante, codigoVisitante, acta = null, marcador = '') {
  const fila = new Nodo('div', { class: 'fila' });
  fila.anade(
    new Nodo('a', { href: `/ca/clubs/${codigoLocal}` }),
    new Nodo('span', { title: local }),
    new Nodo('span', { title: visitante }, marcador),
    new Nodo('a', { href: `/ca/clubs/${codigoVisitante}` }),
  );
  if (acta) fila.anade(new Nodo('a', { href: `/ca/competicio/acta/${acta}` }));
  return fila;
}

function ejecuta(raiz) {
  const document = {
    body: raiz,
    querySelector: (s) => (s === 'main' && raiz.tag === 'main' ? raiz : null),
  };
  return compilaExtractor({ document, interpretaCabeceraJornadaFcf })();
}

function cabecera(numero, fecha) {
  // La cabecera es un nodo hoja de texto dentro de una fila clicable, como en la web de la FCF.
  return new Nodo('div', { class: 'cursor-pointer' }).anade(new Nodo('h3', {}, `JORNADA ${numero} ${fecha}`));
}

function bloqueDeJornada(numero, fecha, partidos) {
  return new Nodo('div', { class: 'jornada' }).anade(
    cabecera(numero, fecha),
    new Nodo('div', { class: 'filas' }).anade(...partidos),
  );
}

/*
 * Una jornada sólo se captura si AL MENOS uno de sus partidos trae enlace de acta: es el ancla de la que
 * tira el extractor, y las demás filas del mismo bloque se recogen a su lado. Los partidos sin enlace salen
 * con `codacta: null`. Es el comportamiento que ya había y la prueba lo fija para no cambiarlo sin querer.
 */
function maquetaBuena() {
  return new Nodo('main').anade(
    bloqueDeJornada(1, '2026-09-19', [
      filaPartido('A', '1', 'B', '2', '111'),
      filaPartido('C', '3', 'D', '4', '112'),
    ]),
    bloqueDeJornada(2, '2026-09-26', [
      filaPartido('A', '1', 'C', '3', '113'),
      filaPartido('B', '2', 'D', '4'),
    ]),
    bloqueDeJornada(3, '2026-10-03', [
      filaPartido('A', '1', 'D', '4', '115'),
      filaPartido('B', '2', 'C', '3'),
    ]),
  );
}

test('con cada jornada en su bloque, cada una devuelve SUS partidos', async () => {
  const jornadas = await ejecuta(maquetaBuena());
  assert.equal(jornadas.length, 3);
  assert.deepEqual(jornadas.map((j) => j.numero), [1, 2, 3]);
  assert.deepEqual(jornadas[0].partidos.map((p) => `${p.local}-${p.visitante}`), ['A-B', 'C-D']);
  assert.deepEqual(jornadas[1].partidos.map((p) => `${p.local}-${p.visitante}`), ['A-C', 'B-D']);
  assert.deepEqual(jornadas[2].partidos.map((p) => `${p.local}-${p.visitante}`), ['A-D', 'B-C']);
});

test('la fecha de cada jornada sale de su propia cabecera', async () => {
  const jornadas = await ejecuta(maquetaBuena());
  assert.deepEqual(jornadas.map((j) => j.fecha), ['2026-09-19', '2026-09-26', '2026-10-03']);
});

test('el código de acta se conserva por partido, y es nulo en las filas sin enlace', async () => {
  const jornadas = await ejecuta(maquetaBuena());
  assert.deepEqual(jornadas[0].partidos.map((p) => p.codacta), ['111', '112']);
  assert.deepEqual(jornadas[2].partidos.map((p) => p.codacta), ['115', null]);
  // Los códigos de club sí salen en todas las filas, vengan o no de un enlace de acta.
  assert.deepEqual(jornadas[2].partidos.map((p) => `${p.codigoLocal}-${p.codigoVisitante}`), ['1-4', '2-3']);
});

test('cada jornada se queda con SUS parejas, no con las de la jornada que esté abierta', async () => {
  const jornadas = await ejecuta(maquetaBuena());
  const firmas = jornadas.map((j) => j.partidos.map((p) => `${p.local}-${p.visitante}`).sort().join('|'));
  assert.equal(new Set(firmas).size, 3);
});

/* ── Maqueta del defecto: cabeceras hermanas y un único panel con las filas de UNA jornada ──────────── */

function maquetaDelDefecto() {
  return new Nodo('main').anade(
    cabecera(1, '2026-09-19'),
    cabecera(2, '2026-09-26'),
    cabecera(3, '2026-10-03'),
    new Nodo('div', { class: 'panel' }).anade(
      filaPartido('A', '1', 'B', '2', '111'),
      filaPartido('C', '3', 'D', '4', '112'),
    ),
  );
}

test('si las filas sólo están en un bloque compartido, NO se atribuyen a ninguna jornada', async () => {
  const jornadas = await ejecuta(maquetaDelDefecto());
  assert.equal(jornadas.length, 3);
  // Antes de la corrección, las tres jornadas salían con las MISMAS dos parejas y se guardaban así.
  assert.deepEqual(jornadas.map((j) => j.partidos.length), [0, 0, 0]);
});

test('un calendario así no llega a guardarse: lo detecta la comprobación de grupo entero', async () => {
  const jornadas = await ejecuta(maquetaDelDefecto());
  assert.equal(jornadasTodasIguales(jornadas), false);   // todas vacías, no todas iguales…
  assert.equal(calendarioSinPartidos(jornadas), true);    // …pero ninguna trae partidos, y eso sí es fallo
});

/* ── Una jornada sin partidos todavía no es un fallo ────────────────────────────────────────────────── */

test('una jornada sin partidos publicados se queda vacía y el grupo sigue siendo válido', async () => {
  const main = new Nodo('main').anade(
    bloqueDeJornada(1, '2026-09-19', [filaPartido('A', '1', 'B', '2', '111')]),
    bloqueDeJornada(2, '2026-09-26', []),
    bloqueDeJornada(3, '2026-10-03', []),
  );
  const jornadas = await ejecuta(main);
  assert.deepEqual(jornadas.map((j) => j.partidos.length), [1, 0, 0]);
  assert.equal(jornadasTodasIguales(jornadas), false);
  assert.equal(calendarioSinPartidos(jornadas), false);
});

/* ── Lectura desde las props de React, sin clics (21/10/2026) ───────────────────────────────────────────── */

/** La página real guarda el calendario entero en las props del componente que pinta las jornadas. */
function conFibraDeReact(main, voltes) {
  const primera = main.querySelectorAll('span,div,h3,h4').find((n) => n.tag === 'h3');
  primera['__reactFiber$prueba'] = { memoizedProps: { className: 'x' }, return: { memoizedProps: { voltes, currentJornada: 1 }, return: null } };
  return main;
}
const equipo = (name, clubId) => ({ name, clubId, teamId: '1', logo: 'x.png' });

test('si la página trae «voltes» en React, se leen TODAS las jornadas sin depender del clic', async () => {
  // El DOM sólo tiene desplegada la jornada 2 (lo que se veía en el PC); React tiene las tres.
  const main = new Nodo('main').anade(
    cabecera(1, '2026-09-19'),
    bloqueDeJornada(2, '2026-09-26', [filaPartido('A', '1', 'C', '3', '113')]),
    cabecera(3, '2026-10-03'),
  );
  conFibraDeReact(main, [
    { title: 'PRIMERA VOLTA', jornadas: [
      { number: 1, date: '2026-09-19T16:00:00', matches: [
        { id: '111', teamA: equipo('A', '1'), teamB: equipo('B', '2'), scoreA: 2, scoreB: 0, isClosed: true },
        // Sin jugar: «status» es un elemento de React con SU fecha y hora (así lo pinta la FCF, 22/10/2026).
        { id: '112', teamA: equipo('C', '3'), teamB: equipo('D', '4'), scoreA: null, scoreB: null, isClosed: false,
          status: { type: 'span', props: { className: 'text-center block', children: ['29/10/2026', { props: { children: [{ type: 'br', props: {} }, '20:30'] } }] } } },
      ] },
      { number: 2, date: '2026-09-26T16:00:00', matches: [
        { id: '113', teamA: equipo('A', '1'), teamB: equipo('C', '3'), scoreA: 1, scoreB: 1 },
      ] },
    ] },
    { title: 'SEGONA VOLTA', jornadas: [
      { number: 3, date: '2026-10-03T16:00:00', matches: [
        { id: '115', teamA: equipo('A', '1'), teamB: equipo('D', '4'), scoreA: '3', scoreB: '1' },
        { id: '116', teamA: equipo('B', '2'), teamB: null },
      ] },
    ] },
  ]);
  const jornadas = await ejecuta(main);
  assert.deepEqual(jornadas.map((j) => [j.numero, j.fecha, j.partidos.length]), [[1, '2026-09-19', 2], [2, '2026-09-26', 1], [3, '2026-10-03', 1]]);
  assert.deepEqual(jornadas[0].partidos[0], {
    local: 'A', codigoLocal: '1', visitante: 'B', codigoVisitante: '2', golesLocal: 2, golesVisitante: 0, codacta: '111',
    cerrada: true, estado: null, fecha: null, hora: null,
  });
  assert.equal(jornadas[0].partidos[1].golesLocal, null);
  // El partido sin jugar trae su propia fecha y hora (no la de la jornada).
  assert.deepEqual([jornadas[0].partidos[1].cerrada, jornadas[0].partidos[1].fecha, jornadas[0].partidos[1].hora],
    [false, '2026-10-29', '20:30']);
  assert.equal(jornadas[2].partidos[0].golesLocal, 3);   // marcador en texto → número
  // Ningún clic: no hace falta desplegar nada.
  assert.equal(main.querySelectorAll('span,div,h3,h4').filter((d) => d.clics).length, 0);
});

test('si «voltes» no cuadra con las cabeceras, se ignora y se lee por clics como antes', async () => {
  const main = conFibraDeReact(maquetaBuena(), [{ jornadas: [{ number: 1, date: '2026-09-19', matches: [] }] }]);
  const jornadas = await ejecuta(main);
  assert.deepEqual(jornadas.map((j) => j.partidos.length), [2, 2, 2]);
});

test('la fecha sale de la cabecera aunque la prop de React no la traiga como texto (PC, 21/10/2026)', async () => {
  const main = new Nodo('main').anade(
    cabecera(1, '2025-09-20'),
    bloqueDeJornada(2, '2025-09-27', [filaPartido('A', '1', 'C', '3', '113')]),
  );
  conFibraDeReact(main, [{ jornadas: [
    { number: 1, date: new Date('2025-09-20T16:00:00Z'), matches: [{ id: '111', teamA: equipo('A', '1'), teamB: equipo('B', '2'), scoreA: 1, scoreB: 0 }] },
    { number: 2, matches: [{ id: '113', teamA: equipo('A', '1'), teamB: equipo('C', '3'), scoreA: 0, scoreB: 0 }] },
  ] }]);
  const jornadas = await ejecuta(main);
  assert.deepEqual(jornadas.map((j) => j.fecha), ['2025-09-20', '2025-09-27']);
});

test('como en el PC: cabecera sin fecha y la prop con «2025-09-20T11:30:00» → fecha ISO (prueba el código INYECTADO)', async () => {
  // La cabecera real es «JORNADA 1» y la fecha va en otro nodo pegado («JORNADA 12025-09-20T11:30:00» en textContent).
  const cab = (n, f) => new Nodo('div', { class: 'cursor-pointer' }).anade(new Nodo('h3', {}, `JORNADA ${n}`), new Nodo('p', {}, f));
  const main = new Nodo('main').anade(cab(1, '2025-09-20T11:30:00'), cab(2, '2025-09-27T11:30:00'));
  conFibraDeReact(main, [{ jornadas: [
    { number: 1, date: '2025-09-20T11:30:00', matches: [{ id: '111', teamA: equipo('A', '1'), teamB: equipo('B', '2'), scoreA: '2', scoreB: 0 }] },
    { number: 2, date: '2025-09-27T11:30:00', matches: [{ id: '112', teamA: equipo('B', '2'), teamB: equipo('A', '1'), scoreA: 1, scoreB: 1 }] },
  ] }]);
  const jornadas = await ejecuta(main);
  assert.deepEqual(jornadas.map((j) => j.fecha), ['2025-09-20', '2025-09-27']);
  assert.equal(jornadas[0].partidos[0].golesLocal, 2);
});
