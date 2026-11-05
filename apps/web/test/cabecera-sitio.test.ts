import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { seccionActiva, type SeccionActiva } from '../src/componentes/cabecera/activo';
import { CabeceraSitio } from '../src/componentes/cabecera/CabeceraSitio';
import { Logotipo } from '../src/componentes/marca/Logotipo';
import { NOMBRE_PRODUCTO, TAGLINE, TITULO_POR_DEFECTO } from '../src/componentes/marca/marca';

/**
 * Contrato de la cabecera común del sitio: marca, navegación y pie.
 *
 * Mira lo que ve el usuario, no cómo está hecha: el nombre del producto y su tagline, la búsqueda
 * global con nombre accesible, las funciones **explicadas** (cada una dice para qué sirve), las que
 * todavía no tienen pantalla como texto desactivado —nunca como enlace muerto—, la cuenta como enlace
 * real a `/entrar` y el pie sin el aviso de archivo privado que se retiró.
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

const LAYOUT = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');

describe('cabecera del sitio · marca', () => {
  it('es un <header> con la marca Balompié (ya no facylf) y su tagline, que lleva a la portada', () => {
    const html = pinta();
    expect(html.startsWith('<header')).toBe(true);
    expect(soloTexto(html)).toContain(NOMBRE_PRODUCTO);
    expect(soloTexto(html)).not.toContain('facylf');
    expect(html).toMatch(/<a[^>]*href="\/"/);
    expect(soloTexto(html)).toContain(TAGLINE);
  });

  it('el título por defecto es el de la marca y el pie «Archivo privado» ya no aparece', () => {
    expect(TITULO_POR_DEFECTO).toContain(NOMBRE_PRODUCTO);
    expect(TITULO_POR_DEFECTO).toContain('temporada a temporada');
    expect(LAYOUT).toContain('TITULO_POR_DEFECTO');
    expect(LAYOUT).not.toContain("'facylf");
    expect(LAYOUT).not.toContain('Archivo privado');
    expect(LAYOUT).not.toContain('No es una web oficial');
    expect(LAYOUT).not.toContain('<footer');
  });
});

describe('logotipo', () => {
  it('es un SVG propio, del tamaño de la cabecera y decorativo (la marca va en texto)', () => {
    const html = renderToStaticMarkup(createElement(Logotipo));
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).toContain('viewBox="0 0 28 28"');
    expect(html).toContain('width="28"');
    expect(html).toContain('height="28"');
    expect(html).toContain('aria-hidden="true"');
    // Sin texto dentro del dibujo y sin colores literales: el color es un token del sistema.
    expect(html).not.toContain('<text');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    expect(html).toContain('var(--accion)');
  });

  it('el favicon es el mismo dibujo y sigue siendo XML válido (sin guiones dobles en comentarios)', () => {
    const icono = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
    expect(icono).toContain('<svg');
    expect(icono).toContain('viewBox="0 0 28 28"');
    expect(icono).not.toContain('<text');
    // Un comentario XML no admite «--» dentro: el favicon dejaría de parsearse (pasó antes). Los
    // delimitadores «<!--» y «-->» sí lo llevan, así que se mira el cuerpo de cada comentario.
    const comentarios = [...icono.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1] ?? '');
    expect(comentarios.length).toBeGreaterThan(0);
    for (const comentario of comentarios) expect(comentario).not.toContain('--');
  });
});

describe('cabecera del sitio · buscador y funciones explicadas', () => {
  it('el buscador global envía a /buscar?q= y tiene nombre accesible', () => {
    const html = pinta();
    expect(html).toMatch(/<input[^>]*type="search"/);
    expect(html).toMatch(/<input[^>]*name="q"/);
    expect(html).toMatch(/<input[^>]*aria-label="Buscar en la plataforma"/);
    expect(html).toContain('action="/buscar"');
    // El endpoint sólo devuelve clubes y jugadores: el placeholder no puede prometer más.
    expect(html).toContain('placeholder="Buscar jugador o club…"');
  });

  it('cada función dice para qué sirve; Explorar y Rankings navegan y Ojeo/Comparar siguen pendientes', () => {
    const nav = navFunciones(pinta());
    expect(nav).toMatch(/<a[^>]*href="\/explorar\/competiciones"/);
    expect(nav).toMatch(/<a[^>]*href="\/explorar\/estadisticas"/);
    for (const [etiqueta, descriptor] of [
      ['Explorar', 'Competiciones y grupos'],
      ['Rankings', 'Goleadores'],
      ['Ojeo', 'Buscar talento'],
      ['Comparar', 'Cara a cara'],
    ]) {
      expect(nav, `falta ${etiqueta}`).toContain(etiqueta);
      expect(nav, `falta el descriptor de ${etiqueta}`).toContain(descriptor);
    }
    // Una descripción accesible por elemento, también cuando el descriptor no cabe en pantalla.
    for (const clave of ['explorar', 'rankings', 'ojeo', 'comparar']) {
      expect(nav).toContain(`aria-describedby="funcion-${clave}-desc"`);
      expect(nav).toContain(`id="funcion-${clave}-desc"`);
    }
    // Sólo navegan las que tienen pantalla; las otras dos se explican como pendientes: nombre
    // accesible y `title` lo dicen, y en pantalla el descriptor cuenta qué serán.
    expect((nav.match(/<a[\s>]/g) ?? []).length).toBe(2);
    expect((nav.match(/aria-disabled="true"/g) ?? []).length).toBe(2);
    expect(nav).toContain('Ojeo (todavía no tiene pantalla)');
    expect(nav).toContain('Comparar (todavía no tiene pantalla)');
    expect(nav).toContain('todavía no tiene pantalla');
    expect(nav).not.toMatch(/<a[^>]*href="[^"]*(ojeo|comparar)/i);
  });

  it('sólo la sección activa lleva aria-current, y la decide la ruta', () => {
    expect(pinta(null)).not.toContain('aria-current');
    expect(navFunciones(pinta('explorar'))).toMatch(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?Explorar/);
    expect(navFunciones(pinta('rankings'))).toMatch(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?Rankings/);
  });

  it('panel y avisos siguen desactivados; cuenta es un enlace real a /entrar sin iniciales inventadas', () => {
    const html = pinta();
    const pendientes = (html.match(/<button[\s\S]*?<\/button>/g) ?? []).filter((boton) => boton.includes('disabled'));
    expect(pendientes).toHaveLength(2);
    for (const boton of pendientes) {
      expect(boton).toMatch(/type="button"/);
      expect(boton).toMatch(/disabled/);
      expect(boton).toMatch(/aria-label="[^"]+ \(todavía no tiene pantalla\)"/);
    }
    expect(html).toContain('Mi panel (todavía no tiene pantalla)');
    expect(html).toContain('Avisos (todavía no tiene pantalla)');

    // La cuenta ya tiene pantalla: es el único icono que navega. Sigue siendo un icono con nombre
    // accesible y 44×44, no un avatar ni un nombre de usuario inventado.
    const cuenta = html.match(/<a[^>]*href="\/entrar"[^>]*>[\s\S]*?<\/a>/);
    expect(cuenta, 'la cabecera no enlaza a /entrar').not.toBeNull();
    expect(cuenta![0]).toContain('aria-label="Entrar o crear cuenta"');
    expect(cuenta![0]).toContain('size-11');
    expect(cuenta![0]).toContain('aria-hidden="true"');
    expect(cuenta![0]).not.toContain('disabled');

    const texto = soloTexto(html);
    expect(texto).not.toContain('DP');
    expect(texto).not.toContain('David');
  });

  it('la cabecera no enseña ningún dígito suelto: ni un contador, ni una cifra inventada', () => {
    const texto = soloTexto(pinta());
    expect(texto).not.toMatch(/\d/);
  });
});

describe('cabecera del sitio · qué ruta deja activa una sección', () => {
  it('Explorar está activa en su catálogo real y en las pantallas de explorar', () => {
    expect(seccionActiva('/explorar')).toBe('explorar');
    expect(seccionActiva('/explorar/competicion/3769')).toBe('explorar');
    expect(seccionActiva('/explorar/competiciones')).toBe('explorar');
    expect(seccionActiva('/explorar/calendario')).toBe('explorar');
    expect(seccionActiva('/competiciones')).toBe('explorar');
    expect(seccionActiva('/competiciones/2025-26')).toBe('explorar');
  });

  it('Rankings está activa en la pantalla de estadísticas a la que enlaza', () => {
    expect(seccionActiva('/explorar/estadisticas')).toBe('rankings');
    expect(seccionActiva('/explorar/estadisticas/2025-26')).toBe('rankings');
    // Las dos funciones que todavía no tienen pantalla no se marcan nunca.
    expect(seccionActiva('/explorar/ojeo')).toBe('explorar');
    expect(seccionActiva('/explorar/comparar')).toBe('explorar');
  });

  it('en una página vieja no se marca ninguna sección', () => {
    expect(seccionActiva('/')).toBeNull();
    expect(seccionActiva('/federaciones')).toBeNull();
    expect(seccionActiva('/competicion/t21-c22911157-g22911162')).toBeNull();
    expect(seccionActiva(null)).toBeNull();
    expect(seccionActiva(undefined)).toBeNull();
  });
});
