import { describe, expect, it } from 'vitest';
import { tipoDeEnlace, referenciaDe, extraeReferencias, paramDe } from '../src/enlaces.js';

describe('patrón de enlaces de la federación', () => {
  it('clasifica los endpoints por su ruta', () => {
    expect(tipoDeEnlace('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=22911154&CodGrupo=22911156&CodTemporada=21&CodJornada=30'))
      .toBe('jornada');
    expect(tipoDeEnlace('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=26091878'))
      .toBe('partido');
    expect(tipoDeEnlace('https://www.rfcylf.es/pnfg/NPcd/NFG_EstadisticasJugador?cod_primaria=3000328&jugador=9110308&codacta=26091878'))
      .toBe('jugador');
    expect(tipoDeEnlace('https://www.rfcylf.es/pnfg/NPcd/NFG_VisCompeticiones_Equipo?cod_primaria=1000123&codequipo=12824&codtemporada=22'))
      .toBe('competiciones-equipo');
    expect(tipoDeEnlace('https://www.rfcylf.es/pnfg/NPcd/NFG_Mov_LstCompeticiones?cod_primaria=&competicion=1&rt=1'))
      .toBe('lista-competiciones');
  });

  it('lee un parámetro sin distinguir mayúsculas', () => {
    expect(paramDe('https://x/NFG_CmpJornada?CodCompeticion=abc&codgrupo=1', 'codcompeticion')).toBe('abc');
  });

  it('normaliza los enlaces de una página en sus referencias', () => {
    const html = `
      <a href="/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=22911154&CodGrupo=22911156&CodTemporada=21&CodJornada=30">Jornada 30</a>
      <a href="/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=26091878">Acta</a>
      <a href="https://www.rfcylf.es/pnfg/NPcd/NFG_EstadisticasJugador?cod_primaria=3000328&jugador=9110308&codacta=26091878">Jugador</a>
      <a href="https://www.rfcylf.es/pnfg/NPcd/NFG_VisCompeticiones_Equipo?cod_primaria=1000123&codequipo=12824&codtemporada=22">Competiciones del equipo</a>
    `;
    const refs = extraeReferencias(html);
    const jornada = refs.find((r) => r.tipo === 'jornada');
    expect(jornada).toMatchObject({ codCompeticion: '22911154', codGrupo: '22911156', codTemporada: '21', codJornada: '30' });
    const acta = refs.find((r) => r.tipo === 'partido');
    expect(acta?.codActa).toBe('26091878');
    const jugador = refs.find((r) => r.tipo === 'jugador');
    expect(jugador?.jugador).toBe('9110308');
    const equipo = refs.find((r) => r.tipo === 'competiciones-equipo');
    expect(equipo).toMatchObject({ codEquipo: '12824', codTemporada: '22' });
  });

  it('saca al equipo (ficha) cuando solo hay codequipo', () => {
    expect(referenciaDe('https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?codequipo=55', 'equipo').tipo).toBe('equipo');
  });
});
