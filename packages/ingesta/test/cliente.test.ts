import { describe, expect, it, vi } from 'vitest';
import { ClienteFederacion, ParadaPorFallos } from '../src/cliente.js';

const ok = (cuerpo = 'hola', cab: Record<string, string> = {}) =>
  new Response(cuerpo, { status: 200, headers: cab });

function nuevo(fetch: typeof globalThis.fetch, extra = {}) {
  return new ClienteFederacion({
    urlBot: 'https://ejemplo.es/bot', contacto: 'contacto@ejemplo.es',
    dormir: async () => {}, fetch, ...extra,
  });
}

describe('cliente educado', () => {
  it('se niega a arrancar sin identificarse', () => {
    expect(() => new ClienteFederacion({ urlBot: '', contacto: '' })).toThrow(/URL y un correo reales/);
  });

  it('manda un User-Agent con URL y correo', async () => {
    const fetch = vi.fn(async () => ok());
    const c = nuevo(fetch as never);
    expect(c.userAgent).toBe('FutbolSalamancaBot/1.0 (+https://ejemplo.es/bot; contacto@ejemplo.es)');
    await c.pide('https://www.rfcylf.es/x');
    const cab = (fetch.mock.calls[0] as never as [string, RequestInit])[1].headers as Record<string, string>;
    expect(cab['User-Agent']).toContain('contacto@ejemplo.es');
  });

  it('manda el ETag guardado y entiende el 304', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 304 }));
    const r = await nuevo(fetch as never).pide('https://www.rfcylf.es/x', 'W/"abc"');
    const cab = (fetch.mock.calls[0] as never as [string, RequestInit])[1].headers as Record<string, string>;
    expect(cab['If-None-Match']).toBe('W/"abc"');
    expect(r).toMatchObject({ estado: 304, sinCambios: true, cuerpo: null });
  });

  it('reintenta con backoff ante un 429 y acaba saliendo', async () => {
    const esperas: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () => (++n < 3 ? new Response(null, { status: 429 }) : ok('bien')));
    const c = nuevo(fetch as never, { dormir: async (ms: number) => { esperas.push(ms); } });
    const r = await c.pide('https://www.rfcylf.es/x');
    expect(r.estado).toBe(200);
    expect(esperas).toEqual([30_000, 120_000]);
  });

  it('se para tras tres fallos seguidos en vez de insistir', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(nuevo(fetch as never).pide('https://www.rfcylf.es/x')).rejects.toBeInstanceOf(ParadaPorFallos);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('respeta el Retry-After que nos manden', async () => {
    const esperas: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () =>
      ++n === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '90' } }) : ok());
    await nuevo(fetch as never, { dormir: async (ms: number) => { esperas.push(ms); } })
      .pide('https://www.rfcylf.es/x');
    expect(esperas).toEqual([90_000]);
  });

  it('no pasa del techo de peticiones por minuto', async () => {
    let reloj = 0;
    const esperas: number[] = [];
    const fetch = vi.fn(async () => ok());
    const c = nuevo(fetch as never, {
      porMinuto: 2, ahora: () => reloj,
      dormir: async (ms: number) => { esperas.push(ms); reloj += ms; },
    });
    await c.pide('https://www.rfcylf.es/1');
    await c.pide('https://www.rfcylf.es/2');
    await c.pide('https://www.rfcylf.es/3');
    expect(esperas).toHaveLength(1);
    expect(esperas[0]).toBeGreaterThan(59_000);
  });
});
