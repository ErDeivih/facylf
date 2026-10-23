import { describe, expect, it } from 'vitest';
import { modalidadDesdeNombre } from '../src/origen/vocabularios.js';

/*
 * «sala» como subcadena convertía en fútbol sala cualquier competición de Salamanca (30/09/2026).
 */
describe('modalidad a partir del nombre publicado', () => {
  it('Salamanca, Salas de los Infantes o Salardú no son fútbol sala', () => {
    for (const nombre of [
      '1ª División Provincial de Juveniles, Primera - Salamanca',
      'Primera Provincial Aficionado Salamanca Grupo 2',
      'Liga Comarcal Salas de los Infantes',
      'Torneig Salardú',
    ]) {
      expect(modalidadDesdeNombre(nombre).modalidad).not.toBe('sala');
    }
  });

  it('sigue reconociendo el fútbol sala en castellano, catalán, euskera y la palabra suelta', () => {
    for (const nombre of [
      'Tercera División Fútbol Sala', 'FUTBOL SALA Juvenil', 'Lliga Futsal',
      'Areto futbola Kadete', 'RONDES ELIMINATÒRIES ALEVÍ SALA', 'Sala - Primera Regional',
    ]) {
      expect(modalidadDesdeNombre(nombre).modalidad).toBe('sala');
    }
  });

  it('fútbol 7, fútbol 8 y playa no cambian', () => {
    expect(modalidadDesdeNombre('Liga Fútbol 7 Benjamín').modalidad).toBe('futbol7');
    expect(modalidadDesdeNombre('Fútbol 8 Alevín Salamanca').modalidad).toBe('futbol8');
    expect(modalidadDesdeNombre('Fútbol Playa').modalidad).toBe('playa');
    expect(modalidadDesdeNombre('Primera - Salamanca').modalidad).toBe('desconocida');
  });
});
