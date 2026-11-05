import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BotonFavorito } from '../src/componentes/favorito/BotonFavorito';
import { PanelAccesos } from '../src/componentes/mi-panel/PanelAccesos';
import type { FilaAcceso } from '../src/consultas/usuario';

/**
 * «Mi panel» y la estrella de favorito, por lo que se ve: el estado vacío que dice qué hacer, cada
 * favorito con su último resultado y su próximo partido, el botón de quitar y el cierre de sesión.
 * No se prueba la cookie ni la base: eso está en el flujo de `cuentas-flujo.test.ts`.
 */

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

const ACCESO: FilaAcceso = {
  id: 12,
  tipo: 'equipo',
  etiqueta: 'U.D. Valdecastro "A"',
  url: '/equipo/8873',
  orden: 0,
  avisar: true,
  ultimo: 'Valdecastro 3-1 Navalcruz',
  ultimo_url: '/partido/1',
  proximo: 'Valdecastro - Mirador · 06/12 16:30',
  proximo_url: '/partido/2',
};

function pinta(accesos: readonly FilaAcceso[], error = false): string {
  return renderToStaticMarkup(createElement(PanelAccesos, { nombre: 'Ana', accesos, error }));
}

describe('Mi panel', () => {
  it('sin favoritos dice qué hacer y lleva a explorar competiciones', () => {
    const html = pinta([]);
    expect(html).toContain('Mi panel');
    expect(html).toContain('Todavía no sigues nada');
    expect(html).toContain('href="/explorar/competiciones"');
    expect(html).not.toContain('Quitar');
  });

  it('cada favorito enseña su nombre, el último resultado y el próximo partido', () => {
    const html = pinta([ACCESO]);
    expect(html).toContain('U.D. Valdecastro &quot;A&quot;');
    expect(html).toContain('href="/explorar/equipo/8873"');
    expect(html).toContain('Último:');
    expect(html).toContain('Valdecastro 3-1 Navalcruz');
    expect(html).toContain('Próximo:');
    expect(html).toContain('06/12 16:30');
  });

  it('quitar un favorito es un formulario POST con el id del favorito y vuelve al panel', () => {
    const html = pinta([ACCESO]);
    const formularios = html.match(/<form[^>]*action="\/api\/favoritos"[^>]*>[\s\S]*?<\/form>/g) ?? [];
    expect(formularios).toHaveLength(1);
    expect(formularios[0]).toContain('method="post"');
    expect(formularios[0]).toContain('name="accion" value="quitar"');
    expect(formularios[0]).toContain('name="id" value="12"');
    expect(formularios[0]).toContain('name="volver" value="/mi-panel"');
    expect(formularios[0]).toContain('aria-label="Quitar U.D. Valdecastro &quot;A&quot; de favoritos"');
  });

  it('el cierre de sesión es un POST a su ruta', () => {
    const html = pinta([]);
    expect(html).toMatch(/<form[^>]*action="\/api\/cuentas\/salir"[^>]*>[\s\S]*?Cerrar sesión[\s\S]*?<\/form>/);
  });

  it('los avisos se anuncian como «más adelante», sin botones que finjan', () => {
    const html = pinta([]);
    const seccion = html.match(/<section[^>]*aria-labelledby="avisos-titulo"[\s\S]*?<\/section>/);
    expect(seccion, 'no hay sección de avisos').not.toBeNull();
    expect(seccion![0]).toContain('Avisos');
    expect(seccion![0]).toContain('llegarán más adelante');
    expect(seccion![0]).not.toContain('<button');
    expect(seccion![0]).not.toMatch(/activar|push|notificaciones/i);
  });

  it('si la base falla no se pinta un panel vacío que parezca «no sigues nada»', () => {
    const html = pinta([], true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('No se ha podido cargar tu panel');
    expect(html).not.toContain('Todavía no sigues nada');
  });
});

describe('la estrella de favorito de una ficha', () => {
  it('es un formulario real y un botón con nombre accesible, sin depender de JavaScript', () => {
    const html = renderToStaticMarkup(createElement(BotonFavorito, {
      tipo: 'equipo', entidadId: 8873, etiqueta: 'U.D. Valdecastro "A"',
    }));
    expect(html).toContain('action="/api/favoritos"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="tipo" value="equipo"');
    expect(html).toContain('name="entidad_id" value="8873"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Guardar');
  });
});
