import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AvisoEstado } from '../src/componentes/entrar/AvisoEstado';
import { FormularioEntrar } from '../src/componentes/entrar/FormularioEntrar';
import { PaginaEntrar } from '../src/componentes/entrar/PaginaEntrar';

/**
 * `/entrar` es SÓLO la entrada (revisión de capturas, 05/11/2026). El alta vive en `/crear-cuenta`.
 *
 * Se prueba la pieza presentacional, sin base de datos ni cookie: título, formulario HTML que envía a
 * la ruta real, etiquetas y `autocomplete`, enlace claro a crear cuenta, aviso de que la recuperación
 * todavía no existe y ningún texto técnico.
 */

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

function html(aviso: string | null = null, volver: string | null = null): string {
  return renderToStaticMarkup(createElement(PaginaEntrar, { aviso, volver }));
}

function etiquetaDe(entrada: string, id: string): string {
  const encontrado = entrada.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  expect(encontrado, `no hay un input con id "${id}"`).not.toBeNull();
  return encontrado![0].toLowerCase();
}

describe('/entrar · una sola pantalla de entrada', () => {
  it('tiene un título de página y no conserva la tarjeta de crear cuenta', () => {
    const entrada = html();
    expect(entrada).toMatch(/<h1[^>]*id="entrar-titulo"[^>]*>Entrar<\/h1>/);
    expect(entrada).not.toContain('crear-cuenta-titulo');
    expect(entrada).not.toContain('id="alta-nombre"');
    expect(entrada).not.toContain('Código de invitación');
  });

  it('los campos tienen etiqueta visible y el tipo y autocomplete correctos', () => {
    const entrada = html();
    expect(entrada).toMatch(/<label[^>]*for="entrar-correo"[^>]*>Correo/);
    expect(entrada).toMatch(/<label[^>]*for="entrar-contrasena"[^>]*>Contraseña/);

    const correo = etiquetaDe(entrada, 'entrar-correo');
    expect(correo).toContain('type="email"');
    expect(correo).toContain('autocomplete="email"');
    expect(correo).toContain('required');

    const contrasena = etiquetaDe(entrada, 'entrar-contrasena');
    expect(contrasena).toContain('type="password"');
    expect(contrasena).toContain('autocomplete="current-password"');
    expect(contrasena).toContain('required');
  });

  it('el formulario envía a la entrada real y no promete enlace mágico', () => {
    const entrada = html();
    expect(entrada).toContain('action="/api/cuentas/entrar"');
    expect(entrada).toContain('method="post"');
    expect(entrada).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Entrar[\s\S]*?<\/button>/);
    expect(entrada).not.toContain('Recibir un enlace');
    expect(entrada).not.toContain('He olvidado la contraseña');
  });

  it('dice con claridad que la recuperación aún no existe, sin botón que finja', () => {
    expect(html()).toContain('todavía no se puede recuperar desde la web');
  });

  it('enlaza a crear cuenta y conserva la ruta de vuelta', () => {
    const entrada = html(null, '/explorar/equipo/8873');
    expect(entrada).toContain('href="/crear-cuenta?volver=%2Fexplorar%2Fequipo%2F8873"');
    expect(entrada).toContain('Crear una cuenta');
    expect(entrada).toContain('name="volver" value="/explorar/equipo/8873"');
  });

  it('el contexto de utilidad y el aviso se pintan como se espera', () => {
    const entrada = html('Correo o contraseña incorrectos.');
    expect(entrada).toContain('clubes, equipos y jugadores');
    expect(entrada).toContain('role="status"');
    expect(entrada).toContain('Correo o contraseña incorrectos.');
    expect(html()).not.toContain('Correo o contraseña incorrectos.');
  });

  it('no hay texto técnico ni enlaces muertos', () => {
    const entrada = html();
    const texto = entrada.replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const prohibido of ['token', 'endpoint', 'api', 'servidor', 'bienvenid']) {
      expect(texto, `no debería decir «${prohibido}»`).not.toContain(prohibido);
    }
    expect(entrada).not.toContain('href="#"');
    expect(entrada).not.toContain('href="/recuperar"');
  });

  it('las piezas se pueden renderizar por separado', () => {
    expect(renderToStaticMarkup(createElement(FormularioEntrar, { volver: null }))).toContain('type="password"');
    expect(renderToStaticMarkup(createElement(AvisoEstado, { texto: null }))).toContain('role="status"');
  });
});
