import { afterEach, describe, expect, it } from 'vitest';
import { GET as iniciar } from '../src/app/api/cuentas/oauth/[proveedor]/iniciar/route';
import { GET as volver } from '../src/app/api/cuentas/oauth/google/volver/route';

const originalId = process.env.GOOGLE_CLIENT_ID;
const originalSecret = process.env.GOOGLE_CLIENT_SECRET;

afterEach(() => {
  if (originalId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalId;
  if (originalSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = originalSecret;
});

function params(proveedor = 'google') {
  return { params: Promise.resolve({ proveedor }) };
}

describe('OAuth con Google', () => {
  it('sin configuración no manda a Google: vuelve a /entrar con un aviso', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const respuesta = await iniciar(new Request('http://localhost/api/cuentas/oauth/google/iniciar'), params());
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get('location')).toBe('http://localhost/entrar?aviso=oauth-no-configurado');
  });

  it('rechaza proveedores no soportados', async () => {
    const respuesta = await iniciar(new Request('http://localhost/api/cuentas/oauth/github/iniciar'), params('github'));
    expect(respuesta.status).toBe(404);
  });

  it('con configuración genera state y PKCE y no acepta un retorno sin state', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
    const respuesta = await iniciar(new Request('http://localhost/api/cuentas/oauth/google/iniciar'), params());
    expect(respuesta.status).toBe(307);
    const destino = new URL(respuesta.headers.get('location') ?? '');
    expect(destino.origin).toBe('https://accounts.google.com');
    expect(destino.searchParams.get('code_challenge_method')).toBe('S256');
    expect(destino.searchParams.get('state')).toBeTruthy();
    expect(respuesta.headers.get('set-cookie')).toContain('facylf_oauth_estado=');

    const retorno = await volver(new Request('http://localhost/api/cuentas/oauth/google/volver?code=x&state=distinto'));
    expect(retorno.status).toBe(307);
    expect(retorno.headers.get('location')).toBe('http://localhost/entrar?aviso=oauth-estado');
  });
});
