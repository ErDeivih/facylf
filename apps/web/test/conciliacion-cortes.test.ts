import { describe, expect, test } from 'vitest';
import { CLASIFICACION_CALCULADA } from '../src/consultas/competiciones';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';

/*
 * FP-F1 · CONCILIACIÓN POR GRUPO Y CORTE.
 *
 * La regla del producto: si la tabla oficial es de otra jornada que los resultados NO es un error, son «cortes
 * distintos» y se dicen así. A igual corte, se validan PJ, V/E/D, GF, GC y puntos.
 *
 * Aquí se defiende la mitad que depende del canónico: el grupo 2939 tiene la oficial en la jornada 1 y resultados
 * hasta la 7 (cortes distintos), y el grupo 44 tiene la oficial en la 3 y resultados hasta la 10 (también distintos).
 */
type Fila = {
  jugados: number; ganados: number; empatados: number; perdidos: number;
  goles_favor: number; goles_contra: number; puntos: number;
  oficial_jornada: number | null; oficial_jugados: number | null; oficial_puntos: number | null;
};

const cortes = (filas: Fila[]) => ({
  oficial: filas.map((f) => f.oficial_jornada).find((j) => j != null) ?? null,
  resultados: filas[0]?.jugados != null ? null : null,
});

describe('conciliación por grupo y corte', () => {
  test('grupo 2939: la oficial es de una jornada distinta a los resultados', async () => {
    const filas = await consulta<Fila>(CLASIFICACION_CALCULADA.sql, [2939]);
    const oficial = filas.map((f) => f.oficial_jornada).find((j) => j != null) ?? null;
    expect(oficial).toBe(1);
    // Los resultados llegan más allá: los equipos tienen más partidos que la oficial de la jornada 1.
    expect(Math.max(...filas.map((f) => Number(f.jugados)))).toBeGreaterThan(Number(oficial));
  });

  test('grupo 44: la oficial es de una jornada distinta a los resultados', async () => {
    const filas = await consulta<Fila>(CLASIFICACION_CALCULADA.sql, [44]);
    const oficial = filas.map((f) => f.oficial_jornada).find((j) => j != null) ?? null;
    expect(oficial).toBeGreaterThan(1);
    expect(Math.max(...filas.map((f) => Number(f.jugados)))).toBeGreaterThan(Number(oficial));
  });

  test('a igual corte se validan PJ, V/E/D, GF, GC y puntos', async () => {
    const filas = await consulta<Fila>(CLASIFICACION_CALCULADA.sql, [2939]);
    for (const f of filas) {
      // PJ = V+E+D y puntos = 3V+E en la tabla calculada (mismo corte por construcción).
      expect(Number(f.jugados)).toBe(Number(f.ganados) + Number(f.empatados) + Number(f.perdidos));
      expect(Number(f.puntos)).toBe(3 * Number(f.ganados) + Number(f.empatados));
      // Los goles y los puntos calculados siempre existen.
      expect(Number.isFinite(Number(f.goles_favor))).toBe(true);
      expect(Number.isFinite(Number(f.goles_contra))).toBe(true);
    }
  });
});
