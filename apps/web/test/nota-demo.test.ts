import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NotaDemo } from '../src/componentes/marca/NotaDemo';
import { NOTA_DEMO } from '../src/lib/nota-demo';

/**
 * La web tiene dos caras y no se confunden: la demo pública es una foto de la 2026-27 y la app
 * completa es la del servidor propio. El texto vive en un solo sitio (`lib/nota-demo.ts`) y el pie lo
 * pinta; si alguien cambia una URL, se cambia ahí y no en tres componentes.
 */

const TEXTO = 'Demo pública: datos de la temporada 2026-27 · app completa en el servidor propio';

describe('la nota de la demo pública', () => {
  it('el texto y las dos URLs viven en una sola constante documentada', () => {
    expect(NOTA_DEMO.texto).toBe(TEXTO);
    expect(NOTA_DEMO.urlDemo).toBe('https://erdeivih.github.io/fondo-popular-demo/');
    // La app completa es esta misma aplicación (raíz relativa): no se inventa un host.
    expect(NOTA_DEMO.urlCompleta).toBe('/');
  });

  it('el pie pinta el texto exacto y las dos referencias', () => {
    const html = renderToStaticMarkup(createElement(NotaDemo));
    for (const parte of ['Demo pública', 'datos de la temporada 2026-27', 'app completa', 'en el servidor propio']) {
      expect(html, `falta «${parte}»`).toContain(parte);
    }
    expect(html).toContain('https://erdeivih.github.io/fondo-popular-demo/');
    expect(html).toContain('href="/"');
  });

  it('no inventa más URLs que las dos de la constante', () => {
    const html = renderToStaticMarkup(createElement(NotaDemo));
    const enlaces = [...html.matchAll(/href="([^"]+)"/g)].map((coincidencia) => coincidencia[1]);
    expect(new Set(enlaces)).toEqual(new Set([NOTA_DEMO.urlDemo, NOTA_DEMO.urlCompleta]));
  });
});
