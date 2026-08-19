import { describe, expect, it } from 'vitest';
import { clave, comparaEquipos, mismoEquipo, normaliza, sufijoFilial } from '../src/normaliza.js';

describe('normaliza', () => {
  it('quita prefijos, tildes y puntuación', () => {
    expect(normaliza('C.D. Munibar Pizarrales')).toBe('munibarpizarrales');
    expect(normaliza('C.D.M. Pizarrales')).toBe('pizarrales');
    expect(normaliza('C.D.F. Helmántico')).toBe('helmantico');
    expect(normaliza('C.D. Peñaranda de Bracamonte')).toBe('penarandadebracamonte');
  });

  it('saca el sufijo de filial', () => {
    expect(sufijoFilial('C.D. Munibar Pizarrales "B"')).toBe('B');
    expect(sufijoFilial('Unionistas de Salamanca C.F. "C"')).toBe('C');
    expect(sufijoFilial('C.D. Guijuelo')).toBeNull();
  });

  it('no confunde el filial con el primer equipo', () => {
    expect(mismoEquipo('C.D. Navega "B"', 'C.D. Navega "C"')).toBe(false);
    expect(clave('C.D. Navega "B"')).not.toBe(clave('C.D. Navega'));
  });

  it('acepta el nombre sin sufijo, pero lo marca como dudoso', () => {
    // el PDF de la cuadrícula escribe el mismo equipo sin las comillas
    const r = comparaEquipos('C.D. Munibar Pizarrales "B"', 'C.D. Munibar Pizarrales');
    expect(r).toEqual({ igual: true, dudoso: true });
  });

  it('el mismo equipo escrito de dos formas es el mismo', () => {
    expect(mismoEquipo('U.D. Santa Marta de Tormes "B"', 'Santa Marta de Tormes "B"')).toBe(true);
  });
});
