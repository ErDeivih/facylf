import { describe, expect, it } from 'vitest';
import { esDeMenores, opcionesDeCatalogo, competicionDeUrl, competicionesDeUrls, parseaCompeticiones, parseaGrupos, puedeMostrarNombre, codTemporadaDe, estructuraDe } from '../src/catalogo.js';

describe('catálogo', () => {
  it('clasifica categorías de menores', () => {
    expect(esDeMenores('juvenil')).toBe(true);
    expect(esDeMenores('aficionados')).toBe(false);
    expect(esDeMenores('sala')).toBe(false);
  });

  it('no muestra nombre de jugador en menores sin consentimiento', () => {
    expect(puedeMostrarNombre('juvenil', false)).toBe(false);
    expect(puedeMostrarNombre('juvenil', true)).toBe(true);
    expect(puedeMostrarNombre('aficionados', false)).toBe(true);
  });

  it('calcula el código de temporada con año − 2004', () => {
    expect(codTemporadaDe(2026)).toBe('22');
    expect(codTemporadaDe(2025)).toBe('21');
    expect(codTemporadaDe(2022)).toBe('18');
  });

  it('clasifica la estructura según el formato real de Castilla y León', () => {
    expect(estructuraDe('1ª División Provincial de Juveniles')).toMatchObject({ ambito: 'provincial', grupos: 'por-provincia' });
    expect(estructuraDe('1ª División Regional de Cadetes')).toMatchObject({ ambito: 'regional', grupos: 'primera-segunda' });
    expect(estructuraDe('Liga Nacional Juvenil')).toMatchObject({ ambito: 'nacional', grupos: 'uno' });
    expect(estructuraDe('Fase de Ascenso Infantil')).toMatchObject({ ambito: 'fase-ascenso', grupos: 'fase' });
  });

  it('lee las opciones de los desplegables sin interpretarlas', () => {
    const html = `
      <select name="comp">
        <option value="24218963">1ª División Provincial de Juveniles, Primera</option>
        <option value="24218968">Juvenil, Grupo 2</option>
        <option value="">— elige —</option>
      </select>`;
    const opciones = opcionesDeCatalogo(html);
    expect(opciones).toHaveLength(2); // el option vacío (sin valor) se descarta
    expect(opciones[0]).toMatchObject({ texto: '1ª División Provincial de Juveniles, Primera', valor: '24218963' });
  });

  it('extrae una competición desde la URL de la jornada', () => {
    const c = competicionDeUrl(
      'https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24218963&CodGrupo=24218968&CodTemporada=22&CodJornada=1',
      'juvenil',
    );
    expect(c).toMatchObject({ codCompeticion: '24218963', codGrupo: '24218968', codTemporada: '22', categoria: 'juvenil' });
  });

  it('dedupica varias URLs por slug', () => {
    const urls = [
      'https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24218963&CodGrupo=24218968&CodTemporada=22&CodJornada=1',
      'https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24218963&CodGrupo=24218968&CodTemporada=22&CodJornada=2',
      'https://www.rfcylf.es/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24219266&CodGrupo=24220954&CodTemporada=22&CodJornada=2',
    ];
    const lista = competicionesDeUrls(urls, 'juvenil');
    expect(lista).toHaveLength(2);
  });

  it('extrae competiciones desde el HTML de NFG_Mov_LstCompeticiones', () => {
    const html = `
      <a href="NFG_Mov_ListGruposCompeticion?cod_primaria=&buscar=1&codcompeticion=24218932&r=1">Juvenil Salamanca</a>
      <a href="NFG_Mov_ListGruposCompeticion?cod_primaria=&buscar=1&codcompeticion=24219266&r=1">Copa RFEF</a>`;
    const c = parseaCompeticiones(html);
    expect(c).toEqual([
      { codCompeticion: '24218932', nombre: 'Juvenil Salamanca' },
      { codCompeticion: '24219266', nombre: 'Copa RFEF' },
    ]);
  });

  it('extrae grupos desde el desplegable (option value=codgrupo) y desde enlaces', () => {
    const html = `
      <select name="grupo">
        <option value=24218964>Primera - Avila</option>
        <option value=24218968>Primera - Salamanca</option>
        <option value=0>-- Seleccione --</option>
      </select>
      <a href="NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=24219114&CodGrupo=24219115&CodTemporada=22&CodJornada=1">Grupo 1</a>`;
    const g = parseaGrupos(html, '24218963');
    expect(g).toHaveLength(3); // 2 options + 1 enlace
    expect(g[0]).toMatchObject({ codCompeticion: '24218963', codGrupo: '24218964' });
    expect(g.some((x) => x.codGrupo === '24219115')).toBe(true);
  });
});
