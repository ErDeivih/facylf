import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ consulta: vi.fn(), limiteCompartido: vi.fn() }));
vi.mock('@/consultas/adaptadores/postgres/conexion', () => ({ consulta: mocks.consulta }));
vi.mock('@/lib/limites-db', () => ({ limiteCompartido: mocks.limiteCompartido }));

import { POST } from '../src/app/api/metricas/route';

function peticion(headers: Record<string, string>, cuerpo: Record<string, unknown> = { ruta: '/explorar' }): Request {
  return new Request('http://localhost/api/metricas', {
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(cuerpo),
  });
}

describe('métricas · origen', () => {
  beforeEach(() => {
    mocks.consulta.mockReset().mockResolvedValue([]);
    mocks.limiteCompartido.mockReset().mockResolvedValue(true);
  });

  it('acepta el beacon del mismo sitio aunque no mande Origin', async () => {
    const respuesta = await POST(peticion({ 'sec-fetch-site': 'same-origin', referer: 'http://localhost/' }));
    expect(respuesta.status).toBe(204);
  });

  it('acepta Origin del mismo host', async () => {
    const respuesta = await POST(peticion({ origin: 'http://localhost' }));
    expect(respuesta.status).toBe(204);
  });

  it('rechaza una petición cruzada', async () => {
    const respuesta = await POST(peticion({ 'sec-fetch-site': 'cross-site' }));
    expect(respuesta.status).toBe(403);
    expect(mocks.consulta).not.toHaveBeenCalled();
  });

  it('guarda solo la ruta, sin query ni referrer externo', async () => {
    const respuesta = await POST(peticion(
      { 'sec-fetch-site': 'same-origin', referer: 'http://localhost/origen?token=secreto' },
      { ruta: '/explorar/equipo/8871?correo=persona@example.com', referrer: 'http://otro.example/x?token=secreto' },
    ));
    expect(respuesta.status).toBe(204);
    expect(mocks.consulta).toHaveBeenCalledWith(
      'insert into app.evento_web (ruta, referrer) values ($1, $2)',
      ['/explorar/equipo/8871', null],
      { rol: 'app' },
    );
  });

});
