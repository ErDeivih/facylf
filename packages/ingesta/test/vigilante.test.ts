import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  diferencias, hashBytes, sinDiferencias, tipoDeFichero,
} from '../src/vigilante.js';

describe('detección de cambios', () => {
  it('un fichero nuevo se detecta como nuevo', () => {
    const d = diferencias({}, { 'Calendario.xls': 'abc' });
    expect(d).toEqual({ nuevos: ['Calendario.xls'], cambiados: [], borrados: [] });
    expect(sinDiferencias(d)).toBe(false);
  });

  it('hash distinto es cambio, hash igual no', () => {
    const d1 = diferencias({ 'Calendario.xls': 'abc' }, { 'Calendario.xls': 'xyz' });
    expect(d1.cambiados).toEqual(['Calendario.xls']);
    const d2 = diferencias({ 'Calendario.xls': 'abc' }, { 'Calendario.xls': 'abc' });
    expect(sinDiferencias(d2)).toBe(true);
  });

  it('un fichero que desaparece sale del estado y si vuelve cuenta como nuevo', () => {
    const d1 = diferencias({ 'Calendario.xls': 'abc' }, {});
    expect(d1.borrados).toEqual(['Calendario.xls']);
    const d2 = diferencias({}, { 'Calendario.xls': 'abc' });
    expect(d2.nuevos).toEqual(['Calendario.xls']);
  });
});

describe('hashBytes', () => {
  it('es estable y distingue contenidos', () => {
    const calendario = readFileSync(new URL('../../../datos-ejemplo/Calendario.xls', import.meta.url));
    expect(hashBytes(calendario)).toBe(hashBytes(new Uint8Array(calendario)));
    expect(hashBytes(calendario))
      .not.toBe(hashBytes(readFileSync(new URL('../../../datos-ejemplo/Clasificacion_Excel.xls', import.meta.url))));
  });
});

describe('tipoDeFichero', () => {
  it('reconoce los nombres reales de los botones de la federación', () => {
    expect(tipoDeFichero('Calendario.xls')).toBe('calendario');
    expect(tipoDeFichero('Clasificacion_Excel.xls')).toBe('clasificacion');
    expect(tipoDeFichero('clasificacion-j13.xls')).toBe('clasificacion');
  });

  it('lo que no encaja no se adivina: desconocido', () => {
    expect(tipoDeFichero('cuadricula-cruces.pdf')).toBe('desconocido');
    expect(tipoDeFichero('descarga (3).xls')).toBe('desconocido');
  });
});
