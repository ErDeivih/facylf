import { describe, expect, it } from 'vitest';
import { fuenteDeFederacion, leeFederaciones } from '../src/resolucion/contexto.js';
import { ColaOrigen } from '../src/origen/cola.js';

/**
 * El nombre de Castilla y León tiene dos formas vivas y una tercera histórica, y las tres tienen que
 * resolver a la MISMA fuente:
 *
 *   · `castilla-leon`      — el código de `config/federaciones-espana.json` y de `core.federation`;
 *   · `castilla-y-leon`    — el que usan la documentación del importador y quien busca «Castilla y León»;
 *   · `federacion`         — el nombre del servicio y de la carpeta de la cola en el servidor.
 *
 * Antes de esto, `pnpm importar --federacion castilla-y-leon` (que es lo que dice la ayuda del propio
 * comando) terminaba en «La federación «castilla-y-leon» no está en config/federaciones-espana.json».
 */
describe('resolución del nombre de federación', () => {
  const raiz = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

  it('acepta el código canónico', () => {
    expect(fuenteDeFederacion(raiz, 'castilla-leon').codigo).toBe('castilla-leon');
  });

  it('acepta `castilla-y-leon` y devuelve la fuente de Castilla y León', () => {
    const fuente = fuenteDeFederacion(raiz, 'castilla-y-leon');
    expect(fuente.codigo).toBe('castilla-leon');
    expect(fuente.portal).toContain('rfcylf');
  });

  it('acepta `federacion`, que es como se llama la cola en el servidor', () => {
    expect(fuenteDeFederacion(raiz, 'federacion').codigo).toBe('castilla-leon');
  });

  it('no toca las demás: un nombre desconocido sigue fallando', () => {
    expect(() => fuenteDeFederacion(raiz, 'castilla-la-mancha-y-leon')).toThrow(/no está en config/);
  });

  it('el catálogo no gana ni pierde federaciones por los alias', () => {
    const codigos = leeFederaciones(raiz).map((f) => f.codigo);
    expect(codigos).toContain('castilla-leon');
    expect(codigos).not.toContain('castilla-y-leon');
  });
});

/**
 * La segunda mitad del mismo fallo: aunque la federación se resuelva, la cola se buscaba con el nombre de
 * entrada, así que `--federacion castilla-y-leon` miraba en `descargas-castilla-y-leon` (que no existe) en
 * lugar de `descargas-federacion`, que es donde está de verdad.
 */
describe('ruta de la cola por nombre de federación', () => {
  const raiz = 'C:/raiz';

  it('castilla-y-leon apunta a la cola de descargas-federacion', () => {
    expect(ColaOrigen.rutaDeFederacion(raiz, 'castilla-y-leon').replace(/\\/g, '/')).toBe(
      'C:/raiz/descargas-federacion/recolector-local/cola-v2.sqlite',
    );
  });

  it('castilla-leon y federacion apuntan a la misma cola', () => {
    const a = ColaOrigen.rutaDeFederacion(raiz, 'castilla-leon');
    const b = ColaOrigen.rutaDeFederacion(raiz, 'federacion');
    expect(a).toBe(b);
  });

  it('las demás siguen usando su propia carpeta', () => {
    expect(ColaOrigen.rutaDeFederacion(raiz, 'murcia').replace(/\\/g, '/')).toBe(
      'C:/raiz/descargas-murcia/recolector-local/cola-v2.sqlite',
    );
  });
});
