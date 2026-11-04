import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { seccionActiva, type SeccionActiva } from '../src/componentes/cabecera/activo';
import { CabeceraSitio } from '../src/componentes/cabecera/CabeceraSitio';

/**
 * Contrato de la cabecera común del sitio (prototipo «Cabecera»).
 *
 * Mira lo que ve el usuario, no cómo está hecha: la marca, la búsqueda global y su nombre accesible,
 * la navegación por funciones con Explorar como único enlace real, y los iconos de panel/avisos/cuenta
 * desactivados porque no hay pantalla ni sistema de avisos. Lo que no existe no se finge: un «3» en la
 * campana o las iniciales de una persona serían datos inventados.
 *
 * `next/link` se mockea porque este render no corre dentro de un router de Next; el enlace que produce
 * es el mismo `<a href>` que el usuario acaba viendo.
 */
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

/** Lo que lee una persona: el texto, sin etiquetas ni atributos (los `d` de los SVG llevan dígitos). */
function soloTexto(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function pinta(activo: SeccionActiva = null): string {
  return renderToStaticMarkup(createElement(CabeceraSitio, { activo }));
}

function navFunciones(html: string): string {
  const encontrado = html.match(/<nav[^>]*aria-label="Funciones"[^>]*>[\s\S]*?<\/nav>/);
  expect(encontrado, 'la cabecera no tiene una navegación aria-label="Funciones"').not.toBeNull();
  return encontrado![0];
}

describe('cabecera del sitio · la barra del prototipo', () => {
  it('es un <header> con la marca facylf que lleva a la portada', () => {
    const html = pinta();
    expect(html.startsWith('<header')).toBe(true);
    expect(html).toContain('facylf');
    expect(html).toMatch(/<a[^>]*href="\/"/);
  });

  it('el buscador global envía a /buscar?q= y tiene nombre accesible', () => {
    const html = pinta();
    expect(html).toMatch(/<input[^>]*type="search"/);
    expect(html).toMatch(/<input[^>]*name="q"/);
    expect(html).toMatch(/<input[^>]*aria-label="Buscar en la plataforma"/);
    expect(html).toContain('action="/buscar"');
    // El endpoint sólo devuelve clubes y jugadores: el placeholder no puede prometer más.
    expect(html).toContain('placeholder="Buscar jugador o club…"');
  });

  it('la navegación Funciones enseña Explorar como enlace y el resto desactivado, no como enlaces muertos', () => {
    const nav = navFunciones(pinta());
    expect(nav).toMatch(/<a[^>]*href="\/competiciones"/);
    for (const texto of ['Explorar', 'Rankings', 'Ojeo', 'Comparar']) {
      expect(nav).toContain(texto);
    }
    // Sólo Explorar navega: los otros tres no tienen pantalla todavía.
    expect((nav.match(/<a[\s>]/g) ?? []).length).toBe(1);
    expect((nav.match(/aria-disabled="true"/g) ?? []).length).toBe(3);
    for (const texto of ['Rankings', 'Ojeo', 'Comparar']) {
      expect(nav, `${texto} debería estar desactivado`).toMatch(
        new RegExp(`<span[^>]*aria-disabled="true"[^>]*>${texto}</span>`),
      );
    }
    // Y no hay enlaces a pantallas que no existen.
    expect(nav).not.toMatch(/<a[^>]*href="[^"]*(rankings|ojeo|comparar)/i);
  });

  it('los iconos de panel, avisos y cuenta son botones desactivados sin contador ni iniciales inventadas', () => {
    const html = pinta();
    const botones = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(botones).toHaveLength(3);
    for (const boton of botones) {
      expect(boton).toMatch(/type="button"/);
      expect(boton).toMatch(/disabled/);
      expect(boton).toMatch(/aria-label="[^"]+ \(todavía no tiene pantalla\)"/);
    }
    expect(html).toContain('Mi panel (todavía no tiene pantalla)');
    expect(html).toContain('Avisos (todavía no tiene pantalla)');
    expect(html).toContain('Cuenta (todavía no tiene pantalla)');
    const texto = soloTexto(html);
    expect(texto).not.toContain('DP');
    expect(texto).not.toContain('David');
  });

  it('la cabecera no enseña ningún dígito suelto: ni un contador, ni una cifra inventada', () => {
    const texto = soloTexto(pinta());
    expect(texto).not.toMatch(/\d/);
  });

  it('sólo la sección activa lleva aria-current, y la decide la ruta', () => {
    expect(pinta(null)).not.toContain('aria-current');
    const activa = pinta('explorar');
    expect(activa).toContain('aria-current="page"');
    expect(navFunciones(activa)).toMatch(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?Explorar/);
  });
});

describe('cabecera del sitio · qué ruta deja activa una sección', () => {
  it('Explorar está activa en su catálogo real y en las pantallas de explorar', () => {
    expect(seccionActiva('/explorar')).toBe('explorar');
    expect(seccionActiva('/explorar/competicion/3769')).toBe('explorar');
    expect(seccionActiva('/competiciones')).toBe('explorar');
    expect(seccionActiva('/competiciones/2025-26')).toBe('explorar');
  });

  it('en una página vieja no se marca ninguna sección', () => {
    expect(seccionActiva('/')).toBeNull();
    expect(seccionActiva('/federaciones')).toBeNull();
    expect(seccionActiva('/competicion/t21-c22911157-g22911162')).toBeNull();
    expect(seccionActiva(null)).toBeNull();
    expect(seccionActiva(undefined)).toBeNull();
  });
});
