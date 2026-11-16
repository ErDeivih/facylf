/**
 * Clasificación final estimada: lo que la pantalla calcula a partir de la simulación guardada.
 *
 * La simulación (`analytics.simulacion_final`) trae, por equipo, la probabilidad de acabar en cada
 * puesto; esa lista suma 100 a lo largo de los puestos de UN equipo. Todo lo demás —ganar la liga,
 * acabar en zona de ascenso o de descenso, el tramo de puestos más probable— es una suma de un rango
 * de esa lista, y se nombra siempre como rango («entre el 1.º y el 3.º»), nunca como un porcentaje
 * suelto que parezca la probabilidad de un puesto.
 */
import type { ZonasDelGrupo } from './pantalla-competicion';

/** Un tramo de puestos, los dos extremos incluidos. */
export type TramoDePuestos = { desde: number; hasta: number; probabilidad: number };

const suma = (valores: readonly number[], desde: number, hasta: number): number => {
  let total = 0;
  for (let i = Math.max(1, desde); i <= Math.min(valores.length, hasta); i += 1) total += valores[i - 1] ?? 0;
  return total;
};

/**
 * El tramo de puestos seguidos más corto que reúne al menos `cobertura` (en %). Si dos tramos igual de
 * cortos lo reúnen, gana el más probable. Con una lista vacía o sin masa devuelve `null`.
 */
export function tramoMasProbable(probabilidades: readonly number[], cobertura = 80): TramoDePuestos | null {
  const n = probabilidades.length;
  const total = suma(probabilidades, 1, n);
  if (n === 0 || !(total > 0)) return null;
  const objetivo = Math.min(cobertura, total);
  for (let ancho = 1; ancho <= n; ancho += 1) {
    let mejor: TramoDePuestos | null = null;
    for (let desde = 1; desde + ancho - 1 <= n; desde += 1) {
      const probabilidad = suma(probabilidades, desde, desde + ancho - 1);
      if (probabilidad + 1e-9 >= objetivo && (mejor === null || probabilidad > mejor.probabilidad)) {
        mejor = { desde, hasta: desde + ancho - 1, probabilidad };
      }
    }
    if (mejor) return mejor;
  }
  return null;
}

/** Los tramos con nombre del grupo, según su reglamento. Sólo los que existen. */
export type TramosDelReglamento = {
  ascenso: TramoDePuestos | null;
  promocion: TramoDePuestos | null;
  descenso: TramoDePuestos | null;
};

/**
 * Probabilidad de acabar en cada zona del reglamento. Sin zonas conocidas no se inventa ninguna: los
 * tres tramos salen `null` y la pantalla enseña sólo el puesto.
 */
export function tramosDelReglamento(
  probabilidades: readonly number[], zonas: ZonasDelGrupo | null,
): TramosDelReglamento {
  const n = probabilidades.length;
  if (!zonas || n === 0) return { ascenso: null, promocion: null, descenso: null };
  const tramo = (desde: number, hasta: number): TramoDePuestos | null => (
    hasta >= desde && desde >= 1 && hasta <= n
      ? { desde, hasta, probabilidad: suma(probabilidades, desde, hasta) }
      : null
  );
  return {
    ascenso: zonas.ascensos > 0 ? tramo(1, zonas.ascensos) : null,
    promocion: zonas.promocion > 0 ? tramo(zonas.ascensos + 1, zonas.ascensos + zonas.promocion) : null,
    descenso: zonas.descensos > 0 ? tramo(n - zonas.descensos + 1, n) : null,
  };
}

/** «1.º» o «entre el 2.º y el 5.º». */
export function textoDeTramo(tramo: { desde: number; hasta: number }): string {
  return tramo.desde === tramo.hasta ? `${tramo.desde}.º` : `${tramo.desde}.º–${tramo.hasta}.º`;
}

/** Porcentaje para una probabilidad que puede ser casi 0 o casi 100 sin mentir con el redondeo. */
export function porcentajeDeProbabilidad(valor: number): string {
  if (valor <= 0) return '0 %';
  if (valor < 1) return '<1 %';
  if (valor > 99 && valor < 100) return '>99 %';
  return `${Math.round(valor)} %`;
}

/** Número con un decimal y coma. */
export const unDecimal = (valor: number): string => valor.toFixed(1).replace('.', ',');

/**
 * ¿La simulación guardada cubre lo que queda de liga?
 *
 * Antes de la migración 0065 la simulación sólo jugaba los pendientes con fila en el calendario; con la
 * liga por la jornada 10 de 34 eso eran tres aplazados y todos los equipos salían con el 100 % en su
 * puesto de hoy. Esa estimación no se enseña. Se considera cubierta si los partidos simulados llegan,
 * al menos, a la mitad de los que quedan según las jornadas previstas (el margen absorbe descansos y
 * aplazados). Sin jornadas previstas no hay con qué comparar y se confía en lo guardado.
 */
export function simulacionCubreLoQueQueda(x: {
  equipos: number;
  jornadasPrevistas: number | null;
  jornadaActual: number | null;
  partidosPendientes: number | null;
  partidosDeducidos: number | null;
}): boolean {
  if (x.jornadasPrevistas === null || x.jornadaActual === null) return true;
  const jornadasQueQuedan = Math.max(0, x.jornadasPrevistas - x.jornadaActual);
  const esperados = jornadasQueQuedan * Math.floor(x.equipos / 2);
  if (esperados === 0) return true;
  const simulados = (x.partidosPendientes ?? 0) + (x.partidosDeducidos ?? 0);
  return simulados >= esperados / 2;
}
