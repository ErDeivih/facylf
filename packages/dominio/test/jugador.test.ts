import { describe, expect, it } from 'vitest';
import { identificaJugadores, idDeJugador } from '../src/jugador.js';

describe('identificación de jugadores', () => {
  it('mismo nombre y mismo club en distintos años → misma persona', () => {
    const res = identificaJugadores([
      { nombre: 'GONZALEZ MENENDEZ, MARTIN', club: 'C.D.F. Cubillos', provincia: 'León', temporada: '2022/23', dorsal: 13 },
      { nombre: 'GONZALEZ MENENDEZ, MARTIN', club: 'C.D.F. Cubillos', provincia: 'León', temporada: '2023/24', dorsal: 13 },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]!.temporadas).toEqual(['2022/23', '2023/24']);
    expect(res[0]!.id).toBe(idDeJugador('GONZALEZ MENENDEZ, MARTIN', 'C.D.F. Cubillos', 'León'));
  });

  it('mismo nombre y provincia en temporadas distintas → candidato a la misma persona', () => {
    const res = identificaJugadores([
      { nombre: 'ALONSO REDERO, ALVAR', club: 'Unión Cacabelense', provincia: 'León', temporada: '2022/23' },
      { nombre: 'ALONSO REDERO, ALVAR', club: 'C.D.F. Eria', provincia: 'León', temporada: '2023/24' },
    ]);
    expect(res).toHaveLength(1);
  });

  it('cambia de club con el mismo código federativo → se conserva la identidad', () => {
    const res = identificaJugadores([
      { codigoJugador: '999', nombre: 'MARTINEZ VILAR, SAUL', club: 'C.D.F. Cubillos', provincia: 'León', temporada: '2022/23' },
      { codigoJugador: '999', nombre: 'MARTINEZ VILAR, SAUL', club: 'Atlético Trobajo H', provincia: 'León', temporada: '2023/24' },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0]!.clubes).toEqual(['C.D.F. Cubillos', 'Atlético Trobajo H']);
  });

  it('separa homónimos simultáneos y después prioriza club y equipo', () => {
    const res = identificaJugadores([
      { nombre: 'JUAN PEREZ, DAVID', provincia: 'Salamanca', club: 'Club A', equipo: 'A', temporada: '2022/23' },
      { nombre: 'JUAN PEREZ, DAVID', provincia: 'Salamanca', club: 'Club B', equipo: 'B', temporada: '2022/23' },
      { nombre: 'JUAN PEREZ, DAVID', provincia: 'Salamanca', club: 'Club B', equipo: 'B', temporada: '2023/24' },
    ]);
    expect(res).toHaveLength(2);
    expect(res.find((j) => j.clubes.includes('Club B'))?.temporadas).toEqual(['2022/23', '2023/24']);
  });
});
