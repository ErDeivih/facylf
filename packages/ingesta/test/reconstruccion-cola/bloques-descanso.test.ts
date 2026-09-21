import { describe, expect, it } from 'vitest';
import { apartaBloqueDeLaComparacion } from '../../src/reconstruccion-cola/bloques-descanso.js';

/**
 * La regla que decide si un bloque de descanso sale de la comparación posición a posición.
 *
 * Estas pruebas son las que fallan con la implementación anterior, que buscaba la fila **en la cola** para
 * reconocer el bloque: en cuanto un lote retiraba esas filas —y retirarlas es justo lo que este trabajo
 * hace—, el bloque del HTML dejaba de reconocerse y desalineaba la jornada entera. El caso está marcado
 * abajo con «regresión medida».
 */
describe('apartaBloqueDeLaComparacion', () => {
  it('aparta el bloque cuyo acta nombra el descanso, esté o no la fila en la cola', () => {
    expect(apartaBloqueDeLaComparacion({ veredicto: 'descanso', enLaCola: true })).toBe(true);
    // Regresión medida: 12 bloques de Euskadi, ya retirados de la cola, seguían comparándose y
    // desalineaban 54 filas. Con la detección por la cola esta llamada devolvía `false`.
    expect(apartaBloqueDeLaComparacion({ veredicto: 'descanso', enLaCola: false })).toBe(true);
  });

  it('aparta el bloque que la fuente publica y la cola ya no tiene, si el acta no lo sostiene como partido', () => {
    // Sin acta: es el caso de las 551 filas retiradas de Euskadi.
    expect(apartaBloqueDeLaComparacion({ veredicto: 'sin-acta', enLaCola: false })).toBe(true);
    // Acta que no demuestra nada: tampoco hay nada que comparar, porque no hay fila en la cola.
    expect(apartaBloqueDeLaComparacion({ veredicto: 'no-demuestra', enLaCola: false })).toBe(true);
  });

  it('NO aparta lo que el acta no sostiene mientras la fila siga en la cola', () => {
    // Las dos lecturas existen y hay que compararlas: apartarlas sería dejar de declarar 4.888 filas.
    expect(apartaBloqueDeLaComparacion({ veredicto: 'sin-acta', enLaCola: true })).toBe(false);
    expect(apartaBloqueDeLaComparacion({ veredicto: 'no-demuestra', enLaCola: true })).toBe(false);
  });

  it('NUNCA aparta un acta que nombra dos equipos reales: ahí hubo partido', () => {
    expect(apartaBloqueDeLaComparacion({ veredicto: 'partido-real', enLaCola: true })).toBe(false);
    // Ni siquiera cuando la cola ya no tiene la fila: un partido documentado que falta tiene que verse.
    expect(apartaBloqueDeLaComparacion({ veredicto: 'partido-real', enLaCola: false })).toBe(false);
  });
});
