import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';
import { plural } from '../src/lib/plural';
import {
  Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, EstadoError, EstadoVacio,
  Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TabsNav,
} from '../src/componentes/ui';

/**
 * Contrato de la capa `componentes/ui` (shadcn sobre Radix) que usan las tres pantallas.
 *
 * Se defiende lo que no puede romperse sin que el resto de la entrega se caiga:
 *  · la tabla se desplaza dentro de sí misma (`data-tabla-scroll`) y sus cabeceras son `th scope=col`;
 *  · una insignia y un aviso llevan texto (nunca sólo color) y el error se anuncia como alerta;
 *  · los estados de vacío y error tienen un nombre y una salida;
 *  · las pestañas son enlaces con su `aria-current` y las que no tienen pantalla se apagan;
 *  · `cn` resuelve conflictos de Tailwind y `plural` usa la regla del español.
 */
describe('capa de componentes (shadcn/Radix)', () => {
  it('la tabla se desplaza dentro de su caja y las cabeceras declaran su alcance', () => {
    const html = renderToStaticMarkup(createElement(Table, { etiquetaDesplazamiento: 'Prueba' },
      createElement(TableHeader, null,
        createElement(TableRow, null, createElement(TableHead, null, 'Equipo'))),
      createElement(TableBody, null,
        createElement(TableRow, null, createElement(TableCell, null, 'C.D. Ribert')))));
    expect(html).toContain('data-tabla-scroll');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('C.D. Ribert');
  });

  it('la insignia y el aviso siempre llevan texto; el error se anuncia como alerta', () => {
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(Badge, { variant: 'ko' }, 'KO'),
      createElement(Alert, { variant: 'error' },
        createElement(AlertTitle, null, 'No se ha podido cargar'),
        createElement(AlertDescription, null, 'Vuelve a intentarlo'))));
    expect(html).toContain('KO');
    expect(html).toContain('role="alert"');
    expect(html).toContain('No se ha podido cargar');
  });

  it('el estado vacío y el de error dicen qué pasa y dejan una salida', () => {
    const vacio = renderToStaticMarkup(createElement(EstadoVacio, { titulo: 'No hay grupos con esos filtros' }));
    const error = renderToStaticMarkup(createElement(EstadoError, { titulo: 'No se ha podido leer' }));
    expect(vacio).toContain('No hay grupos con esos filtros');
    expect(error).toContain('role="alert"');
    expect(error).toContain('No se ha podido leer');
  });

  it('las pestañas son enlaces con aria-current y las apagadas no fingen un enlace', () => {
    const html = renderToStaticMarkup(createElement(TabsNav, {
      pestanas: [
        { etiqueta: 'Clasificación', href: '/explorar/competicion/2939', activa: true },
        { etiqueta: 'Jornadas', href: '/explorar/competicion/2939/jornadas', activa: false },
        { etiqueta: 'Goleadores', activa: false },
      ],
    }));
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/explorar/competicion/2939/jornadas"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Goleadores');
  });

  it('el botón admite ser un enlace (asChild) sin anidar interactivos', () => {
    const html = renderToStaticMarkup(createElement(Button, { asChild: true },
      createElement('a', { href: '/explorar/competiciones' }, 'Ver competiciones')));
    expect(html).toContain('<a');
    expect(html).toContain('href="/explorar/competiciones"');
    expect(html).not.toContain('<button');
    expect(html).toContain('h-11');
  });

  it('campo y desplegable comparten el alto táctil del sistema', () => {
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(Input, { name: 'q' }),
      createElement(Select, { name: 'temp' }, createElement('option', { value: '' }, 'Todas'))));
    expect((html.match(/h-11/g) ?? []).length).toBe(2);
  });

  it('cn resuelve conflictos de Tailwind y plural usa la regla del español', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    expect(cn('p-4', 'px-2')).toBe('p-4 px-2');
    expect(cn('text-tabla', false && 'hidden', null)).toBe('text-tabla');
    expect(plural(1, 'grupo', 'grupos')).toBe('grupo');
    expect(plural(21, 'grupo', 'grupos')).toBe('grupos');
    expect(plural(0, 'grupo', 'grupos')).toBe('grupos');
  });

  it('la tarjeta aporta la superficie plana del sistema sin sombra', () => {
    const html = renderToStaticMarkup(createElement(Card, null, createElement(CardContent, null, 'Contenido')));
    expect(html).toContain('Contenido');
    expect(html).toContain('border-[var(--borde)]');
    expect(html).not.toContain('shadow');
  });
});
