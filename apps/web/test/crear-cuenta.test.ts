import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AvisoEstado } from '../src/componentes/entrar/AvisoEstado';
import { FormularioCrearCuenta } from '../src/componentes/entrar/FormularioCrearCuenta';
import { PaginaCrearCuenta } from '../src/componentes/entrar/PaginaCrearCuenta';

/**
 * `/crear-cuenta`: alta abierta, sin invitación, separada de `/entrar`.
 *
 * Se prueba por lo que ve la persona: campos con etiqueta, `autocomplete` y validación HTML, el
 * consentimiento vigente sobre menores, el envío real a `/api/cuentas/crear`, el enlace de vuelta a
 * entrar y el aviso traducido. No se prueba la base: eso está en `cuentas-flujo.test.ts`.
 */

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

function html(aviso: string | null = null, volver: string | null = null): string {
  return renderToStaticMarkup(createElement(PaginaCrearCuenta, { aviso, volver }));
}

function etiquetaDe(entrada: string, id: string): string {
  const encontrado = entrada.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  expect(encontrado, `no hay un input con id "${id}"`).not.toBeNull();
  return encontrado![0].toLowerCase();
}

describe('/crear-cuenta · alta abierta', () => {
  it('tiene su propio título y no conserva la tarjeta de entrar', () => {
    const entrada = html();
    expect(entrada).toMatch(/<h1[^>]*id="crear-cuenta-titulo"[^>]*>Crear cuenta<\/h1>/);
    expect(entrada).not.toContain('id="entrar-titulo"');
    expect(entrada).not.toContain('id="entrar-correo"');
    expect(entrada).toContain('Crear cuenta');
  });

  it('no pide ni menciona un código de invitación en el formulario', () => {
    const entrada = html();
    expect(entrada).not.toContain('Código de invitación');
    expect(entrada).not.toContain('name="invitacion"');
    expect(entrada).not.toContain('alta-invitacion');
    expect(entrada).not.toMatch(/invitaci[oó]n/i);
  });

  it('pide nombre, correo, contraseña y aceptación, con sus atributos', () => {
    const entrada = html();
    expect(entrada).toMatch(/<label[^>]*for="alta-nombre"[^>]*>Nombre/);
    expect(entrada).toMatch(/<label[^>]*for="alta-correo"[^>]*>Correo/);
    expect(entrada).toMatch(/<label[^>]*for="alta-contrasena"[^>]*>Contraseña/);

    expect(etiquetaDe(entrada, 'alta-nombre')).toContain('autocomplete="name"');
    expect(etiquetaDe(entrada, 'alta-correo')).toContain('type="email"');
    expect(etiquetaDe(entrada, 'alta-correo')).toContain('autocomplete="email"');
    expect(etiquetaDe(entrada, 'alta-contrasena')).toContain('autocomplete="new-password"');
    expect(etiquetaDe(entrada, 'alta-contrasena')).toContain('minlength="10"');
    expect(etiquetaDe(entrada, 'alta-acepto')).toContain('type="checkbox"');
    expect(etiquetaDe(entrada, 'alta-acepto')).toContain('required');
  });

  it('envía al alta real con POST y la vuelta como campo oculto', () => {
    const entrada = html(null, '/explorar/equipo/8873');
    expect(entrada).toContain('action="/api/cuentas/crear"');
    expect(entrada).toContain('method="post"');
    expect(entrada).toContain('name="volver" value="/explorar/equipo/8873"');
    expect(entrada).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Crear cuenta[\s\S]*?<\/button>/);
  });

  it('el consentimiento dice la decisión vigente: nombres publicados y fotos según el modo', () => {
    const entrada = html();
    expect(entrada).toContain('La federación tiene consentimiento para publicar los nombres de los menores');
    expect(entrada).toContain('las fotos dependen del modo de publicación');
    expect(entrada.toLowerCase()).not.toContain('no se muestran sin permiso');
  });

  it('enlaza de vuelta a entrar conservando la ruta de vuelta', () => {
    const entrada = html(null, '/mi-panel');
    expect(entrada).toContain('href="/entrar?volver=%2Fmi-panel"');
    expect(entrada).toContain('Entrar');
  });

  it('el aviso llega traducido y se anuncia', () => {
    const entrada = html('Ese correo ya tiene una cuenta. Entra con tu correo.');
    expect(entrada).toContain('role="status"');
    expect(entrada).toContain('Ese correo ya tiene una cuenta');
    expect(html()).not.toContain('Ese correo ya tiene una cuenta');
  });

  it('no hay texto técnico', () => {
    const texto = html().replace(/<[^>]*>/g, ' ').toLowerCase();
    for (const prohibido of ['token', 'endpoint', 'api', 'servidor', 'bienvenid']) {
      expect(texto, `no debería decir «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('las piezas se pueden renderizar por separado', () => {
    const formulario = renderToStaticMarkup(createElement(FormularioCrearCuenta, { volver: null }));
    expect(formulario).toContain('type="password"');
    expect(formulario).toContain('name="acepto"');
    expect(formulario).not.toContain('name="invitacion"');
    expect(renderToStaticMarkup(createElement(AvisoEstado, { texto: null }))).toContain('role="status"');
  });
});
