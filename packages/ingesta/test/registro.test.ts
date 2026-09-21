import { describe, expect, it } from 'vitest';
import { filaDeRespuesta, filaDeError } from '../src/registro.js';

describe('scrape_log', () => {
  it('arma la fila desde una respuesta', () => {
    const f = filaDeRespuesta('https://www.rfcylf.es/x', 12, {
      estado: 200, sinCambios: false, cuerpo: null, etag: 'W/"abc"', ms: 34.6,
    }, { filas: 182, cambios: 0, hash_contenido: 'aa' });
    expect(f).toMatchObject({
      competicion_id: 12, url: 'https://www.rfcylf.es/x', etag: 'W/"abc"',
      estado: 200, filas: 182, cambios: 0, hash_contenido: 'aa', ms: 35, error: null,
    });
  });

  it('arma la fila de un error sin inventar nada', () => {
    const f = filaDeError('https://www.rfcylf.es/y', null, 'timeout');
    expect(f).toMatchObject({
      competicion_id: null, url: 'https://www.rfcylf.es/y',
      estado: 0, filas: null, ms: 0, error: 'timeout',
    });
  });
});
