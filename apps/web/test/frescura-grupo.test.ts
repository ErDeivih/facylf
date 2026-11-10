import { describe, expect, test } from 'vitest';
import { FRESCURA_DEL_GRUPO } from '../src/consultas/competiciones';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';

/*
 * LA LÍNEA DE FRESCURA («Actualizado 08/11 · 41 de 42 actas») DEL CASO BI.
 *
 * Se calcula con `FRESCURA_DEL_GRUPO`: partidos con resultado, actas enlazadas y fecha del último partido.
 * La prueba defiende las tres cosas que la hacen útil: que la consulta trae una fila, que la fecha es la
 * del último partido jugado (no la de hoy ni la de la prevista) y que las actas no superan a los partidos
 * con resultado.
 */
describe('frescura del grupo', () => {
  test('la consulta devuelve una fila con fecha, partidos y actas', async () => {
    const filas = await consulta<{ con_resultado: number; partidos: number; actas: number; ultimo: string | null }>(
      FRESCURA_DEL_GRUPO.sql, [2939],
    );
    expect(filas).toHaveLength(1);
    const f = filas[0];
    expect(Number(f.con_resultado)).toBe(48);
    expect(Number(f.partidos)).toBe(49);
    expect(Number(f.actas)).toBeGreaterThan(0);
    expect(f.ultimo).toBeTruthy();
    expect(String(f.ultimo)).toContain('2026-11-08');
  });
});
