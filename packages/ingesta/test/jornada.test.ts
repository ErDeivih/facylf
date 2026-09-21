import { describe, expect, it } from 'vitest';
import { parseaJornada } from '../src/parsers/jornada.js';

const html = `
  <table width="100%"><tbody>
    <tr>
      <td class="td_widget"><div class="font_widgetL"><h4><a href="NFG_VisEquipos?cod_primaria=1000119&Codigo_Equipo=16574"> C.D.F. Cubillos </a></h4></div></td>
      <td>
        <h4><strong>
          <span class="wid2_resultado_cerrada ntype"><i class="fa-solid">1</i> -</span>
          <span class="wid2_resultado_cerrada ntype"><i class="fa-solid"><style>#r:before{content:"1"}</style><span id="r"><span style="display:none;">9</span></span></i></span>
        </strong></h4>
        <span class="horario">15-10-2022</span><br><span class="horario">16:30</span>
      </td>
      <td class="td_widget"><div class="font_widgetV"><h4><a href="NFG_VisEquipos?cod_primaria=1000119&Codigo_Equipo=17092"> C. y D. Leonesa S.A.D. "C" </a></h4></div></td>
    </tr>
    <tr><td colspan="9">
      <a href="NFG_VisCampos?cod_primaria=1000122&Codigo_Campo=3537">C.M. La Era José Luis Novo</a>
      <strong>Árbitro: </strong>&nbsp;SUÁREZ GONZÁLEZ,RAQUEL
    </td></tr>
  </tbody></table>
`;

describe('parser de jornada (HTML real)', () => {
  it('saca local, visitante, marcador ofuscado, fecha, hora, campo, árbitro y acta', () => {
    const r = parseaJornada(html, 26);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      jornada: 26,
      local: 'C.D.F. Cubillos',
      visitante: 'C. y D. Leonesa S.A.D. "C"',
      golesLocal: 1, golesVisitante: 1,
      fecha: '2022-10-15', hora: '16:30',
      campo: 'C.M. La Era José Luis Novo',
      arbitro: 'SUÁREZ GONZÁLEZ,RAQUEL',
    });
  });

  it('descarta filas sin dos equipos (descanso/retirado)', () => {
    const vacio = `<table width="100%"><td><div class="font_widgetV"><h4>Descansa</h4></div></td></table>`;
    expect(parseaJornada(vacio, 26)).toHaveLength(0);
  });

  it('no interpreta una tabla contenedora como un partido adicional', () => {
    const partido = (local: string, visitante: string, marcador: string) => `<table>
      <tr><td><a href="NFG_VisEquipos?Codigo_Equipo=1">${local}</a></td>
      <td><span class="wid2_resultado_cerrada">${marcador.split('-')[0]}</span>
      <span class="wid2_resultado_cerrada">${marcador.split('-')[1]}</span></td>
      <td><a href="NFG_VisEquipos?Codigo_Equipo=2">${visitante}</a></td></tr></table>`;
    const resultado = parseaJornada(`<table><tr><td>
      ${partido('Local A', 'Visitante A', '2-1')}
      ${partido('Local B', 'Visitante B', '0-0')}
    </td></tr></table>`, 1);
    expect(resultado.map((p) => [p.local, p.visitante])).toEqual([
      ['Local A', 'Visitante A'],
      ['Local B', 'Visitante B'],
    ]);
  });
});
