import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TEMA_COOKIE,
  esRutaConTema,
  etiquetaDeTema,
  temaDeCookie,
  temaDeCookies,
  temaSiguiente,
  type Tema,
} from '../src/lib/tema';
import { CabeceraSitio } from '../src/componentes/cabecera/CabeceraSitio';

/**
 * Contrato del tema claro/oscuro.
 *
 * El tema lo decide el **servidor** a partir de la cookie `tema` y lo escribe en `<html data-tema>`.
 * Pero el tema oscuro sólo está probado en las rutas migradas (`/explorar…`): en las viejas, que
 * todavía tienen colores literales, se fuerza claro y el control no se pinta. Por eso la prueba del
 * layout monta el layout raíz de verdad y mira el primer HTML, que es lo que recibe el navegador.
 *
 * El control de la cabecera se prueba por lo que anuncia: un botón que dice qué va a hacer
 * («Cambiar a tema oscuro» cuando está claro) y que no depende del color del icono para entenderse.
 */

/** Lo que el servidor verá al montar el layout: la cookie y la ruta que deja el proxy. */
const entorno = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  ruta: '/explorar/competicion/3769',
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      entorno.cookie === undefined ? undefined : { name: nombre, value: entorno.cookie },
  }),
  // La cabecera la escribe `src/proxy.ts`; aquí se simula esa petición.
  headers: async () => new Headers({ 'x-pathname': entorno.ruta }),
}));

vi.mock('next/navigation', () => ({ usePathname: () => entorno.ruta }));

vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

beforeEach(() => {
  entorno.cookie = undefined;
  entorno.ruta = '/explorar/competicion/3769';
});

/** Monta el layout raíz con la cookie/ruta que toque y devuelve el HTML del primer render. */
async function primerHtml(): Promise<string> {
  const { default: Layout } = await import('../src/app/layout');
  return renderToStaticMarkup(await Layout({ children: createElement('p', null, 'contenido') }));
}

function pintaCabecera(props: { tema?: Tema; permiteTema?: boolean } = {}): string {
  return renderToStaticMarkup(createElement(CabeceraSitio, { activo: null, ...props }));
}

describe('el tema sale en la cookie', () => {
  it('la cookie se llama como el sistema de diseño espera', () => {
    expect(TEMA_COOKIE).toBe('tema');
  });

  it('reconoce los dos valores válidos', () => {
    expect(temaDeCookie('claro')).toBe('claro');
    expect(temaDeCookie('oscuro')).toBe('oscuro');
  });

  it('sin cookie, o con un valor que no vale, la web es clara', () => {
    for (const valor of [undefined, null, '', 'oscuroo', 'OSCURO', 'azul', ' claro ', '1']) {
      expect(temaDeCookie(valor), `temaDeCookie(${JSON.stringify(valor)})`).toBe('claro');
    }
  });

  it('alterna de un tema al otro y vuelve', () => {
    expect(temaSiguiente('claro')).toBe('oscuro');
    expect(temaSiguiente('oscuro')).toBe('claro');
    expect(temaSiguiente(temaSiguiente('claro'))).toBe('claro');
  });

  it('la etiqueta dice qué hará el botón, no el estado en el que está', () => {
    expect(etiquetaDeTema('oscuro')).toBe('Cambiar a tema oscuro');
    expect(etiquetaDeTema('claro')).toBe('Cambiar a tema claro');
  });
});

describe('sólo las rutas migradas admiten tema oscuro', () => {
  it('las de /explorar sí', () => {
    expect(esRutaConTema('/explorar')).toBe(true);
    expect(esRutaConTema('/explorar/')).toBe(true);
    expect(esRutaConTema('/explorar/competicion/3769')).toBe(true);
  });

  it('el resto no (incluidas las viejas y las que sólo empiezan igual)', () => {
    for (const ruta of ['/', '/canonico', '/competiciones', '/competicion/t21-c22911157-g22911162', '/explorarx', '/explorar-viejo', '', null, undefined]) {
      expect(esRutaConTema(ruta), `esRutaConTema(${JSON.stringify(ruta)})`).toBe(false);
    }
  });

  it('en el navegador, el tema se lee de document.cookie', () => {
    expect(temaDeCookies('tema=oscuro')).toBe('oscuro');
    expect(temaDeCookies('otra=1; tema=oscuro; x=2')).toBe('oscuro');
    expect(temaDeCookies('tema=claro')).toBe('claro');
    expect(temaDeCookies('tema=azul')).toBe('claro');
    expect(temaDeCookies('temax=oscuro')).toBe('claro');
    expect(temaDeCookies('')).toBe('claro');
    expect(temaDeCookies(undefined)).toBe('claro');
  });
});

describe('el primer HTML ya lleva el tema (resuelto en el servidor)', () => {
  it('sin cookie, el <html> es claro', async () => {
    const html = await primerHtml();
    expect(html).toContain('<html lang="es" data-tema="claro">');
  });

  it('en una ruta migrada con tema=oscuro, el <html> ya sale oscuro: no hay parpadeo', async () => {
    entorno.cookie = 'oscuro';
    const html = await primerHtml();
    expect(html).toContain('<html lang="es" data-tema="oscuro">');
    expect(html).not.toContain('data-tema="claro"');
  });

  it('con una cookie inválida, el <html> es claro', async () => {
    entorno.cookie = 'azul';
    const html = await primerHtml();
    expect(html).toContain('<html lang="es" data-tema="claro">');
  });

  it('en una página vieja, el tema oscuro se fuerza a claro aunque la cookie lo pida', async () => {
    entorno.cookie = 'oscuro';
    for (const ruta of ['/canonico', '/competiciones', '/']) {
      entorno.ruta = ruta;
      const html = await primerHtml();
      expect(html, `en ${ruta}`).toContain('<html lang="es" data-tema="claro">');
      expect(html, `en ${ruta}`).not.toContain('data-tema="oscuro"');
    }
  });

  it('en una ruta migrada el servidor pinta el botón; en una vieja no', async () => {
    entorno.cookie = 'oscuro';
    const migrada = await primerHtml();
    expect(migrada).toContain('aria-label="Cambiar a tema claro"');

    entorno.ruta = '/canonico';
    const vieja = await primerHtml();
    expect(vieja).not.toContain('Cambiar a tema');
    expect(vieja).not.toMatch(/<button[^>]*aria-label="Cambiar a tema/);
  });
});

describe('el botón de tema de la cabecera', () => {
  it('en claro anuncia que cambiará a oscuro', () => {
    const html = pintaCabecera({ tema: 'claro', permiteTema: true });
    expect(html).toContain('aria-label="Cambiar a tema oscuro"');
    expect(html).not.toContain('aria-label="Cambiar a tema claro"');
  });

  it('en oscuro anuncia que cambiará a claro', () => {
    const html = pintaCabecera({ tema: 'oscuro', permiteTema: true });
    expect(html).toContain('aria-label="Cambiar a tema claro"');
    expect(html).not.toContain('aria-label="Cambiar a tema oscuro"');
  });

  it('es un botón real (type=button), de 44 px, con el icono decorativo', () => {
    const html = pintaCabecera({ tema: 'claro', permiteTema: true });
    const boton = html.match(/<button[^>]*aria-label="Cambiar a tema oscuro"[^>]*>[\s\S]*?<\/button>/);
    expect(boton, 'la cabecera no tiene el botón de tema').not.toBeNull();
    expect(boton![0]).toMatch(/type="button"/);
    expect(boton![0]).toContain('size-11');
    expect(boton![0]).toContain('aria-hidden="true"');
    expect(boton![0]).not.toContain('disabled');
  });

  it('sin tema en la prop, el botón es claro: el layout es el que manda', () => {
    expect(pintaCabecera({ permiteTema: true })).toContain('aria-label="Cambiar a tema oscuro"');
  });

  it('en una ruta vieja no se pinta el botón, ni siquiera con tema oscuro', () => {
    const html = pintaCabecera({ tema: 'oscuro', permiteTema: false });
    expect(html).not.toContain('Cambiar a tema');
    // Y por defecto tampoco: el permiso es explícito.
    expect(pintaCabecera({ tema: 'oscuro' })).not.toContain('Cambiar a tema');
  });

  it('el botón va después de la navegación en el DOM (el orden de Tab sigue al visual)', () => {
    const html = pintaCabecera({ permiteTema: true });
    const finNav = html.indexOf('</nav>');
    const boton = html.indexOf('aria-label="Cambiar a tema');
    expect(finNav).toBeGreaterThan(-1);
    expect(boton).toBeGreaterThan(finNav);
  });
});
