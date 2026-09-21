import { describe, expect, it } from 'vitest';
import { decodificaHtml, normalizaTextoFederacion } from '../src/texto.js';

describe('codificación HTML de la federación', () => {
  it('respeta los bytes UTF-8 de outerHTML aunque el meta declare latin-1', () => {
    const bytes = Buffer.from('<meta charset="iso-8859-1"><p>León · Gª Segoviana</p>', 'utf8');
    expect(decodificaHtml(bytes)).toContain('León · Gª Segoviana');
  });

  it('recupera las capturas históricas guardadas como latin-1', () => {
    const bytes = Buffer.from([0x4c, 0x65, 0xf3, 0x6e]);
    expect(decodificaHtml(bytes)).toBe('León');
  });

  it('repara texto doblemente codificado sin tocar texto correcto', () => {
    expect(normalizaTextoFederacion('UniÃ³n')).toBe('Unión');
    expect(normalizaTextoFederacion('León')).toBe('León');
    expect(normalizaTextoFederacion('C.M. Reina Sofía · Ir al menÃº')).toBe('C.M. Reina Sofía · Ir al menú');
  });
});
