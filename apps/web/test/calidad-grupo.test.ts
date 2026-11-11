import { describe, expect, test } from 'vitest';
import { CALIDAD_DEL_GRUPO } from '../src/consultas/competiciones';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';

/*
 * REGLAS DE COHERENCIA POR GRUPO (panel de calidad).
 *
 * Cada regla debe dar 0: PJ = V+E+D, puntos = 3V+E y ΣGF = ΣGC. Si alguna no diera 0, la ficha avisa y no se
 * publica la tabla como oficial. Estas pruebas defienden las tres reglas y los KPIs en las tres competiciones
 * principales.
 */
type Fila = {
  partidos: number; con_resultado: number; con_acta: number; actas: number; goles: number;
  victorias_local: number; empates: number; victorias_visitante: number; equipos: number;
  suma_pj: number; descuadre_pj: number; descuadre_puntos: number; descuadre_goles: number;
};

describe('calidad del grupo', () => {
  for (const [gid, esperado] of [[44, { equipos: 18, con_resultado: 89, actas: 80 }],
    [2939, { equipos: 14, con_resultado: 48, actas: 41 }],
    [3947, { equipos: 14, con_resultado: 49, actas: 42 }]] as const) {
    test(`grupo ${gid}: las tres reglas dan 0 y los KPIs cuadran`, async () => {
      const filas = await consulta<Fila>(CALIDAD_DEL_GRUPO.sql, [gid]);
      expect(filas).toHaveLength(1);
      const f = filas[0];
      expect(Number(f.equipos)).toBe(esperado.equipos);
      expect(Number(f.con_resultado)).toBe(esperado.con_resultado);
      expect(Number(f.actas)).toBe(esperado.actas);
      // Las tres reglas.
      expect(Number(f.descuadre_pj)).toBe(0);
      expect(Number(f.descuadre_puntos)).toBe(0);
      expect(Number(f.descuadre_goles)).toBe(0);
      // Cuadre con los partidos: suma de jugados = 2 × con resultado; local+empate+visitante = con resultado.
      expect(Number(f.suma_pj)).toBe(2 * Number(f.con_resultado));
      expect(Number(f.victorias_local) + Number(f.empates) + Number(f.victorias_visitante))
        .toBe(Number(f.con_resultado));
    });
  }
});
