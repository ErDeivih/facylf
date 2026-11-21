import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consulta: vi.fn(),
  sesionActual: vi.fn(),
  puedeAdministrar: vi.fn(),
}));

vi.mock('@/consultas/adaptadores/postgres/conexion', () => ({ consulta: mocks.consulta }));
vi.mock('@/lib/sesion', () => ({ sesionActual: mocks.sesionActual }));
vi.mock('@/lib/admin-servidor', () => ({ puedeAdministrar: mocks.puedeAdministrar }));

import { POST } from '../src/app/admin/recuperaciones/atender/route';

function peticion(id: string | null = '7'): Request {
  const cuerpo = new URLSearchParams();
  if (id !== null) cuerpo.set('id', id);
  return new Request('http://localhost/admin/recuperaciones/atender', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  });
}

describe('marcar recuperación atendida', () => {
  beforeEach(() => {
    mocks.consulta.mockReset().mockResolvedValue([]);
    mocks.sesionActual.mockReset().mockResolvedValue({ userId: 'admin-1', rol: 'administrador' });
    mocks.puedeAdministrar.mockReset().mockResolvedValue(true);
  });

  it('actualiza solo si la solicitud sigue pendiente', async () => {
    const respuesta = await POST(peticion('7'));
    expect(respuesta.status).toBe(303);
    expect(mocks.consulta).toHaveBeenCalledWith(
      'update app.recuperacion_solicitud set atendida_en = now() where id = $1 and atendida_en is null',
      [7], { rol: 'app' },
    );
  });

  it('sin permiso responde 404 y no actualiza', async () => {
    mocks.puedeAdministrar.mockResolvedValue(false);
    const respuesta = await POST(peticion());
    expect(respuesta.status).toBe(404);
    expect(mocks.consulta).not.toHaveBeenCalled();
  });

  it('rechaza un origen ajeno', async () => {
    const peticionAjena = new Request('http://localhost/admin/recuperaciones/atender', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://otro.example', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'id=7',
    });
    const respuesta = await POST(peticionAjena);
    expect(respuesta.status).toBe(403);
    expect(mocks.consulta).not.toHaveBeenCalled();
  });
});
