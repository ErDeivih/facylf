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

/*
 * Maqueta de FILA, recortada del fichero real que destapó el fallo:
 * `descargas-federacion/recolector-local/t22-2026-27/comp-24218963/grupo-24218968/jornadas/jornada-1.html.gz`
 * (Provincial Juvenil de Salamanca, jornada 1 de 2026-27). Una sola `<table>` con un `<tr>` por
 * partido, la fecha y la hora en `span.esconder` y el campo sin publicar.
 *
 * Antes del arreglo esta página daba 0 partidos: la jornada se guardaba sin marcador, la
 * clasificación no se podía reconstruir y la tabla oficial se quedaba sin jornada de corte.
 */
describe('parser de jornada (maqueta de una tabla con un partido por fila)', () => {
  const fila = (local: string, gl: number, gv: number, visitante: string, acta: string, fecha: string, hora: string, codLocal: number, codVisitante: number) => `
    <tr>
      <td width="45%" align="left" class="td_widget"><div class="wrapper_widget"><div class="font_widgetL">&nbsp;
        <a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=${codLocal}"> ${local} </a>
      </div></div></td>
      <td width="100" align="center" style="white-space:nowrap">
        <h4><strong>
          <span class="wid2_resultado_cerrada">${gl} -</span>
          <span class="wid2_resultado_cerrada"> ${gv} </span>
        </strong></h4>
        <h5>
          <span class="esconder"><i class="fa fa-clock-o" aria-hidden="true"></i> ${fecha} &nbsp;&nbsp;</span>
          <span class="esconder"> ${hora} &nbsp;&nbsp;</span>
          <a class="font-green-meadow" href="/pnfg/NFG_CmpPartido?cod_primaria=1000120&amp;CodActa=${acta}&amp;cod_acta=${acta}"><i class="fa fa-clipboard"></i></a>
        </h5>
      </td>
      <td width="45%" align="right" class="td_widget"><div class="wrapper_widget"><div class="font_widgetV">
        <a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=${codVisitante}"> ${visitante} </a>
      </div></div></td>
    </tr>`;

  const htmlFila = `<table class="table table-hover table-light"><tbody>
    ${fila('Cabrerizos C.F.', 2, 1, 'C.D. Cristo Rey Barrio Vidal', '26146776', '19-09-2026', '16:00', 12955, 12293)}
    ${fila('Ciudad Rodrigo C.F.', 2, 4, 'Unionistas de Salamanca C.F. " C "', '26146780', '19-09-2026', '19:45', 12153, 16257)}
  </tbody></table>`;

  it('lee los dos partidos de la tabla única, con marcador, fecha, hora y acta', () => {
    const r = parseaJornada(htmlFila, 1);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      jornada: 1,
      local: 'Cabrerizos C.F.',
      visitante: 'C.D. Cristo Rey Barrio Vidal',
      golesLocal: 2, golesVisitante: 1,
      fecha: '2026-09-19', hora: '16:00',
      codActa: '26146776', codLocal: '12955', codVisitante: '12293',
    });
    expect(r[1]).toMatchObject({
      local: 'Ciudad Rodrigo C.F.',
      visitante: 'Unionistas de Salamanca C.F. " C "',
      golesLocal: 2, golesVisitante: 4,
      fecha: '2026-09-19', hora: '19:45',
      codActa: '26146780',
    });
  });

  it('en esta maqueta el campo no se publica: queda a nulo en vez de inventarse', () => {
    expect(parseaJornada(htmlFila, 1).every((p) => p.campo === null && p.arbitro === null)).toBe(true);
  });

  it('las filas de una tabla de un solo partido NO se cuentan dos veces', () => {
    // Maqueta clásica: una tabla por partido. Sus <tr> también tienen dos marcadores y dos equipos,
    // así que sin la exclusión por tabla cada partido saldría duplicado.
    const clasica = `<table width="100%"><tbody>
      <tr>
        <td class="td_widget"><div class="font_widgetL"><h4><a href="NFG_VisEquipos?Codigo_Equipo=1"> Local A </a></h4></div></td>
        <td><h4><strong><span class="wid2_resultado_cerrada">3 -</span><span class="wid2_resultado_cerrada"> 0 </span></strong></h4>
          <span class="horario">01-01-2026</span><br><span class="horario">12:00</span></td>
        <td class="td_widget"><div class="font_widgetV"><h4><a href="NFG_VisEquipos?Codigo_Equipo=2"> Visitante A </a></h4></div></td>
      </tr>
      <tr><td colspan="9"><a href="NFG_VisCampos?Codigo_Campo=3537">C.M. La Era</a><strong>Árbitro: </strong>&nbsp;PEREZ,ANA</td></tr>
    </tbody></table>`;
    const r = parseaJornada(clasica, 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ local: 'Local A', golesLocal: 3, campo: 'C.M. La Era', arbitro: 'PEREZ,ANA' });
  });
});
