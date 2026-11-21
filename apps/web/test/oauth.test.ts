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

describe('OAuth con Google · retorno', () => {
  it('rechaza un correo no verificado antes de tocar la base', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
    const original = globalThis.fetch;
    globalThis.fetch = (async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'token-de-prueba' }), { status: 200 });
      }
      return new Response(JSON.stringify({ sub: 'sub-1', email: 'persona@example.com', email_verified: false }), { status: 200 });
    }) as typeof fetch;
    try {
      const respuesta = await volver(new Request(
        'http://localhost/api/cuentas/oauth/google/volver?code=abc&state=estado-1',
        { headers: { cookie: 'facylf_oauth_estado=estado-1; facylf_oauth_verificador=verificador-1; facylf_oauth_volver=' } },
      ));
      expect(respuesta.status).toBe(307);
      expect(respuesta.headers.get('location')).toBe('http://localhost/entrar?aviso=oauth-correo');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('la reautenticación pide login explícito y max_age=0', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
    const respuesta = await iniciar(new Request('http://localhost/api/cuentas/oauth/google/iniciar?reauth=1'), params());
    const destino = new URL(respuesta.headers.get('location') ?? '');
    expect(destino.searchParams.get('prompt')).toBe('login');
    expect(destino.searchParams.get('max_age')).toBe('0');
  });

});
