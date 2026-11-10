import { describe, expect, test } from 'vitest';

import {
  CLASIFICACION_CALCULADA, CONSULTAS_COMPETICIONES, PARAMETROS_COMPETICIONES, type FilaClasificacionPantalla,
} from '../src/consultas/competiciones';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';

/*
 * LA TABLA TIENE QUE CUADRAR CON LOS PARTIDOS (hallazgo del caso BI, 10/11/2026).
 *
 * En el grupo 2939 la federación solo había publicado la tabla oficial de la jornada 1: todos los equipos
 * con PJ=1 y un Alba 0-1-0 2:2, mientras la misma página enseñaba un Villamayor 10-0 Alba de la jornada 7.
 * La pantalla pasa a calcular la tabla con los resultados; estas pruebas defienden que:
 *  · la consulta está registrada y se calcula desde core.match,
 *  · en el grupo real cada equipo tiene los partidos que ha jugado (no los de una foto vieja),
 *  · el 10-0 aparece en los goles del Alba,
 *  · la jornada alcanzada es la de los resultados.
 */

describe('clasificación calculada desde los partidos', () => {
  test('está registrada como consulta de la pantalla', () => {
    expect(CONSULTAS_COMPETICIONES).toContain(CLASIFICACION_CALCULADA);
    expect(PARAMETROS_COMPETICIONES['clasificación-calculada']).toEqual([797]);
    expect(CLASIFICACION_CALCULADA.columnas).toContain('oficial_jornada');
    expect(CLASIFICACION_CALCULADA.columnas).toContain('equipo_corto');
  });

  test('se calcula desde los resultados y no desde la tabla publicada', () => {
    expect(CLASIFICACION_CALCULADA.sql).toContain('core.match');
    expect(CLASIFICACION_CALCULADA.sql).toMatch(/goles_local is not null/);
    expect(CLASIFICACION_CALCULADA.sql).toMatch(/sum\(case when gf > gc then 3/);
    // La oficial se trae SOLO para comparar (jornada y puntos), nunca para pintar la tabla.
    expect(CLASIFICACION_CALCULADA.sql).toContain('oficial_puntos');
  });

  test('en el grupo 2939 cada equipo tiene sus partidos jugados y el 10-0 está en los goles', async () => {
    const filas = await consulta<FilaClasificacionPantalla>(CLASIFICACION_CALCULADA.sql, [2939]);
    expect(filas.length).toBeGreaterThan(0);

    // Todos los equipos han jugado la jornada 7 (o están a un partido), no la jornada 1.
    const jugados = filas.map((f) => Number(f.jugados));
    expect(Math.max(...jugados)).toBe(7);
    expect(Math.min(...jugados)).toBeGreaterThanOrEqual(6);

    // El 10-0 del Villamayor aparece en los goles en contra del Alba (38 encajados en total).
    const alba = filas.find((f) => /Alba/i.test(String(f.equipo)));
    expect(alba, 'el Alba tiene que estar en la tabla').toBeTruthy();
    expect(Number(alba?.goles_contra)).toBe(38);
    expect(Number(alba?.jugados)).toBe(7);

    // La tabla calculada cuadra con los partidos: la suma de jugados es 2 × partidos con resultado.
    const [{ con_resultado }] = await consulta<{ con_resultado: number }>(
      'select count(*) filter (where goles_local is not null)::int as con_resultado from core.match where phase_group_id = $1', [2939],
    );
    expect(jugados.reduce((a, b) => a + b, 0)).toBe(2 * con_resultado);
  });

  test('avisa de que la oficial está desfasada en ese grupo', async () => {
    const filas = await consulta<FilaClasificacionPantalla>(CLASIFICACION_CALCULADA.sql, [2939]);
    const desfasada = filas.some((f) => f.oficial_jornada != null
      && (Number(f.oficial_jugados) !== Number(f.jugados) || Number(f.oficial_puntos) !== Number(f.puntos)));
    expect(desfasada).toBe(true);
  });
});
