/**
 * El calendario imposible: la puerta que impide que entren partidos que no existieron.
 *
 * Todo lo que se prueba aquí salió de una medición sobre colas reales el 24/09/2026, y las dos primeras
 * pruebas existen porque la primera versión de la regla estaba MAL y marcaba ligas normales.
 */
import { describe, expect, it } from 'vitest';
import { calendarioImposible, filaDeDescanso } from '../src/origen/calendario-imposible.js';

const fila = (jornada: number, local: string, visitante: string) => ({ jornada, local, visitante });

describe('calendario imposible', () => {
  it('detecta el defecto de copia: todas las jornadas con las mismas parejas y el mismo lado', () => {
    // El caso real, grupo catalán 58161925: 34 jornadas con las mismas 9 parejas.
    const parejas: Array<[string, string]> = [['A', 'B'], ['C', 'D'], ['E', 'F']];
    const filas = Array.from({ length: 34 }, (_, i) => parejas.map(([l, v]) => fila(i + 1, l, v))).flat();
    const veredicto = calendarioImposible(filas);
    expect(veredicto?.motivo).toBe('todas-las-jornadas-iguales');
    expect(veredicto?.jornadas).toBe(34);
    expect(veredicto?.parejas).toBe(3);
  });

  it('una ida y vuelta NO es un calendario imposible', () => {
    // El error de la primera versión: comparar sólo los equipos hacía que la vuelta pareciera la ida, y
    // marcaba 434 grupos normales de fuera de Cataluña.
    const filas = [fila(1, 'A', 'B'), fila(1, 'C', 'D'), fila(2, 'B', 'A'), fila(2, 'D', 'C')];
    expect(calendarioImposible(filas)).toBeNull();
  });

  it('repetir la jornada repitiendo el lado SÍ se detecta', () => {
    const filas = [fila(1, 'A', 'B'), fila(2, 'A', 'B'), fila(3, 'A', 'B')];
    expect(calendarioImposible(filas)?.motivo).toBe('todas-las-jornadas-iguales');
  });

  it('detecta el caso de dos jornadas repetidas, que la huella estricta no ve', () => {
    // El caso real: 240 partidos con 16 parejas y 30 jornadas, o sea DOS jornadas alternándose. La regla
    // estricta no lo ve (16 × 30 = 480 ≠ 240) y sin esta segunda regla entraría igual.
    const pares: Array<[string, string]> = Array.from({ length: 16 }, (_, i) => [`E${i}`, `F${i}`]);
    const filas = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? pares.slice(0, 8) : pares.slice(8))
      .map(([l, v]) => fila(i + 1, l, v))).flat();
    expect(filas).toHaveLength(240);
    const veredicto = calendarioImposible(filas);
    expect(veredicto?.motivo).toBe('demasiadas-vueltas');
    expect(veredicto?.parejas).toBe(16);
    expect(veredicto?.jornadas).toBe(30);
  });

  it('un grupo normal de liga no se marca', () => {
    // Cuatro equipos, tres jornadas, seis parejas: cada jornada empareja distinto.
    const filas = [
      fila(1, 'A', 'B'), fila(1, 'C', 'D'),
      fila(2, 'A', 'C'), fila(2, 'B', 'D'),
      fila(3, 'A', 'D'), fila(3, 'B', 'C'),
    ];
    expect(calendarioImposible(filas)).toBeNull();
  });

  it('el descanso no cuenta como partido', () => {
    // Sin descontarlo, el grupo 795406 de La Rioja salía marcado con 42 «partidos» de `Descansa vs Descansa`.
    const filas = [fila(1, 'Descansa', 'Descansa'), fila(1, 'C.D. CERVERANO', 'Descansa'), fila(2, 'Descansa (Ganador)', 'Descansa')];
    expect(filas.every(filaDeDescanso)).toBe(true);
    expect(calendarioImposible(filas)).toBeNull();
  });

  it('`C.D. DESCANSO` NO es la palabra descanso: es un equipo que se llama así', () => {
    // La regla es palabra entera, nunca «contiene»: por eso esto no se descarta.
    expect(filaDeDescanso(fila(1, 'C.D. DESCANSO', 'A'))).toBe(false);
    expect(filaDeDescanso(fila(1, 'Descansa', 'A'))).toBe(true);
    expect(filaDeDescanso(fila(1, 'Atsedena', 'A'))).toBe(true);
  });

  it('con menos de dos partidos no hay nada que decidir', () => {
    expect(calendarioImposible([])).toBeNull();
    expect(calendarioImposible([fila(1, 'A', 'B')])).toBeNull();
  });
});
