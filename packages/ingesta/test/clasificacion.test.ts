import { describe, expect, it } from 'vitest';
import { parseaClasificacionHtml } from '../src/parsers/clasificacion.js';

describe('parseaClasificacionHtml', () => {
  it('extrae la tabla resumen oficial y su sancion', () => {
    const html = `<table>
      <tr><th>Equipos</th><th>Partidos</th><th>Ultimos</th><th>Sancion</th></tr>
      <tr><th>Ordenar por</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th></th><th>Puntos</th></tr>
      <tr><td></td><td>1</td><td><a href="NFG_VisCompeticiones_Grupo?codequipo=15788">C.D. Ribert</a></td>
        <td>67</td><td>26</td><td>22</td><td>1</td><td>3</td><td>G G E P G</td><td>-2</td></tr>
    </table>`;
    expect(parseaClasificacionHtml(html)).toEqual([{
      posicion: 1, equipoCodigo: '15788', equipo: 'C.D. Ribert', puntos: 67,
      jugados: 26, ganados: 22, empatados: 1, perdidos: 3,
      ultimos: ['G', 'G', 'E', 'P', 'G'], sancion: -2,
    }]);
  });

  it('ignora tablas de resultados sin cabecera de clasificacion', () => {
    expect(parseaClasificacionHtml('<table><tr><td>Local 2 - 1 Visitante</td></tr></table>')).toEqual([]);
  });
});
