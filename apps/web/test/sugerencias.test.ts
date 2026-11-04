import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ListaSugerencias } from '../src/componentes/Buscador';
import type { FilaBusqueda } from '../src/consultas/entidades';
import { resultadoDeSugerencia } from '../src/lib/sugerencias';

/**
 * Contrato de las sugerencias del buscador de la cabecera.
 *
 * Lo que se defiende aquí es el invariante del proyecto: **un nombre de menor de edad no se publica
 * nunca**. La consulta ya trae `es_menor`; la página de sugerencias es la que decide con
 * `nombreVisible()` y no con un `if` suelto. Además, el panel flotante no puede llevar texto visible
 * con `--texto-tenue` (tinta-500: 3,93:1, por debajo de AA): axe lo marcó como serio con el panel
 * abierto y este fichero lo fija.
 *
 * `next/link` se mockea porque este render no corre dentro de un router de Next.
 */
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

/** Una fila real del canónico: jugador de Castilla y León con su contexto. */
function fila(extra: Partial<FilaBusqueda> = {}): FilaBusqueda {
  return {
    tipo: 'jugador',
    entidad_id: 1586364,
    nombre: 'BURGO GARCIA, PABLO',
    federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
    contexto: 'C.D. Cuatrovientos · 2026-27',
    identidad_nominal: false,
    es_menor: false,
    parecido: 0.9,
    total: 5,
    ...extra,
  };
}

describe('sugerencias del buscador · la regla de los menores', () => {
  it('un jugador menor de edad nunca publica su nombre: se rotula', () => {
    const sugerencia = resultadoDeSugerencia(fila({ es_menor: true }));
    expect(sugerencia.titulo).toBe('Jugador menor de edad');
    expect(JSON.stringify(sugerencia)).not.toContain('BURGO');
    // El enlace se conserva: la ficha existe y el nombre no viaja en la sugerencia.
    expect(sugerencia.url).toBe('/jugador/1586364');
  });

  it('un jugador adulto conserva el literal que publica la federación', () => {
    expect(resultadoDeSugerencia(fila({ es_menor: false })).titulo).toBe('BURGO GARCIA, PABLO');
  });

  it('sin marca de menor no se inventa la condición: se enseña el nombre', () => {
    expect(resultadoDeSugerencia(fila({ es_menor: null as unknown as boolean })).titulo)
      .toBe('BURGO GARCIA, PABLO');
  });

  it('sin nombre no se inventa uno: se dice que no está publicado', () => {
    expect(resultadoDeSugerencia(fila({ es_menor: false, nombre: null as unknown as string })).titulo)
      .toBe('Nombre no publicado');
  });

  it('un club no pasa por la regla de menores y conserva su nombre', () => {
    const sugerencia = resultadoDeSugerencia(fila({
      tipo: 'club', nombre: 'BURGOS CF', es_menor: true, identidad_nominal: true, entidad_id: 22464,
    }));
    expect(sugerencia.titulo).toBe('BURGOS CF');
    expect(sugerencia.url).toBe('/club/22464');
    expect(sugerencia.meta).toBe('');
  });

  it('el aviso de identidad nominal sólo se pone a jugadores', () => {
    expect(resultadoDeSugerencia(fila({ identidad_nominal: true })).meta).toBe('identidad nominal');
    expect(resultadoDeSugerencia(fila({ tipo: 'club', identidad_nominal: true })).meta).toBe('');
  });

  it('el subtítulo compone federación y contexto, y no se inventa contexto si no hay', () => {
    const conContexto = resultadoDeSugerencia(fila());
    expect(conContexto.subtitulo).toContain('Castilla y León');
    expect(conContexto.subtitulo).toContain('C.D. Cuatrovientos');
    expect(resultadoDeSugerencia(fila({ federacion_nombre: null, contexto: null })).subtitulo)
      .toBe('Sin contexto en el canónico');
  });
});

describe('sugerencias del buscador · el panel flotante', () => {
  const RESPUESTA = {
    total: 1,
    cuenta: { jugador: 1 },
    resultados: [{
      tipo: 'jugador',
      titulo: 'Jugador menor de edad',
      subtitulo: 'Real Federación de Castilla y León de Fútbol · C.D. Cuatrovientos · 2026-27',
      meta: 'identidad nominal',
      url: '/jugador/1586364',
      territorio: 'Real Federación de Castilla y León de Fútbol',
    }],
  };

  it('usa los tokens del sistema y no --texto-tenue para texto visible', () => {
    const html = renderToStaticMarkup(
      createElement(ListaSugerencias, { res: RESPUESTA, q: 'resino', cerrar: () => {} }),
    );
    expect(html).toContain('identidad nominal');
    // El aviso es texto visible de 12 px: con --texto-tenue daba 3,93:1 (axe, serio).
    expect(html).not.toContain('--texto-tenue');
    expect(html).toContain('--texto-suave');
    // Y sigue siendo el panel flotante del sistema de diseño.
    expect(html).toContain('bg-[var(--fondo-elevado)]');
    expect(html).toContain('shadow-[var(--sombra-1)]');
    expect(html).toContain('z-[var(--capa-flotante)]');
  });

  it('dice que no hay resultados sin inventar una lista', () => {
    const html = renderToStaticMarkup(
      createElement(ListaSugerencias, { res: { total: 0, cuenta: {}, resultados: [] }, q: 'zzz', cerrar: () => {} }),
    );
    expect(html).toContain('Sin resultados para «zzz»');
  });
});
