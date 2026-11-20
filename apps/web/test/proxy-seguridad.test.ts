import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '../src/proxy';

describe('proxy de seguridad', () => {
  it('rechaza cuerpos de API mayores de 1 MB antes de leerlos', async () => {
    const peticion = new NextRequest('http://localhost/api/cuentas/crear', {
      method: 'POST',
      headers: { 'content-length': '2000000', 'content-type': 'application/x-www-form-urlencoded' },
    });
    const respuesta = await proxy(peticion);
    expect(respuesta.status).toBe(413);
  });

  it('no limita un GET normal de API', async () => {
    const peticion = new NextRequest('http://localhost/api/v1', { method: 'GET' });
    const respuesta = await proxy(peticion);
    expect(respuesta.status).not.toBe(413);
  });
});
