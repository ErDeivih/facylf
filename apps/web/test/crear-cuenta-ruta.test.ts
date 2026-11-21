import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  altaCuenta: vi.fn(),
  modoRegistro: vi.fn(),
  hashContrasena: vi.fn(),
  limiteCompartido: vi.fn(),
}));

vi.mock('@/lib/cuentas-db', () => ({ altaCuenta: mocks.altaCuenta, modoRegistro: mocks.modoRegistro }));
vi.mock('@/lib/contrasenas', () => ({ hashContrasena: mocks.hashContrasena }));
vi.mock('@/lib/limites-db', () => ({ limiteCompartido: mocks.limiteCompartido }));

import { POST } from '../src/app/api/cuentas/crear/route';

const cuerpo = new URLSearchParams({
  nombre: 'Persona de prueba',
  correo: 'persona@example.com',
  contrasena: 'contrasena-larga-123',
  acepto: 'on',
});

function peticion(): Request {
  return new Request('http://localhost/api/cuentas/crear', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      host: 'localhost',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: cuerpo.toString(),
  });
}

describe('alta de cuenta · respuesta neutra', () => {
  beforeEach(() => {
    mocks.altaCuenta.mockReset();
    mocks.modoRegistro.mockReset().mockResolvedValue('abierto');
    mocks.hashContrasena.mockReset().mockResolvedValue('scrypt$32768$8$1$sal$hash');
    mocks.limiteCompartido.mockReset().mockResolvedValue(true);
  });

  it('un alta correcta no crea sesión y va al aviso neutro', async () => {
    mocks.altaCuenta.mockResolvedValue('activo');
    const respuesta = await POST(peticion());
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe('http://localhost/crear-cuenta?aviso=registro-neutral');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  it('un correo ya registrado da la misma respuesta y tampoco crea sesión', async () => {
    mocks.altaCuenta.mockRejectedValue(new Error('CORREO_YA_REGISTRADO'));
    const respuesta = await POST(peticion());
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe('http://localhost/crear-cuenta?aviso=registro-neutral');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  it('en modo aprobación avisa sin revelar si el correo existía', async () => {
    mocks.modoRegistro.mockResolvedValue('aprobacion');
    mocks.altaCuenta.mockResolvedValue('pendiente');
    const respuesta = await POST(peticion());
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe('http://localhost/crear-cuenta?aviso=registro-neutral-pendiente');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });


  it('en aprobación, un correo existente comparte el aviso pendiente', async () => {
    mocks.modoRegistro.mockResolvedValue('aprobacion');
    mocks.altaCuenta.mockRejectedValue(new Error('CORREO_YA_REGISTRADO'));
    const respuesta = await POST(peticion());
    expect(respuesta.status).toBe(303);
    expect(respuesta.headers.get('location')).toBe('http://localhost/crear-cuenta?aviso=registro-neutral-pendiente');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

});
