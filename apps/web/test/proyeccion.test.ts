import { describe, expect, it } from 'vitest';
import {
  porcentajeDeProbabilidad, simulacionCubreLoQueQueda, textoDeTramo, tramoMasProbable, tramosDelReglamento,
} from '../src/lib/proyeccion';

const zonas = { ascensos: 1, promocion: 4, descensos: 3, promocion_permanencia: 0, origen: 'reglamento', confianza: 1, temporadas: null };

describe('proyección de la clasificación final', () => {
  it('el tramo más probable es el más corto que reúne el 80 %', () => {
    expect(tramoMasProbable([5, 40, 45, 8, 2])).toEqual({ desde: 2, hasta: 3, probabilidad: 85 });
    expect(tramoMasProbable([100, 0, 0])).toEqual({ desde: 1, hasta: 1, probabilidad: 100 });
    expect(tramoMasProbable([])).toBeNull();
  });

  it('ascenso y descenso son sumas de rangos del mismo equipo', () => {
    const probs = [10, 20, 20, 10, 10, 10, 5, 5, 4, 3, 2, 1];
    const t = tramosDelReglamento(probs, zonas);
    expect(t.ascenso).toEqual({ desde: 1, hasta: 1, probabilidad: 10 });
    expect(t.promocion).toEqual({ desde: 2, hasta: 5, probabilidad: 60 });
    expect(t.descenso).toEqual({ desde: 10, hasta: 12, probabilidad: 6 });
  });

  it('sin reglamento conocido no hay zonas', () => {
    expect(tramosDelReglamento([50, 50], null)).toEqual({ ascenso: null, promocion: null, descenso: null });
  });

  it('nombra el tramo y no redondea a 0 ni a 100 lo que no lo es', () => {
    expect(textoDeTramo({ desde: 1, hasta: 1 })).toBe('1.º');
    expect(textoDeTramo({ desde: 2, hasta: 5 })).toBe('2.º–5.º');
    expect(porcentajeDeProbabilidad(0.3)).toBe('<1 %');
    expect(porcentajeDeProbabilidad(99.6)).toBe('>99 %');
    expect(porcentajeDeProbabilidad(100)).toBe('100 %');
    expect(porcentajeDeProbabilidad(0)).toBe('0 %');
  });

  it('una simulación con tres aplazados no cubre 24 jornadas por jugar', () => {
    const base = { equipos: 18, jornadasPrevistas: 34, jornadaActual: 10 };
    expect(simulacionCubreLoQueQueda({ ...base, partidosPendientes: 3, partidosDeducidos: 0 })).toBe(false);
    expect(simulacionCubreLoQueQueda({ ...base, partidosPendientes: null, partidosDeducidos: null })).toBe(false);
    expect(simulacionCubreLoQueQueda({ ...base, partidosPendientes: 1, partidosDeducidos: 216 })).toBe(true);
    expect(simulacionCubreLoQueQueda({ equipos: 18, jornadasPrevistas: null, jornadaActual: 10, partidosPendientes: 3, partidosDeducidos: 0 })).toBe(true);
  });
});
