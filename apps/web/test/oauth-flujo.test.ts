import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consulta: vi.fn(),
  iniciaSesion: vi.fn(),
  sesionActual: vi.fn(),
}));

vi.mock('@/consultas/adaptadores/postgres/conexion', () => ({ consulta: mocks.consulta }));
vi.mock('@/lib/sesion', () => ({
  iniciaSesion: mocks.iniciaSesion,
  sesionActual: mocks.sesionActual,
  SESION_COOKIE: 'facylf_sesion',
}));

import { GET as volver } from '../src/app/api/cuentas/oauth/google/volver/route';

const cookies = 'facylf_oauth_estado=estado-1; facylf_oauth_verificador=verificador-1; facylf_oauth_volver=%2Fmi-cuenta';

function peticion(): Request {
  return new Request('http://localhost/api/cuentas/oauth/google/volver?code=abc&state=estado-1', {
    headers: { cookie: cookies },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  mocks.consulta.mockReset();
  mocks.iniciaSesion.mockReset();
});

describe('OAuth · flujo verificado', () => {
  it('crea la sesión cuando el correo está verificado y la cuenta activa', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto';
    vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ sub: 'sub-1', email: 'persona@example.com', email_verified: true, name: 'Persona' }), { status: 200 });
    }));
    mocks.consulta.mockImplementation(async (sql: string) =>
      sql.includes('alta_cuenta_oauth') ? [{ user_id: 'u-oauth' }] : [{ estado: 'activo' }]);

    const respuesta = await volver(peticion());
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe('http://localhost/mi-cuenta');
    expect(mocks.iniciaSesion).toHaveBeenCalledWith('u-oauth');
  });

  it('si la cuenta queda pendiente no crea sesión', async () => {
    process.env.GOOGLE_CLIENT_ID = 'cliente';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto';
    vi.stubGlobal('fetch', vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ sub: 'sub-2', email: 'persona2@example.com', email_verified: true }), { status: 200 });
    }));
    mocks.consulta.mockImplementation(async (sql: string) =>
      sql.includes('alta_cuenta_oauth') ? [{ user_id: 'u-pendiente' }] : [{ estado: 'pendiente' }]);

    const respuesta = await volver(peticion());
    expect(respuesta.status).toBe(307);
    expect(respuesta.headers.get('location')).toBe('http://localhost/entrar?aviso=registro-pendiente');
    expect(mocks.iniciaSesion).not.toHaveBeenCalled();
  });
});
