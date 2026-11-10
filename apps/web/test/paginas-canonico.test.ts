import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agrupaFacetas, estadoVisibilidad, etiqueta, fechaHora, numero, porcentaje, texto,
} from '../src/lib/presentacion-canonico';
import { PROVINCIAS_CYL } from '../src/lib/provincias-cyl';

/**
 * Las tres páginas que se pasaron al canónico (portada, `/federaciones` y `/competiciones`) y lo que
 * las hace honestas.
 *
 * Aquí no se prueba Next ni PostgreSQL: se defiende el invariante del proyecto —`desconocido`,
 * `no publicado`, `pendiente` y «sin datos» son estados distintos y **nunca** se convierten en `0`— y se
 * evita que esas páginas vuelvan a leer las colas SQLite, que es el fallo que las dejaba a cero dentro
 * del contenedor de la web.
 */

const RAIZ = join(import.meta.dirname, '..');
const PAGINAS = ['src/app/page.tsx', 'src/app/federaciones/page.tsx', 'src/app/competiciones/page.tsx'];

describe('presentación del canónico: un dato ausente no es un cero', () => {
  it('un recuento nulo sale como guion, nunca como 0', () => {
    expect(numero(null)).toBe('—');
    expect(numero(undefined)).toBe('—');
    expect(numero(0)).toBe('0');
    // El separador de millares es el de `es-ES`, que no agrupa los números de cuatro cifras (1234).
    expect(numero(12345)).toBe('12.345');
  });

  it('un porcentaje sin total no se calcula: es null, no 0 %', () => {
    expect(porcentaje(null, null)).toBeNull();
    expect(porcentaje(3, null)).toBeNull();
    expect(porcentaje(3, 0)).toBeNull();
    expect(porcentaje(0, 10)).toBe(0);
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(10, 10)).toBe(100);
  });

  it('una fecha ausente es un guion, no la fecha de hoy', () => {
    expect(fechaHora(null)).toBe('—');
    expect(fechaHora('no es una fecha')).toBe('—');
    expect(fechaHora('2026-09-21T16:38:58.038Z')).not.toBe('—');
  });

  it('un texto vacío o ausente se dice con un guion', () => {
    expect(texto(null)).toBe('—');
    expect(texto('   ')).toBe('—');
    expect(texto('Grupo 9')).toBe('Grupo 9');
  });

  it('el estado de visibilidad se dice en palabras y sin punto de control no es «oculta»', () => {
    expect(estadoVisibilidad('completa')).toBe('completa');
    expect(estadoVisibilidad('verificada_hasta_jornada')).toBe('hasta jornada');
    expect(estadoVisibilidad('parcial_privada')).toBe('parcial');
    expect(estadoVisibilidad('oculta')).toBe('sin publicar');
    // Nulo es «no hay punto de control»: no se confunde con un grupo oculto ni con un cero.
    expect(estadoVisibilidad(null)).toBe('sin punto de control');
    // Un valor fuera del vocabulario se enseña tal cual: preferimos que se vea raro a esconderlo.
    expect(estadoVisibilidad('inventado')).toBe('inventado');
  });

  it('los vocabularios del esquema se traducen, y «desconocido» es un estado, no un hueco', () => {
    expect(etiqueta('modalidad', 'sala')).toBe('Fútbol sala');
    expect(etiqueta('genero', 'femenina')).toBe('Femenina');
    expect(etiqueta('categoria', 'alevin')).toBe('Alevín');
    expect(etiqueta('ambito', 'desconocido')).toBe('Ámbito sin determinar');
    expect(etiqueta('categoria', 'desconocida')).toBe('Categoría sin determinar');
    expect(etiqueta('adaptador', 'ninguno')).toBe('sin adaptador');
    // Un valor que no está en el vocabulario documentado no se inventa: se enseña como viene.
    expect(etiqueta('ambito', 'provincial-nuevo')).toBe('provincial-nuevo');
    expect(etiqueta('ambito', null)).toBe('—');
  });

  it('las facetas se agrupan por dimensión, con las temporadas de la más reciente a la más vieja', () => {
    const facetas = agrupaFacetas([
      { dimension: 'temporada', valor: '2024-25', orden: 2024 },
      { dimension: 'temporada', valor: '2026-27', orden: 2026 },
      { dimension: 'temporada', valor: '2025-26', orden: 2025 },
      { dimension: 'categoria', valor: 'juvenil', orden: null },
      { dimension: 'categoria', valor: 'aficionados', orden: null },
      { dimension: 'ambito', valor: 'desconocido', orden: null },
      { dimension: 'provincia', valor: 'Salamanca', orden: null },
    ]);
    expect(facetas.temporadas.map((t) => t.valor)).toEqual(['2026-27', '2025-26', '2024-25']);
    expect(facetas.categorias.map((c) => c.etiqueta)).toEqual(['Aficionados', 'Juvenil']);
    expect(facetas.ambitos.map((a) => a.etiqueta)).toEqual(['Ámbito sin determinar']);
    // La provincia es la única dimensión con lista propia: las nueve de CyL, porque el filtro de
    // provincia es de la fase C (y el SQL del selector casa también con el nombre del grupo).
    expect(facetas.provincias.map((p) => p.valor)).toEqual([...PROVINCIAS_CYL]);
    // Una dimensión sin valores no se rellena con opciones de relleno: queda vacía.
    expect(facetas.generos).toEqual([]);
    expect(facetas.modalidades).toEqual([]);
  });
});

describe('las páginas migradas leen el canónico, no las colas locales', () => {
  it('ninguna de las tres importa el repositorio local', () => {
    for (const pagina of PAGINAS) {
      const fuente = readFileSync(join(RAIZ, pagina), 'utf8');
      // El repositorio local es la puerta a las SQLite de cada federación: dentro del contenedor de la
      // web esas carpetas no están montadas y las páginas salían a cero.
      expect(fuente, `${pagina} sigue leyendo las colas locales`).not.toMatch(/repositorio-local/);
      expect(fuente, `${pagina} no lee consultas del canónico`).toContain('@/consultas/');
    }
  });

  it('las tres comprueban si el canónico está disponible ANTES de consultarlo y dicen por qué no lo está', () => {
    for (const pagina of PAGINAS) {
      const fuente = readFileSync(join(RAIZ, pagina), 'utf8');
      expect(fuente, `${pagina} no comprueba motivoSinCanonico()`).toMatch(/motivoSinCanonico\(\)/);
      expect(fuente, `${pagina} no distingue el fallo del canónico`).toMatch(/CanonicoNoDisponible/);
      expect(fuente, `${pagina} no declara la página dinámica`).toMatch(/dynamic\s*=\s*'force-dynamic'/);
    }
  });

  it('la portada y las federaciones no enseñan contadores de la cola que el canónico no guarda', () => {
    // El avance de descubrimiento (`trabajos`, `gruposDescubiertos`, `pendientes`) vive sólo en cada
    // `cola-v2.sqlite`. Se dejó de enseñar a propósito: no se puede medir desde el canónico, y un cero
    // ahí sería una invención. (Que la página lo EXPLIQUE con palabras es lo correcto y por eso no se
    // busca la palabra suelta: se buscan los contadores y las funciones que los calculaban.)
    for (const pagina of PAGINAS) {
      const fuente = readFileSync(join(RAIZ, pagina), 'utf8');
      for (const contador of ['gruposDescubiertos', 'gruposPorDescubrir', 'avanceDescubrimiento',
        'resumenLocal', 'resumenFederacionesLocal', 'listarGruposLocal', 'explorarGruposLocal']) {
        expect(fuente, `${pagina} sigue usando ${contador}`).not.toContain(contador);
      }
    }
  });

  it('las federaciones y sus portales salen del canónico, no de una lista escrita a mano', () => {
    const fuente = readFileSync(join(RAIZ, 'src/app/federaciones/page.tsx'), 'utf8');
    expect(fuente).not.toMatch(/FEDERACIONES_LOCALES/);
    expect(fuente).not.toMatch(/const PORTALES/);
    expect(fuente).toContain('FEDERACIONES_DEL_CANONICO');
    expect(fuente).toMatch(/portal_url/);
  });
});
