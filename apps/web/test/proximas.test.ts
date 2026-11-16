import { describe, expect, it } from 'vitest';
import { agrupaProximos, diaCorto, diaYMes, leeFiltrosProximas, linea1X2, urlDeProximas } from '../src/lib/proximas';
import type { FilaProximoPartido, FilaProximosPorCompeticion } from '../src/consultas/partidos';

const partido = (x: Partial<FilaProximoPartido>): FilaProximoPartido => ({
  match_id: 1, grupo_id: 10, grupo: 'Grupo A', edicion: 'Primera Regional', edicion_id: 100, categoria: 'aficionados',
  jornada: 11, orden: 1, fecha: '2026-11-21', local: 'A', visitante: 'B',
  pred_local: 49.8, pred_empate: 11.7, pred_visitante: 38.6, pred_marcador: '2-1', ...x,
});
const resumen = (x: Partial<FilaProximosPorCompeticion>): FilaProximosPorCompeticion => ({
  edicion_id: 100, edicion: 'Primera Regional', categoria: 'aficionados', grupo_id: 10, grupos: 2,
  ultimo_resultado: '2026-11-08', proximos: 2, atrasados: 3, ...x,
});

describe('próximos partidos', () => {
  it('los filtros que no encajan vuelven al valor por defecto', () => {
    expect(leeFiltrosProximas({ dias: '14', categoria: 'juvenil' })).toEqual({ dias: 14, categoria: 'juvenil' });
    expect(leeFiltrosProximas({ dias: '999', categoria: "x'; drop" })).toEqual({ dias: 7, categoria: null });
    expect(urlDeProximas({ dias: 7, categoria: null })).toBe('/explorar/proximas');
    expect(urlDeProximas({ dias: 30, categoria: 'cadete' })).toBe('/explorar/proximas?dias=30&categoria=cadete');
  });

  it('agrupa por competición y grupo, y aparta las competiciones sin próximos', () => {
    const { con, sin } = agrupaProximos(
      [partido({}), partido({ match_id: 2, grupo_id: 11, grupo: 'Grupo B' }), partido({ match_id: 3 })],
      [resumen({}), resumen({ edicion_id: 200, edicion: 'Juvenil Provincial', proximos: 0, atrasados: 12 })],
    );
    expect(con).toHaveLength(1);
    expect(con[0].partidos).toBe(3);
    expect(con[0].grupos.map((g) => [g.grupo, g.partidos.length])).toEqual([['Grupo A', 2], ['Grupo B', 1]]);
    expect(con[0].ultimoResultado).toBe('2026-11-08');
    expect(sin.map((s) => s.edicion)).toEqual(['Juvenil Provincial']);
  });

  it('escribe la fecha y el 1-X-2 en corto', () => {
    expect(diaCorto('2026-11-21')).toBe('sáb 21 nov');
    expect(diaYMes('2026-11-08')).toBe('8 nov');
    expect(linea1X2(partido({}))).toBe('1 49,8 % · X 11,7 % · 2 38,6 %');
    expect(linea1X2(partido({ pred_empate: null }))).toBeNull();
  });
});
