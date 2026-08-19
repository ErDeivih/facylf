import { describe, expect, it } from 'vitest';
import { descansos, finesDeSemana, proximoPartido } from '../src/calendario.js';
import { sabadoDe, sumaDias } from '../src/fechas.js';
import type { Partido } from '../src/tipos.js';

const YO = 'C.D. Munibar Pizarrales "B"';
const partidos: Partido[] = [
  { jornada: 1, fecha: '2026-09-20', local: 'C.D.F. Helmántico', visitante: YO, golesLocal: 1, golesVisitante: 2 },
  { jornada: 1, fecha: '2026-09-20', local: 'C.D. Ribert', visitante: 'C.D. Guijuelo', golesLocal: null, golesVisitante: null },
  { jornada: 2, fecha: '2026-09-27', local: 'C.D. Ribert', visitante: 'C.D. Guijuelo', golesLocal: null, golesVisitante: null },
  { jornada: 3, fecha: '2026-10-04', local: YO, visitante: 'C.D. Villamayor', golesLocal: null, golesVisitante: null },
];

describe('fechas', () => {
  it('encuentra el sábado de la semana', () => {
    expect(sabadoDe('2026-09-20')).toBe('2026-09-19'); // domingo → sábado anterior
    expect(sabadoDe('2026-09-19')).toBe('2026-09-19');
    expect(sumaDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('calendario', () => {
  it('parte la temporada en fines de semana', () => {
    const ws = finesDeSemana(partidos, YO, '2026-09-19', '2026-10-04');
    expect(ws.map((w) => w.sabado)).toEqual(['2026-09-19', '2026-09-26', '2026-10-03']);
    expect(ws[0]!.propios).toHaveLength(1);
    expect(ws[1]!.propios).toHaveLength(0);
    expect(ws[1]!.liga).toHaveLength(1);
  });

  it('distingue el parón de la jornada en la que descansamos', () => {
    const d = descansos(partidos, YO, '2026-09-19', '2026-10-04');
    expect(d).toHaveLength(1);
    expect(d[0]!.motivo).toBe('jornada-sin-nosotros');
  });

  it('reconoce el parón de verdad y lo explica con el festivo', () => {
    const conParon: Partido[] = [
      { jornada: 6, fecha: '2026-10-25', local: YO, visitante: 'C.D. Ribert', golesLocal: null, golesVisitante: null },
      { jornada: 7, fecha: '2026-11-08', local: 'C.D. Ribert', visitante: YO, golesLocal: null, golesVisitante: null },
    ];
    const d = descansos(conParon, YO, '2026-10-24', '2026-11-08');
    expect(d).toHaveLength(1);
    expect(d[0]!.sabado).toBe('2026-10-31');
    expect(d[0]!.motivo).toBe('paron');
    expect(d[0]!.festivo?.nombre).toBe('Todos los Santos');
  });

  it('encuentra el próximo partido y de quién es el campo', () => {
    const pr = proximoPartido(partidos, YO, '2026-09-28')!;
    expect(pr.rival).toBe('C.D. Villamayor');
    expect(pr.enCasa).toBe(true);
    expect(pr.diasRestantes).toBe(6);
  });

  it('devuelve null cuando ya no queda nada', () => {
    expect(proximoPartido(partidos, YO, '2027-06-01')).toBeNull();
  });
});
