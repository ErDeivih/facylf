/*
 * Pruebas del modelo Poisson de predicción (paso 3 del encargo del 16/11/2026).
 *
 * Qué se rompe si esto está mal: los porcentajes 1-X-2 que se publican en la ficha del partido. Un modelo
 * que no suma 100, que da un marcador imposible (7-2) o que no encoge la fuerza de un equipo con un solo
 * partido estaría inventando una confianza que los datos no tienen.
 *
 * Se ejecuta con:  node --test scripts/lib/poisson.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_GOLES, matrizDeMarcadores, porcentajesDeMatriz, poissonPmf, fuerzaAtaque, fuerzaDefensa,
  marcadorMasProbable, explicaPrediccion,
} from './poisson.mjs';

const cerca = (a, b, tolerancia = 1e-9) => Math.abs(a - b) <= tolerancia;

test('la probabilidad Poisson suma 1 y su media es lambda', () => {
  const lambda = 1.4;
  let suma = 0;
  let media = 0;
  for (let k = 0; k <= 30; k += 1) {
    const p = poissonPmf(k, lambda);
    assert.ok(p >= 0, `p(${k}) no puede ser negativa`);
    suma += p;
    media += k * p;
  }
  assert.ok(cerca(suma, 1, 1e-9), `suma ${suma}`);
  assert.ok(cerca(media, lambda, 1e-9), `media ${media}`);
});

test('la matriz 0-0…5-5 tiene 36 celdas y no inventa goles fuera de la rejilla', () => {
  const { matriz, masaEnRejilla } = matrizDeMarcadores(1.4, 1.1);
  assert.equal(Object.keys(matriz).length, (MAX_GOLES + 1) ** 2);
  assert.ok(masaEnRejilla > 0.99 && masaEnRejilla <= 1, `masa ${masaEnRejilla}`);
  for (const clave of Object.keys(matriz)) {
    const [local, visitante] = clave.split('-').map(Number);
    assert.ok(local >= 0 && local <= MAX_GOLES && visitante >= 0 && visitante <= MAX_GOLES, clave);
  }
});

test('los porcentajes 1-X-2 suman 100 y el marcador más probable está en la rejilla', () => {
  const { matriz } = matrizDeMarcadores(1.6, 0.9);
  const r = porcentajesDeMatriz(matriz);
  assert.ok(cerca(r.local + r.empate + r.visitante, 100, 0.02), JSON.stringify(r));
  assert.ok(r.local > r.visitante, 'un local con más goles esperados debe ganar más veces');
  const [l, v] = r.marcador.split('-').map(Number);
  assert.ok(l >= 0 && l <= MAX_GOLES && v >= 0 && v <= MAX_GOLES);
  assert.ok(r.probMarcador > 0 && r.probMarcador <= 100);
});

test('local y visitante son simétricos cuando no hay ventaja de casa', () => {
  const uno = porcentajesDeMatriz(matrizDeMarcadores(1.3, 1.3).matriz);
  assert.ok(cerca(uno.local, uno.visitante, 0.01), JSON.stringify(uno));
  assert.equal(uno.marcador, '1-1');
});

test('marcadorMasProbable devuelve el argmax, no el primer valor de la matriz', () => {
  assert.equal(marcadorMasProbable({ '0-0': 0.1, '1-0': 0.3, '2-1': 0.3 }), '2-1');
});

test('un equipo sin partidos es exactamente la media (1,00), no cero', () => {
  // Desconocido no es cero: sin datos, la mejor estimación es la media de la liga.
  assert.equal(fuerzaAtaque({ goles: 0, partidos: 0, media: 1.5 }), 1);
  assert.equal(fuerzaDefensa({ goles: 0, partidos: 0, media: 1.5 }), 1);
});

test('con pocos partidos la fuerza se encoge hacia la media; con muchos pesa el dato', () => {
  // Mismo ritmo (5 goles por partido) con 1 y con 30 partidos: con más muestra la estimación se acerca
  // al dato real (5/1,4 = 3,57) en vez de quedarse pegada a la media.
  const unPartido = fuerzaAtaque({ goles: 5, partidos: 1, media: 1.4, k: 6 });
  const treinta = fuerzaAtaque({ goles: 150, partidos: 30, media: 1.4, k: 6 });
  assert.ok(unPartido > 1 && unPartido < 2.5, `un partido: ${unPartido}`);
  assert.ok(treinta > unPartido, 'más muestra = más peso del dato real');
  assert.ok(treinta < 5 / 1.4 + 1e-9, 'y nunca supera el dato bruto');
});

test('la explicación es una línea y dice de dónde salen los números', () => {
  const texto = explicaPrediccion({
    local: 'C.D. Villamayor', visitante: 'C.D. Hergar Helmántica',
    localPct: 52.4, empatePct: 24.1, visitantePct: 23.5,
    mediaLiga: 2.71, ventajaCasa: 1.12, partidosLiga: 180,
  });
  assert.ok(!texto.includes('\n'), 'una sola línea');
  assert.ok(texto.includes('C.D. Villamayor'));
  assert.ok(texto.includes('2,71'));
  assert.ok(texto.includes('52,4') || texto.includes('52,40'));
});
