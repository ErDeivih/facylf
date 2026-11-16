/*
 * poisson.mjs — el modelo de predicción, sin base de datos y sin web.
 *
 * Qué calcula: con los goles esperados de cada lado (λ), la probabilidad de cada marcador de 0-0 a 5-5
 * (producto de dos Poisson independientes), los porcentajes 1-X-2 y el marcador más probable. También
 * estima la fuerza de ataque/defensa de un equipo relativa a la media de su liga, encogida hacia 1 cuando
 * hay pocos partidos.
 *
 * Por qué encoger: con un solo partido ganado 5-0, un equipo no es cinco veces mejor que la media; es un
 * equipo del que todavía no se sabe nada. El encogido (media bayesiana con `k` partidos equivalentes) evita
 * publicar una confianza que los datos no sostienen. Desconocido no es cero: sin partidos, la estimación es
 * exactamente la media (1,00).
 *
 * Se usa desde `scripts/prediccion/01-parametros.mjs` y `scripts/prediccion/02-predicciones.mjs`; la web no
 * recalcula nada, lee los porcentajes ya guardados.
 */

/** Último gol de la rejilla publicada. La matriz es (MAX_GOLES+1)² celdas. */
export const MAX_GOLES = 5;

/** Partidos equivalentes con los que se encoge una fuerza hacia la media de la liga. */
export const K_ENCOGIDO = 6;

/** Cuánto pesa la temporada anterior frente a la actual, por partido. */
export const PESO_TEMPORADA_ANTERIOR = 0.5;

/** P(goles = k) con media λ. */
export function poissonPmf(k, lambda) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (!(lambda > 0)) return k === 0 ? 1 : 0;
  // log para no desbordar con lambdas altas; exp(-λ)·λ^k/k! es lo mismo.
  let logFactorial = 0;
  for (let i = 2; i <= k; i += 1) logFactorial += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial);
}

/**
 * Matriz de marcadores 0-0…5-5 con dos Poisson independientes.
 * Devuelve las celdas (`"local-visitante"`) y la masa que cae dentro de la rejilla.
 */
export function matrizDeMarcadores(lambdaLocal, lambdaVisitante, max = MAX_GOLES) {
  const matriz = {};
  let masaEnRejilla = 0;
  for (let local = 0; local <= max; local += 1) {
    const pLocal = poissonPmf(local, lambdaLocal);
    for (let visitante = 0; visitante <= max; visitante += 1) {
      const p = pLocal * poissonPmf(visitante, lambdaVisitante);
      matriz[`${local}-${visitante}`] = p;
      masaEnRejilla += p;
    }
  }
  return { matriz, masaEnRejilla };
}

/** Marcador con más probabilidad. Empate a probabilidad: gana el de más goles totales (y luego el local). */
export function marcadorMasProbable(matriz) {
  let mejor = null;
  let mejorP = -1;
  for (const [clave, p] of Object.entries(matriz)) {
    const [local, visitante] = clave.split('-').map(Number);
    const total = local + visitante;
    const mejorTotal = mejor === null ? -1 : Number(mejor.split('-')[0]) + Number(mejor.split('-')[1]);
    if (p > mejorP || (p === mejorP && (total > mejorTotal
      || (total === mejorTotal && local > Number(mejor.split('-')[0]))))) {
      mejor = clave;
      mejorP = p;
    }
  }
  return mejor;
}

/**
 * De la matriz a los porcentajes 1-X-2. Normaliza sobre la rejilla: la cola de más de 5 goles se reparte
 * proporcionalmente, así los tres porcentajes suman 100 aunque se publique sólo 0-0…5-5.
 */
export function porcentajesDeMatriz(matriz) {
  const celdas = Object.entries(matriz).map(([clave, p]) => {
    const [local, visitante] = clave.split('-').map(Number);
    return { clave, local, visitante, p };
  });
  const total = celdas.reduce((s, c) => s + c.p, 0);
  if (!(total > 0)) throw new Error('la matriz no tiene masa');
  let local = 0;
  let empate = 0;
  let visitante = 0;
  for (const c of celdas) {
    if (c.local > c.visitante) local += c.p;
    else if (c.local === c.visitante) empate += c.p;
    else visitante += c.p;
  }
  const redondea = (x) => Math.round((x / total) * 10000) / 100;
  let p1 = redondea(local);
  let px = redondea(empate);
  let p2 = redondea(visitante);
  // El redondeo a dos decimales puede dejar 99,99 o 100,01: el residuo va al mayor, para que sume 100,00.
  const residuo = Math.round((100 - (p1 + px + p2)) * 100) / 100;
  if (residuo !== 0) {
    if (p1 >= px && p1 >= p2) p1 = Math.round((p1 + residuo) * 100) / 100;
    else if (px >= p2) px = Math.round((px + residuo) * 100) / 100;
    else p2 = Math.round((p2 + residuo) * 100) / 100;
  }
  const mejor = marcadorMasProbable(matriz);
  return {
    local: p1,
    empate: px,
    visitante: p2,
    marcador: mejor,
    probMarcador: Math.round((matriz[mejor] / total) * 10000) / 100,
  };
}

/**
 * Fuerza de ataque relativa a la media: goles a favor por partido / media de goles por equipo de la liga,
 * encogida con `k` partidos equivalentes de media 1. Acepta la temporada anterior del mismo club con un
 * peso menor por partido.
 */
export function fuerzaAtaque({ goles, partidos, media, golesPrevios = 0, partidosPrevios = 0,
  pesoPrevios = PESO_TEMPORADA_ANTERIOR, k = K_ENCOGIDO }) {
  const n = partidos + pesoPrevios * partidosPrevios + k;
  const gf = goles + pesoPrevios * golesPrevios + k * media;
  return n > 0 && media > 0 ? gf / (n * media) : 1;
}

/** Fuerza de defensa: goles en contra por partido / media por equipo, encogida igual. Más alto = peor. */
export function fuerzaDefensa({ goles, partidos, media, golesPrevios = 0, partidosPrevios = 0,
  pesoPrevios = PESO_TEMPORADA_ANTERIOR, k = K_ENCOGIDO }) {
  return fuerzaAtaque({ goles, partidos, media, golesPrevios, partidosPrevios, pesoPrevios, k });
}

/** Goles esperados de cada lado a partir de la media de la liga y las fuerzas. */
export function golesEsperados({ mediaLocal, mediaVisitante, ataqueLocal, defensaLocal, ataqueVisitante, defensaVisitante }) {
  return {
    local: mediaLocal * ataqueLocal * defensaVisitante,
    visitante: mediaVisitante * ataqueVisitante * defensaLocal,
  };
}

const numero = (x, decimales = 1) => Number(x).toFixed(decimales).replace('.', ',');

/** Una línea de explicación para la ficha: qué dice el modelo y con qué datos de la liga. */
export function explicaPrediccion({ local, visitante, localPct, empatePct, visitantePct,
  mediaLiga, ventajaCasa, partidosLiga }) {
  return `${local} recibe a ${visitante}: el modelo da ${numero(localPct)} % (1), ${numero(empatePct)} % (X) `
    + `y ${numero(visitantePct)} % (2), con ${numero(mediaLiga, 2)} goles por partido en la liga `
    + `(${partidosLiga} partidos) y una ventaja de casa de ${numero(ventajaCasa, 2)}.`;
}
