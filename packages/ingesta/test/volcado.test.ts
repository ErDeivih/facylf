import { describe, expect, it } from 'vitest';
import { equiposDe, partidosDe, hashPorJornada, jornadasCambiadas, slugEquipo } from '../src/volcado.js';
import type { Calendario } from '../src/parsers/calendario.js';

const calendario: Calendario = {
  partidos: [
    { jornada: 1, fecha: null, local: 'C.D. Munibar Pizarrales "B"', visitante: 'C.D. Guijuelo', golesLocal: null, golesVisitante: null },
    { jornada: 1, fecha: null, local: 'C.D. Guijuelo', visitante: 'C.D. Cristo Rey Barrio Vidal', golesLocal: null, golesVisitante: null },
    { jornada: 2, fecha: null, local: 'C.D. Cristo Rey Barrio Vidal', visitante: 'C.D. Munibar Pizarrales "B"', golesLocal: null, golesVisitante: null },
  ],
  equipos: ['C.D. Munibar Pizarrales "B"', 'C.D. Guijuelo', 'C.D. Cristo Rey Barrio Vidal'],
  jornadas: 2,
  fechaDeJornada: new Map([[1, '2026-09-20'], [2, '2026-09-27']]),
};

describe('vuelco a la base de datos', () => {
  it('prepara los equipos únicos con su filial y slug', () => {
    const e = equiposDe(calendario);
    expect(e).toHaveLength(3);
    const b = e.find((x) => x.slug.includes('#b'));
    expect(b?.filial).toBe('B');
    expect(b?.nombre).toBe('C.D. Munibar Pizarrales B');
    expect(e.find((x) => x.slug === slugEquipo('C.D. Guijuelo'))?.nombre_fed).toBe('C.D. Guijuelo');
  });

  it('mapa partidos a filas con la fecha de jornada', () => {
    const p = partidosDe(calendario, calendario.fechaDeJornada);
    expect(p).toHaveLength(3);
    expect(p[0]).toMatchObject({ jornada: 1, fecha_jornada: '2026-09-20', local_slug: slugEquipo('C.D. Munibar Pizarrales "B"') });
  });

  it('detecta qué jornadas han cambiado comparando el hash', () => {
    const a = hashPorJornada(partidosDe(calendario, calendario.fechaDeJornada));
    const b = { ...a, 2: 'cambio' }; // simulamos que la jornada 2 cambió
    expect(jornadasCambiadas(a, b)).toEqual([2]);
    expect(jornadasCambiadas(a, a)).toEqual([]);
  });
});
