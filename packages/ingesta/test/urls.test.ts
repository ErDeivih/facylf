import { describe, expect, it } from 'vitest';
import type { Competicion } from '../src/catalogo.js';
import { esDeMenores } from '../src/catalogo.js';
import { urlCalendarioExcel, urlJornada } from '../src/urls.js';

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

  it('falla en vez de inventarse la URL del botón de Excel', () => {
    // en cuanto tengamos la URL real, este test cambia. Mientras, que reviente aquí
    // y no en producción con una URL plausible pero falsa.
    expect(() => urlCalendarioExcel(juvenil)).toThrow(/Falta la URL real/);
  });

  it('el juvenil es categoría de menores', () => {
    expect(esDeMenores('juvenil')).toBe(true);
    expect(esDeMenores('aficionados')).toBe(false);
  });
});
