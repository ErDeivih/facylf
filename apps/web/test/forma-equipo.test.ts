import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  etiquetaForma, insigniaForma, letraFormaVisible,
  type EtiquetaForma, type LetraFormaVisible,
} from '../src/lib/forma-equipo';
import { Racha } from '../src/componentes/Racha';

/**
 * La forma del equipo en la interfaz: **V-E-D**.
 *
 * Decisión de David del 04/11/2026 (recogida en `ESPECIFICACION.md`): la aplicación usa
 * «Victoria/Empate/Derrota» y el prototipo, que mezclaba V-E-D y G-E-P, se unifica a V-E-D.
 *
 * Lo que esta prueba protege, y por qué no es un detalle de estilo:
 *  · **el dato de origen no se toca**: las consultas y el dominio siguen devolviendo el `Signo`
 *    `G/E/P`; la traducción es sólo de presentación y vive en un único sitio;
 *  · **la letra visible nunca es la del dato** (`G` y `P` no pueden llegar a la pantalla);
 *  · **nunca sólo color**: cada letra lleva su palabra, y las tres palabras son las de la decisión.
 *
 * Se prueba el mapa y lo que pinta la insignia, no cómo está montado el componente: si mañana cambia
 * el marcado, estas aserciones siguen midiendo lo que ve el usuario.
 */

/** Lo que un usuario ve dentro de una insignia de forma, sacado del HTML ya renderizado. */
function insigniasDelHtml(html: string): Array<{ etiqueta: string; letra: string }> {
  return [...html.matchAll(/<span[^>]*\btitle="(Victoria|Empate|Derrota)"[^>]*>([^<]*)/g)]
    .map((m) => ({ etiqueta: m[1]!, letra: m[2]!.trim() }));
}

describe('la traducción de la forma a V-E-D', () => {
  it('el dato G/E/P se lee V/E/D en pantalla', () => {
    expect(letraFormaVisible('G')).toBe('V');
    expect(letraFormaVisible('E')).toBe('E');
    expect(letraFormaVisible('P')).toBe('D');
  });

  it('cada letra lleva su palabra: Victoria, Empate, Derrota', () => {
    expect(etiquetaForma('G')).toBe('Victoria');
    expect(etiquetaForma('E')).toBe('Empate');
    expect(etiquetaForma('P')).toBe('Derrota');
  });

  it('el tipo de letra visible es V-E-D y no admite G ni P', () => {
    const letrasVisibles: LetraFormaVisible[] = ['V', 'E', 'D'];
    const etiquetas: EtiquetaForma[] = ['Victoria', 'Empate', 'Derrota'];
    const mapa = (['G', 'E', 'P'] as const).map((signo) => letraFormaVisible(signo));
    // Las tres letras y las tres palabras de la decisión, ni una más.
    expect(new Set(mapa)).toEqual(new Set(letrasVisibles));
    expect(mapa).toHaveLength(3);
    expect(new Set((['G', 'E', 'P'] as const).map((signo) => etiquetaForma(signo))))
      .toEqual(new Set(etiquetas));
    // Y la letra que se pinta nunca es la del `Signo` del dato.
    expect(mapa).not.toContain('G');
    expect(mapa).not.toContain('P');
  });

  it('la etiqueta y la letra de una insignia no pueden desincronizarse', () => {
    expect(insigniaForma('G')).toEqual({ letra: 'V', etiqueta: 'Victoria' });
    expect(insigniaForma('E')).toEqual({ letra: 'E', etiqueta: 'Empate' });
    expect(insigniaForma('P')).toEqual({ letra: 'D', etiqueta: 'Derrota' });
  });

  it('el mapa es total y biyectivo: ningún resultado se queda sin letra ni comparte la de otro', () => {
    const insignias = (['G', 'E', 'P'] as const).map((signo) => insigniaForma(signo));
    expect(insignias).toHaveLength(3);
    expect(new Set(insignias.map((i) => i.letra)).size).toBe(3);
    expect(new Set(insignias.map((i) => i.etiqueta)).size).toBe(3);
    for (const { letra, etiqueta } of insignias) {
      expect(['V', 'E', 'D']).toContain(letra);
      expect(['Victoria', 'Empate', 'Derrota']).toContain(etiqueta);
    }
  });
});

describe('la racha vieja pinta la letra visible, no la del dato', () => {
  it('una racha G/E/P se ve V/E/D con su palabra accesible', () => {
    const html = renderToStaticMarkup(createElement(Racha, { racha: ['G', 'E', 'P'] as const }));
    expect(insigniasDelHtml(html)).toEqual([
      { etiqueta: 'Victoria', letra: 'V' },
      { etiqueta: 'Empate', letra: 'E' },
      { etiqueta: 'Derrota', letra: 'D' },
    ]);
    // La letra del dato no se pinta como insignia: ni «G» ni «P» sueltas.
    expect(html).not.toMatch(/>G</);
    expect(html).not.toMatch(/>P</);
    expect(html).not.toMatch(/Ganado|Perdido/);
  });

  it('sin resultados no inventa insignias y lo dice', () => {
    const html = renderToStaticMarkup(createElement(Racha, { racha: [] }));
    expect(insigniasDelHtml(html)).toEqual([]);
    expect(html).toMatch(/sin resultados/i);
  });
});
