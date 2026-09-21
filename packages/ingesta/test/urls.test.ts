import { describe, expect, it } from 'vitest';
import type { Competicion } from '../src/catalogo.js';
import { esDeMenores } from '../src/catalogo.js';
import {
  descubreUrlsExcel, urlJornada, urlCalendario, urlCalendarioExcel,
  urlClasificacion, urlClasificacionExcel, urlTablaCruzada,
} from '../src/urls.js';

const juvenil: Competicion = {
  codCompeticion: '24218963', codGrupo: '24218968', codTemporada: '22', codDelegacion: '1',
  nombre: '1ª División Provincial de Juveniles, Primera', categoria: 'juvenil',
  genero: 'm', slug: 'juvenil-primera-salamanca', activa: true,
};

describe('urls', () => {
  it('arma la URL de la jornada con los códigos de la competición', () => {
    const u = new URL(urlJornada(juvenil, 7));
    expect(u.searchParams.get('CodCompeticion')).toBe('24218963');
    expect(u.searchParams.get('CodJornada')).toBe('7');
  });

  it('la descarga de Excel es la página del calendario con excel=1 y NPcd_File=1', () => {
    const u = new URL(urlCalendarioExcel(juvenil));
    expect(u.pathname).toContain('NFG_VisCalendario_Vis');
    expect(u.searchParams.get('excel')).toBe('1');
    expect(u.searchParams.get('NPcd_File')).toBe('1');
    expect(u.searchParams.get('codcompeticion')).toBe('24218963');
    expect(u.searchParams.get('codgrupo')).toBe('24218968');
    expect(u.searchParams.get('codtemporada')).toBe('22');
  });

  it('la clasificación va a NFG_VisClasificacion y su Excel lleva excel=1', () => {
    expect(urlClasificacion(juvenil)).toContain('/NFG_VisClasificacion');
    const u = new URL(urlClasificacionExcel(juvenil));
    expect(u.searchParams.get('excel')).toBe('1');
    expect(u.searchParams.get('NPcd_File')).toBe('1');
  });

  it('la tabla cruzada va a NFG_VisTablaCruzado', () => {
    expect(new URL(urlTablaCruzada(juvenil)).pathname).toContain('NFG_VisTablaCruzado');
  });

  it('el juvenil es categoría de menores', () => {
    expect(esDeMenores('juvenil')).toBe(true);
    expect(esDeMenores('aficionados')).toBe(false);
  });

  it('descubre las URLs de los .xls desde el HTML, sin inventarlas', () => {
    const html = `
      <html><body>
        <a href="/pnfg/NPcd/NFG_VisCalendario_Vis?excel=1&amp;NPcd_File=1">Calendario Excel</a>
        <a class="descarga" href="../NPcd/NFG_VisClasificacion?excel=1&amp;NPcd_File=1">Clasificación Excel</a>
        <a href="https://www.rfcylf.es/pnfg/otro.xls">Informe</a>
      </body></html>`;
    const u = descubreUrlsExcel(html);
    expect(u.calendario).toContain('excel=1');
    expect(u.clasificacion).toContain('excel=1');
    expect(u.otros).toHaveLength(1);
  });
});
