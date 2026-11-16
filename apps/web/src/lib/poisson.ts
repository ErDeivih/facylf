/**
 * 1-X-2 de un cruce a partir de sus goles esperados, con dos Poisson independientes.
 *
 * La web no calcula el modelo de los partidos: lee lo guardado en `analytics.poisson_partido` y
 * `analytics.prediccion_ml`. Esto es sólo para los cruces del calendario previsto que todavía no son
 * partido (`core.calendario_previsto`, 0067) y por tanto no tienen predicción guardada: se les da la
 * expectativa del mismo Poisson, con las mismas fuerzas de equipo y medias de liga, calculada al pintar.
 * Misma rejilla 0-0…5-5 y misma normalización que `scripts/lib/poisson.mjs`.
 */
const MAX_GOLES = 5;
const LAMBDA_MIN = 0.05;
const LAMBDA_MAX = 6;

function pmf(k: number, lambda: number): number {
  let logFactorial = 0;
  for (let i = 2; i <= k; i += 1) logFactorial += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial);
}

export type Expectativa1X2 = { local: number; empate: number; visitante: number; marcador: string };

/** Porcentajes 0-100 (suman 100) y marcador más probable. `null` si algún dato no es un número positivo. */
export function expectativa1X2(golesLocal: number | null, golesVisitante: number | null): Expectativa1X2 | null {
  if (golesLocal == null || golesVisitante == null) return null;
  const acota = (x: number) => Math.min(LAMBDA_MAX, Math.max(LAMBDA_MIN, x));
  const l = acota(Number(golesLocal));
  const v = acota(Number(golesVisitante));
  if (!Number.isFinite(l) || !Number.isFinite(v)) return null;
  let local = 0;
  let empate = 0;
  let visitante = 0;
  let mejor = '0-0';
  let mejorP = -1;
  for (let gl = 0; gl <= MAX_GOLES; gl += 1) {
    const pl = pmf(gl, l);
    for (let gv = 0; gv <= MAX_GOLES; gv += 1) {
      const p = pl * pmf(gv, v);
      if (gl > gv) local += p; else if (gl === gv) empate += p; else visitante += p;
      if (p > mejorP) { mejorP = p; mejor = `${gl}-${gv}`; }
    }
  }
  const total = local + empate + visitante;
  if (!(total > 0)) return null;
  return {
    local: (local / total) * 100, empate: (empate / total) * 100, visitante: (visitante / total) * 100,
    marcador: mejor,
  };
}

/** «1 49,8 % · X 11,7 % · 2 38,6 %» a partir de los goles esperados, o `null` si no hay con qué. */
export function linea1X2DeGoles(golesLocal: number | null, golesVisitante: number | null): string | null {
  const e = expectativa1X2(golesLocal, golesVisitante);
  if (e === null) return null;
  const pct = (v: number) => `${v.toFixed(1).replace('.', ',')} %`;
  return `1 ${pct(e.local)} · X ${pct(e.empate)} · 2 ${pct(e.visitante)}`;
}
