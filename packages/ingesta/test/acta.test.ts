import { describe, expect, it } from 'vitest';
import { parseaActa } from '../src/parsers/acta.js';

const html = `
  <h2 class="ntype"><strong>5 - 2</strong></h2>
  <div class="font_widget1">Arandina C.F. "B"</div>
  <div class="font_widgetV">Burgos U.D. "B"</div>
  <strong>Árbitro: </strong>CALVO LÓPEZ, NICOLÁS

  <h5><strong>Arandina C.F. "B"</strong></h5>
  <h5><strong>Titulares</strong></h5>
  <table class="table table-striped table-hover">
    <tr onclick="location.href='NFG_EstadisticasJugador?cod_primaria=3000328&jugador=91027&codacta=25963815'">
      <td style="text-align:center">1</td><td class="font-responsive">BONILLA GARCIA, DIEGO ENRIQUE</td>
    </tr>
    <tr onclick="location.href='NFG_EstadisticasJugador?cod_primaria=3000328&jugador=91133&codacta=25963815'">
      <td style="text-align:center">2</td><td class="font-responsive">ALONSO REDERO, ALVAR</td>
    </tr>
  </table>
  <h5><strong>Suplentes</strong></h5>
  <table class="table table-striped table-hover">
    <tr onclick="location.href='NFG_EstadisticasJugador?cod_primaria=3000328&jugador=999&codacta=25963815'">
      <td style="text-align:center">13</td><td class="font-responsive">MARTINEZ VILAR, SAUL</td>
    </tr>
  </table>
`;

describe('parser de acta', () => {
  it('saca marcador, equipos, árbitro y alineaciones por equipo (titulares+suplentes)', () => {
    const a = parseaActa(html);
    expect(a.golesLocal).toBe(5);
    expect(a.golesVisitante).toBe(2);
    expect(a.local).toBe('Arandina C.F. "B"');
    expect(a.visitante).toBe('Burgos U.D. "B"');
    expect(a.arbitro).toBe('CALVO LÓPEZ, NICOLÁS');
    expect(a.lineups.local.titulares).toHaveLength(2);
    expect(a.lineups.local.titulares[0]).toEqual({
      dorsal: 1, nombre: 'BONILLA GARCIA, DIEGO ENRIQUE', codigoJugador: '91027',
    });
    expect(a.lineups.local.suplentes).toHaveLength(1);
    expect(a.lineups.local.suplentes[0]?.nombre).toBe('MARTINEZ VILAR, SAUL');
    expect(a.lineups.local.portero).toBe('BONILLA GARCIA, DIEGO ENRIQUE');
  });

  it('repara el mojibake latin-1/UTF-8 sin corromper el texto ya correcto', () => {
    // En el sitio el acento llega doble-codificado: "Ã³" es la interpretación latin-1 de "ó".
    const a = parseaActa(`
      <h2 class="ntype"><strong>1 - 0</strong></h2>
      <div class="font_widget1">C.D. Casa de Asturias en LeÃ³n</div>
      <div class="font_widgetV">UniÃ³n Cacabelense</div>
    `);
    expect(a.local).toBe('C.D. Casa de Asturias en León');
    expect(a.visitante).toBe('Unión Cacabelense');
    // El texto ya correcto no debe tocarse (ó no se convierte en mojibake).
    const b = parseaActa(`
      <h2 class="ntype"><strong>2 - 2</strong></h2>
      <div class="font_widget1">Arandina C.F. "B"</div>
      <div class="font_widgetV">Burgos U.D. "B"</div>
    `);
    expect(b.local).toBe('Arandina C.F. "B"');
    expect(b.visitante).toBe('Burgos U.D. "B"');
  });

  it('descodifica CSS y ntype sin confundir señuelos ni la temporada con el marcador', () => {
    const a = parseaActa(`
      <h5>Temporada 2025-2026 Jornada 4</h5>
      <h2 class="ntype"><strong>
        <i><style>#l:before{content:"3"}</style><span id="l"><span style="display:none">8</span></span></i>
        -
        <i class="fa-solid"><i class="fa-2"><script>ntype("v",0,0,"fa-5")</script><span style="display:none">5</span></i></i>
      </strong></h2>
    `);
    expect([a.golesLocal, a.golesVisitante]).toEqual([3, 2]);
  });

  it('compone marcadores de dos cifras conservando el orden de cada dígito', () => {
    const a = parseaActa(`
      <h2 class="ntype"><strong>
        <i><style>#l:before{content:"1"}</style><span id="l">5</span></i>
        -
        <i class="fa-1"></i><i class="fa-1"></i>
      </strong></h2>
    `);
    expect([a.golesLocal, a.golesVisitante]).toEqual([15, 11]);

    const b = parseaActa(`
      <h2 class="ntype"><strong>1<i class="fa-3"></i> - <i class="fa-2"></i>0</strong></h2>
    `);
    expect([b.golesLocal, b.golesVisitante]).toEqual([13, 20]);

    // En las capturas HTTP antiguas fa-8 era un señuelo: ntype lo sustituía
    // por fa-1 y el cero visible completaba el resultado 10.
    const c = parseaActa(`
      <h2 class="ntype"><strong>
        <script>var d=[2,5,9,4,1,0,8,6,3,7,1,3,5,7,9,0,2,4,6,8,0,2,4,6,8,1,3,5,7,9,7,5,2,0,9,6,3,8,4,1]</script>1 -
        <i id="resultado" class="fa-8"><script>ntype("resultado",4,0,"fa-8")</script>0<span style="display:none">8</span></i>
      </strong></h2>
    `);
    expect([c.golesLocal, c.golesVisitante]).toEqual([1, 10]);
  });

  it('lee goles, cambios, tarjetas y técnicos desde sus filas completas', () => {
    const a = parseaActa(`
      <h2 class="ntype"><strong>1 - 0</strong></h2>
      <div class="dashboard-stat"><div class="details"><div class="number">Goles</div><div class="desc">
        <table><tr><td>1 - 0</td><td><span class="font-blue">(90'+2)</span> PÉREZ GARCÍA, MIGUEL</td></tr></table>
      </div></div></div>
      <div><h4>Cuerpo Técnico</h4>
        <h5><strong>Entrenador: </strong><table><tr><td>foto</td><td>GÓMEZ LÓPEZ, ANA</td></tr></table></h5>
        <h4>Sustituciones</h4><table>
          <tr><td>16</td><td>RODRÍGUEZ DÍAZ, PABLO</td><td><i class="font-green-meadow"></i></td></tr>
          <tr><td>7</td><td><span>(61')</span> SÁNCHEZ MARTÍN, LUIS</td><td><i class="font-red"></i></td></tr>
        </table>
        <h4>Tarjetas</h4><table><tr><td><img src="tarj_roja.gif"></td><td><span>(75')</span> SÁNCHEZ MARTÍN, LUIS</td></tr></table>
      </div>
    `);
    expect(a.goles).toEqual([{ minuto: 92, minutoBase: 90, minutoAnadido: 2,
      jugador: 'PÉREZ GARCÍA, MIGUEL', tipo: 'normal', lado: 'local', ladoBeneficiado: 'local' }]);
    expect(a.tecnicos).toEqual([{ lado: 'local', rol: 'Entrenador', nombre: 'GÓMEZ LÓPEZ, ANA' }]);
    expect(a.cambios).toEqual([{ dorsalSaliente: 7, saliente: 'SÁNCHEZ MARTÍN, LUIS', minuto: 61,
      minutoBase: 61, minutoAnadido: null, dorsalEntrante: 16,
      entrante: 'RODRÍGUEZ DÍAZ, PABLO', lado: 'local' }]);
    expect(a.tarjetas).toEqual([{ tipo: 'roja', minuto: 75, minutoBase: 75,
      minutoAnadido: null, jugador: 'SÁNCHEZ MARTÍN, LUIS', lado: 'local' }]);
  });

  it('distingue penaltis, propia puerta y las dos formas de minuto añadido', () => {
    const a = parseaActa(`
      <div class="dashboard-stat"><div class="details"><div class="number">Goles</div><div class="desc"><table>
        <tr><td><a class="img lgol" title="Gol de penalti"></a></td>
          <td><span>(45+2')</span> ANA MARTÍN</td></tr>
        <tr><td><a class="img lgol" title="Gol en propia puerta"></a></td>
          <td><span>(90'+3)</span> LUCÍA PÉREZ</td></tr>
      </table></div></div></div>
    `);
    expect(a.goles).toEqual([
      { minuto: 47, minutoBase: 45, minutoAnadido: 2, jugador: 'ANA MARTÍN', tipo: 'penalti' },
      { minuto: 93, minutoBase: 90, minutoAnadido: 3, jugador: 'LUCÍA PÉREZ', tipo: 'propia-puerta' },
    ]);
  });

  it('deduce el lado de los goles por la evolución del marcador aunque no haya alineaciones', () => {
    const a = parseaActa(`
      <div class="dashboard-stat"><div class="details"><div class="number">Goles</div><div class="desc"><table>
        <tr><td><a class="img lgol" title="Gol normal"></a> <i>1</i> - <i>0</i></td>
          <td><span>(12')</span> ANA MARTÍN</td></tr>
        <tr><td><a class="img lgol" title="Gol normal"></a> <i>1</i> - <i>1</i></td>
          <td><span>(27')</span> BEA LÓPEZ</td></tr>
        <tr><td><a class="img lgol" title="Gol en propia puerta"></a> <i>1</i> - <i>2</i></td>
          <td><span>(44')</span> CARLA PÉREZ</td></tr>
      </table></div></div></div>
    `);
    expect(a.goles.map((gol) => ({ jugador: gol.jugador, lado: gol.lado,
      ladoBeneficiado: gol.ladoBeneficiado }))).toEqual([
      { jugador: 'ANA MARTÍN', lado: 'local', ladoBeneficiado: 'local' },
      { jugador: 'BEA LÓPEZ', lado: 'visitante', ladoBeneficiado: 'visitante' },
      { jugador: 'CARLA PÉREZ', lado: 'local', ladoBeneficiado: 'visitante' },
    ]);
  });

  it('limpia el marcador de minuto vacío y descarta una fila de gol sin jugador', () => {
    const a = parseaActa(`
      <div class="dashboard-stat"><div class="details"><div class="number">Goles</div><table>
        <tr><td><a class="img lgol" title="Gol normal"></a> 1 - 0</td><td>(') ANA MARTÍN</td></tr>
        <tr><td><a class="img lgol" title="Gol normal"></a> 2 - 0</td><td>(')</td></tr>
      </table></div></div>
    `);
    expect(a.goles).toEqual([{ minuto: null, minutoBase: null, minutoAnadido: null,
      jugador: 'ANA MARTÍN', tipo: 'normal', lado: 'local', ladoBeneficiado: 'local' }]);
  });

  it('trata el minuto federativo 999 como una incidencia sin minuto', () => {
    const a = parseaActa(`
      <h4>Tarjetas</h4><table>
        <tr><td><img src="tarj_roja.gif"></td><td><span>(999')</span> ANA MARTÍN</td></tr>
      </table>
    `);
    expect(a.tarjetas).toEqual([{ tipo: 'roja', minuto: null, minutoBase: null,
      minutoAnadido: null, jugador: 'ANA MARTÍN', lado: 'local' }]);
  });

  it('no convierte una errata de minuto imposible en minutos jugados', () => {
    const a = parseaActa(`
      <h4>Sustituciones</h4><table>
        <tr><td>14</td><td>GONZÁLEZ, CHRISTIAN</td><td><i class="font-green-meadow"></i></td></tr>
        <tr><td>18</td><td><span>(881')</span> RODRÍGUEZ, JAIME</td><td><i class="font-red"></i></td></tr>
      </table>
    `);
    expect(a.cambios).toEqual([{ dorsalSaliente: 18, saliente: 'RODRÍGUEZ, JAIME',
      minuto: null, minutoBase: null, minutoAnadido: null, dorsalEntrante: 14,
      entrante: 'GONZÁLEZ, CHRISTIAN', lado: 'local' }]);
  });

  it('marca como doble amarilla la segunda amonestación del mismo jugador', () => {
    const a = parseaActa(`
      <h4>Tarjetas</h4><table>
        <tr><td><img src="tarj_amar.gif"></td><td><span>(35')</span> ANA MARTÍN</td></tr>
        <tr><td><img src="tarj_amar.gif"></td><td><span>(71')</span> ANA MARTÍN</td></tr>
      </table>
    `);
    expect(a.tarjetas.map((t) => t.tipo)).toEqual(['amarilla', 'doble-amarilla']);
  });

  it('recupera técnicos de capturas antiguas con HTML desanidado', () => {
    const a = parseaActa(`
      <h2 class="ntype"><strong>1 - 0</strong></h2>
      <h4>Cuerpo Técnico</h4>
      <strong>Entrenador: </strong><br><tr><td>foto</td><td>ROMERO GONZALEZ, SERGIO</td></tr><br>
      <h4>Sustituciones</h4>
      <h4>Cuerpo Técnico</h4>
      <strong>Delegado de Equipo: </strong><br><tr><td>foto</td><td>MIGUELEZ MORAN, TOMAS ANGEL</td></tr><br>
      <h4>Sustituciones</h4>
    `);
    expect(a.tecnicos).toEqual([
      { lado: 'local', rol: 'Entrenador', nombre: 'ROMERO GONZALEZ, SERGIO' },
      { lado: 'visitante', rol: 'Delegado de Equipo', nombre: 'MIGUELEZ MORAN, TOMAS ANGEL' },
    ]);
  });

  it('no convierte los textos de ausencia de técnico en personas', () => {
    const a = parseaActa(`
      <h4>Langile Teknikoak</h4>
      <h5><strong>Entrenatzailea: </strong> Ez du aurkezten </h5>
      <h4>Langile Teknikoak</h4>
      <h5><strong>Entrenatzailea: </strong> No presenta </h5>
    `);
    expect(a.tecnicos).toEqual([]);
    expect(a.tecnico).toEqual({});
  });

  it('separa completas las dos alineaciones antiguas aunque no repitan el nombre del equipo', () => {
    const jugadores = (prefijo: string, inicio: number, cantidad: number) => Array.from(
      { length: cantidad }, (_, i) => `<tr onclick="location.href='?jugador=${inicio + i}'">
        <td>${i + 1}</td><td>${prefijo} APELLIDO, JUGADOR</td></tr>`,
    ).join('');
    const a = parseaActa(`
      <h2 class="ntype"><strong>2 - 1</strong></h2>
      <table><tr><td><div class="font_widgetL">Equipo Local</div></td>
        <td><div class="font_widgetV">Equipo Visitante</div></td></tr></table>
      <div class="row nova_text">
        <div class="col-sm-4 col-sm-pull-4"><div class="details"><div class="desc">
          <h5>Titulares</h5><table>${jugadores('LOCAL', 100, 11)}</table>
          <h5>Suplentes</h5><table>${jugadores('BANQUILLO LOCAL', 200, 5)}</table>
        </div></div></div>
        <div class="col-sm-4"><div class="details"><div class="desc">
          <h5>Titulares</h5><table>${jugadores('VISITANTE', 300, 11)}</table>
          <h5>Suplentes</h5><table>${jugadores('BANQUILLO VISITANTE', 400, 6)}</table>
        </div></div></div>
      </div>
    `);
    expect(a.lineups.local.titulares).toHaveLength(11);
    expect(a.lineups.local.suplentes).toHaveLength(5);
    expect(a.lineups.visitante.titulares).toHaveLength(11);
    expect(a.lineups.visitante.suplentes).toHaveLength(6);
    expect(a.lineups.local.titulares[0]?.codigoJugador).toBe('100');
    expect(a.lineups.visitante.titulares[0]?.codigoJugador).toBe('300');
    expect(a.lineups.local.portero).toBe('LOCAL APELLIDO, JUGADOR');
    expect(a.lineups.visitante.portero).toBe('VISITANTE APELLIDO, JUGADOR');
  });

  it('conserva apodos cortos usados como nombre federativo', () => {
    const a = parseaActa(`
      <div class="font_widgetL">Equipo Local</div><div class="font_widgetV">Equipo Visitante</div>
      <h5>Titulares</h5><table>
        <tr onclick="location.href='?jugador=9103885'"><td>10</td><td>HUGO</td></tr>
      </table>
    `);
    expect(a.lineups.local.titulares).toEqual([
      { dorsal: 10, nombre: 'HUGO', codigoJugador: '9103885' },
    ]);
  });

  it('conserva nombres federativos que incluyen un número', () => {
    const a = parseaActa(`
      <div class="font_widgetL">Equipo Local</div><div class="font_widgetV">Equipo Visitante</div>
      <h5>Titulares</h5><table>
        <tr onclick="location.href='?jugador=123'"><td>9</td><td></td><td>León 8</td></tr>
      </table>
    `);
    expect(a.lineups.local.titulares[0]).toEqual({
      dorsal: 9, nombre: 'León 8', codigoJugador: '123',
    });
  });

  it('lee la variante canaria del árbitro y las alineaciones rotuladas en euskera', () => {
    const jugadores = (inicio: number, cantidad: number) => Array.from(
      { length: cantidad }, (_, i) => `<tr onclick="location.href='?jugador=${inicio + i}'">
        <td>${i + 1}</td><td>JOKALARI ABIZENA, ${i + 1}</td></tr>`,
    ).join('');
    const a = parseaActa(`
      <strong>Árbitro/a Principal</strong>&nbsp;SUÁREZ CEBALLOS, GIOVANNI
      <h5>Titularrak</h5><table>${jugadores(100, 11)}</table>
      <h5>Ordezkoak</h5><table>${jugadores(200, 4)}</table>
      <h5>Titularrak</h5><table>${jugadores(300, 11)}</table>
      <h5>Ordezkoak</h5><table>${jugadores(400, 3)}</table>
    `);
    expect(a.arbitro).toBe('SUÁREZ CEBALLOS, GIOVANNI');
    expect(a.lineups.local.titulares).toHaveLength(11);
    expect(a.lineups.local.suplentes).toHaveLength(4);
    expect(a.lineups.visitante.titulares).toHaveLength(11);
    expect(a.lineups.visitante.suplentes).toHaveLength(3);
  });
});
