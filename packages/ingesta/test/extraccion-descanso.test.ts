/**
 * El bloque de descanso NO es un partido.
 *
 * El marcado de los fragmentos está copiado **literalmente del HTML archivado** de las jornadas donde se
 * midió el defecto, no inventado:
 *
 * - PNFG: `descargas-aragon/.../t17-2021-22/comp-4806659/grupo-4806661/jornadas/jornada-1.html.gz`, donde
 *   la federación da de alta un pseudo-equipo para el descanso con `Codigo_Equipo=4807245`;
 * - nova: `descargas-euskadi/.../t21-2025-26/comp-23233882/grupo-23233962/jornadas/jornada-2.html.gz`, donde
 *   el «visitante» es `Atsedena` con un escudo de plantilla.
 *
 * Cada prueba de este fichero FALLA con el extractor anterior: antes, el descanso salía como un partido y
 * el importador le creaba una inscripción.
 */
import { describe, expect, it } from 'vitest';
import { extraePartidos, extraePartidosWidget, extraeFilasInformativas, reconoceFilaInformativa, esPalabraDeDescansoDeMaqueta, normalizaNombreDeFila, ADAPTADORES_EXTRACCION } from '../../../scripts/lib/recolector-local.mjs';
import { VOCABULARIO_DESCANSO, clasificaFilaDeDescanso } from '../src/parsers/filas-informativas.js';
import { normalizaNombreEquipo, separaNombreYEstado } from '../src/parsers/nova-equipos.js';

/** Fragmento PNFG con un partido real y, debajo, el bloque de descanso. Tal cual lo publica Aragón. */
const PNFG_CON_DESCANSO = `<html><body>
<table width="100%"><tbody>
  <tr><td class="td_widget"><h4><a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=288"> UNIÓN LA JOTA VADORREY-C.D. </a></h4></td>
      <td><h4><strong>1 - 3</strong></h4><div class="div_icono_resultados"><a href="NFG_CmpPartido?cod_primaria=1000120&amp;CodActa=667866">acta</a></div></td>
      <td class="td_widget"><h4><a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=1356040"> EL SALVADOR-S.D. </a></h4></td></tr>
</tbody></table>
<table width="100%"><tbody>
  <tr style="background-color: #ffffff00;">
    <td width="40%" align="left" class="td_widget"><div class="wrapper_widget"><div class="escudo_widgetL"><img src="https://files.futbolaragon.com/pnfg/img/web_responsive_2/ESP/escudo_sm_resultados_.jpg" width="20" class="escudo_widget2"></div><div class="font_widgetL"><h4><a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=4807245"> DESCANSA </a></h4></div></div></td>
    <td width="20%" align="center"><h4><strong> </strong></h4><div class="div_icono_resultados"></div><br><span class="horario" style="margin-top:5px;"> 18-09-2021 </span></td>
    <td width="40%" align="right" class="td_widget"><div class="wrapper_widget2"><div class="font_widgetV"><h4><a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=296"> BALSAS PICARRAL-U.D. </a></h4></div><div class="escudo_widgetV"><img src="https://ffaragon.filesnovanet.es/pnfg/pimg/Clubes/00100_0000391775_escudo.jpg" class="escudo_widget2"></div></div></td>
  </tr>
</tbody></table>
</body></html>`;

/** Fragmento nova con un partido real y, debajo, el bloque de descanso. Tal cual lo publica Euskadi. */
const NOVA_CON_DESCANSO = `<html><body><table><tbody>
  <tr>
    <td width="40%" align="left" class="td_widget"><div class="wrapper_widget"><div class="escudo_widgetL"><img src="https://fvf.filesnovanet.es/pnfg/pimg/MigracionPV/escudosFVF/3217_grande.png" class="escudo_widget2"></div><div class="font_widgetL"><h4>   ARANGOITI AEROLINK ELORRIETAKO FS, C.D. </h4></div></div></td>
    <td width="20%" align="center"><h4><strong> 1 - 4 </strong></h4><div class="div_icono_resultados"><a href="NFG_VisActa?CodActa=9996727">acta</a></div><br><span class="horario"> 26-10-2025 </span></td>
    <td width="40%" align="right" class="td_widget"><div class="wrapper_widget2"><div class="font_widgetV"><h4> ALBARDERO-RIVABELLOSA, C.D. (Sailkatua) </h4></div><div class="escudo_widgetV"><img src="https://fvf.filesnovanet.es/pnfg/pimg/x.png" class="escudo_widget2"></div></div></td>
  </tr>
  <tr>
    <td width="40%" align="left" class="td_widget"><div class="wrapper_widget"><div class="escudo_widgetL"><img src="https://fvf.filesnovanet.es/pnfg/pimg/MigracionPV/escudosFVF/3217_grande.png" class="escudo_widget2"></div><div class="font_widgetL"><h4>   SESTAO F.S. </h4></div></div></td>
    <td width="20%" align="center" style="white-space:nowrap;"><h4><strong> </strong></h4><div class="div_icono_resultados"></div><div class="div_icono_resultados"></div><br></td>
    <td width="40%" align="right" class="td_widget"><div class="wrapper_widget2"><div class="font_widgetV"><h4>   Atsedena </h4></div><div class="escudo_widgetV"><img src="https://files.euskadifutbol.eus/pnfg/img/web_responsive_2/EUS/escudo_sm_resultados_.jpg" class="escudo_widget2"></div></div></td>
  </tr>
</tbody></table></body></html>`;

/** Una jornada SANA, sin bloque de descanso: no puede cambiar nada de ella. */
const PNFG_SANA = `<html><body><table width="100%"><tbody>
  <tr><td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=1"> C.D. UNO </a></h4></td>
      <td><h4><strong>2 - 0</strong></h4><a href="NFG_CmpPartido?CodActa=111">acta</a></td>
      <td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=2"> C.D. DOS </a></h4></td></tr>
</tbody></table>
<table width="100%"><tbody>
  <tr><td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=3"> C.D. TRES </a></h4></td>
      <td><h4><strong>1 - 1</strong></h4><a href="NFG_CmpPartido?CodActa=222">acta</a></td>
      <td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=4"> C.D. CUATRO </a></h4></td></tr>
</tbody></table>
</body></html>`;

/** El bloque de descanso CON acta: no se puede descartar, porque podría ser un partido desplazado. */
const PNFG_DESCANSO_CON_ACTA = `<html><body><table width="100%"><tbody>
  <tr><td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=9001"> DESCANSA </a></h4></td>
      <td><h4><strong>1 - 3</strong></h4><a href="NFG_CmpPartido?CodActa=667866">acta</a></td>
      <td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=296"> BALSAS PICARRAL-U.D. </a></h4></td></tr>
</tbody></table></body></html>`;

/** Un club de verdad cuyo nombre CONTIENE la palabra: no es un descanso y no se puede perder. */
const PNFG_CLUB_CON_LA_PALABRA = `<html><body><table width="100%"><tbody>
  <tr><td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=5001"> C.D. DESCANSO </a></h4></td>
      <td><h4><strong>0 - 0</strong></h4><a href="NFG_CmpPartido?CodActa=555">acta</a></td>
      <td class="td_widget"><h4><a href="NFG_VisEquipos?Codigo_Equipo=5002"> DESCANSO F.S. </a></h4></td></tr>
</tbody></table></body></html>`;

describe('el bloque de descanso deja de ser un partido', () => {
  it('PNFG · el descanso no se emite y el partido real sí', () => {
    const filas = extraePartidos(PNFG_CON_DESCANSO);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.local).toContain('UNIÓN LA JOTA');
    expect(filas[0]!.visitante).toContain('EL SALVADOR');
    expect(filas[0]!.codActa).toBe('667866');
    // Y ni un rastro del pseudo-equipo del descanso.
    expect(JSON.stringify(filas)).not.toMatch(/DESCANSA/i);
    expect(filas.some((f) => f.codLocal === '4807245')).toBe(false);
  });

  it('nova · el descanso no se emite y el partido real sí', () => {
    const filas = extraePartidosWidget(NOVA_CON_DESCANSO);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.local).toContain('ARANGOITI');
    expect(filas[0]!.visitante).toContain('ALBARDERO-RIVABELLOSA');
    expect(filas[0]!.codActa).toBe('9996727');
    expect(JSON.stringify(filas)).not.toMatch(/Atsedena/i);
  });

  it('la jornada SANA no cambia: los mismos partidos, en el mismo orden', () => {
    const filas = extraePartidos(PNFG_SANA);
    expect(filas.map((f) => [f.local, f.visitante, f.codActa])).toEqual([
      ['C.D. UNO', 'C.D. DOS', '111'],
      ['C.D. TRES', 'C.D. CUATRO', '222'],
    ]);
  });

  it('el descanso con marcador pegado (`Descansa (Ganador)`) tampoco se emite', () => {
    const html = PNFG_CON_DESCANSO.replace('> DESCANSA <', '> Descansa (Ganador) <');
    const filas = extraePartidos(html);
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toMatch(/Descansa/i);
  });

  it('un club cuyo nombre CONTIENE la palabra NO se pierde', () => {
    // Es la trampa que el encargo prohíbe: «no elimines una fila únicamente porque contiene esa palabra».
    const filas = extraePartidos(PNFG_CLUB_CON_LA_PALABRA);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.local).toBe('C.D. DESCANSO');
    expect(filas[0]!.visitante).toBe('DESCANSO F.S.');
  });

  it('el descanso CON acta NO se descarta: podría ser un partido desplazado', () => {
    const filas = extraePartidos(PNFG_DESCANSO_CON_ACTA);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.codActa).toBe('667866');
    // Pero se declara sospechoso, para poder registrarlo en vez de perderlo.
    const informativas = extraeFilasInformativas(PNFG_DESCANSO_CON_ACTA);
    expect(informativas).toHaveLength(1);
    expect(informativas[0]!.informativa).toBe(false);
    expect(informativas[0]!.sospechosa).toBe(true);
  });

  it('el descanso puro se REPORTA en vez de perderse, y dice qué equipo descansa', () => {
    const informativas = extraeFilasInformativas(PNFG_CON_DESCANSO);
    expect(informativas).toHaveLength(1);
    expect(informativas[0]!.informativa).toBe(true);
    expect(informativas[0]!.local).toBe('DESCANSA');
    // El otro lado es el equipo que descansa esa jornada: es información de la fuente, no basura.
    expect(informativas[0]!.visitante).toBe('BALSAS PICARRAL-U.D.');
  });

  it('el descanso de nova también se reporta', () => {
    const informativas = extraeFilasInformativas(NOVA_CON_DESCANSO);
    expect(informativas).toHaveLength(1);
    expect(informativas[0]!.maqueta).toBe('nova-widget');
    expect(informativas[0]!.visitante).toBe('Atsedena');
  });
});

describe('los adaptadores declaran cómo reconocen una fila informativa', () => {
  it('cada maqueta declara vocabulario, delimitación, celdas, subtablas, marcadores y evidencia', () => {
    for (const [nombre, adaptador] of Object.entries(ADAPTADORES_EXTRACCION)) {
      expect(adaptador.vocabularioDescanso.length, nombre).toBeGreaterThan(0);
      for (const campo of ['delimitaFilaDePartido', 'extraeCeldasDirectas', 'ignoraSubtablas', 'marcadoresDeEstado', 'evidenciaParaCorregir', 'cuandoDevuelveIncidencia'] as const) {
        expect(typeof adaptador[campo], `${nombre}.${campo}`).toBe('string');
        expect(adaptador[campo].length, `${nombre}.${campo}`).toBeGreaterThan(10);
      }
    }
  });

  it('`Atsedena` sólo vale en la maqueta que lo declara', () => {
    expect(esPalabraDeDescansoDeMaqueta('Atsedena', 'nova-widget')).toBe(true);
    expect(esPalabraDeDescansoDeMaqueta('Atsedena', 'pnfg-clasica')).toBe(false);
    expect(esPalabraDeDescansoDeMaqueta('DESCANSA', 'pnfg-clasica')).toBe(true);
    expect(esPalabraDeDescansoDeMaqueta('Descansa', 'nova-widget')).toBe(true);
  });

  it('la palabra se compara ENTERA', () => {
    expect(esPalabraDeDescansoDeMaqueta('C.D. DESCANSO', 'pnfg-clasica')).toBe(false);
    expect(esPalabraDeDescansoDeMaqueta('DESCANSO F.S.', 'pnfg-clasica')).toBe(false);
    expect(esPalabraDeDescansoDeMaqueta('  descansa  ', 'pnfg-clasica')).toBe(true);
    expect(esPalabraDeDescansoDeMaqueta('Descansa (Ganador)', 'pnfg-clasica')).toBe(true);
  });

  it('una maqueta sin adaptador declarado no reconoce nada', () => {
    expect(reconoceFilaInformativa({ maqueta: 'fcf', local: 'DESCANSA', visitante: 'C.D. UNO', tieneActa: false })).toBeNull();
    expect(reconoceFilaInformativa({ maqueta: 'isquad', local: 'Descansa', visitante: 'C.D. UNO', tieneActa: true })).toBeNull();
  });

  it('el vocabulario y la normalización NO pueden separarse del módulo de ingesta', () => {
    // La maqueta del extractor declara `pnfg-clasica`/`nova-widget` y el clasificador usa los mismos
    // nombres: si alguien cambia una lista o la normalización en un solo sitio, esta prueba lo dice.
    for (const maqueta of ['pnfg-clasica', 'nova-widget'] as const) {
      expect([...ADAPTADORES_EXTRACCION[maqueta]!.vocabularioDescanso].sort()).toEqual([...VOCABULARIO_DESCANSO[maqueta]].sort());
    }
    for (const literal of ['DESCANSA', '  Descansa ', 'Descansa (Ganador)', 'C.D. DESCANSO', 'Atsedena', 'C.D. UNO', '(Sailkatua) ALAVES "B"', 'DESCANSO F.S.']) {
      // La normalización del extractor tiene que dar EXACTAMENTE lo mismo que la de la ingesta, que es la
      // que usa el clasificador del inventario.
      expect(normalizaNombreDeFila(literal), literal).toBe(normalizaNombreEquipo(separaNombreYEstado(literal).nombreEquipo));
    }
  });
});

describe('el descanso reconocido se clasifica como lo que es', () => {
  it('una fila de descanso sin datos de partido es clase B, no un partido desplazado', () => {
    const informativas = extraeFilasInformativas(NOVA_CON_DESCANSO);
    const r = clasificaFilaDeDescanso({
      maqueta: 'nova-widget', local: 'SESTAO F.S.', visitante: informativas[0]!.visitante,
      codigoActa: null, golesLocal: null, golesVisitante: null, campo: null, arbitro: null,
      filasConLaMismaActa: 0, filasConLaMismaPareja: 1, parejaExisteEnElHtml: null,
      hayPartidoDelHtmlAusente: false, actaDemuestraPartidoReal: null,
    });
    expect(r.clase).toBe('B');
  });
});
