import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrediccionPartido } from '../src/componentes/partidos/PrediccionPartido';
import { formateaPorcentaje, lineaDePrediccion } from '../src/lib/prediccion';

/**
 * Contrato de la predicción en la ficha del partido (paso 4 del encargo del 16/11/2026).
 *
 * Lo que se defiende:
 *  · se publican los TRES porcentajes (1, X, 2) y el marcador más probable, no sólo uno;
 *  · se dice en una línea de dónde salen (media de goles de la liga y ventaja de casa);
 *  · un partido sin predicción no enseña un 33/33/33 inventado: dice que no hay datos suficientes;
 *  · un partido ya jugado se etiqueta como expectativa previa, para no confundirla con el resultado.
 */

const PREDICCION = {
  prob_local: 59.84,
  prob_empate: 21.12,
  prob_visitante: 19.04,
  marcador_probable: '2-1',
  prob_marcador: 10.13,
  media_total: 4.42,
  ventaja_casa: 1.2694,
  partidos_liga: 535,
};

describe('predicción en la ficha', () => {
  it('enseña los tres porcentajes, el marcador probable y la explicación', () => {
    const html = renderToStaticMarkup(createElement(PrediccionPartido, {
      local: 'U.D. Santa Marta de Tormes',
      visitante: 'Júpiter Leonés',
      prediccion: PREDICCION,
      jugado: false,
    }));
    expect(html).toContain('59,8');
    expect(html).toContain('21,1');
    expect(html).toContain('19,0');
    expect(html).toContain('1');
    expect(html).toContain('X');
    expect(html).toContain('2');
    expect(html).toContain('2-1');
    expect(html).toContain('4,42');
    expect(html).toContain('goles por partido');
  });

  it('un partido jugado se etiqueta como expectativa previa, no como resultado', () => {
    const html = renderToStaticMarkup(createElement(PrediccionPartido, {
      local: 'A', visitante: 'B', prediccion: PREDICCION, jugado: true,
    }));
    expect(html.toLowerCase()).toContain('previa');
    expect(html).not.toContain('resultado probable');
  });

  it('marca «Pasó» en la celda del desenlace real, sin juzgar acierto', () => {
    const html = renderToStaticMarkup(createElement(PrediccionPartido, {
      local: 'A', visitante: 'B', prediccion: PREDICCION, jugado: true, resultado: 'local',
    }));
    expect(html).toContain('Pasó');
    expect(html).not.toContain('Acierto');
  });

  it('sin predicción lo dice; no inventa un reparto', () => {
    const html = renderToStaticMarkup(createElement(PrediccionPartido, {
      local: 'A', visitante: 'B', prediccion: null, jugado: false,
    }));
    expect(html).toContain('Aún no hay predicción publicada');
    expect(html).not.toContain('33');
  });

  it('los porcentajes se formatean en español y con un decimal', () => {
    expect(formateaPorcentaje(59.84)).toBe('59,8 %');
    expect(formateaPorcentaje(0)).toBe('0,0 %');
  });

  it('la línea de explicación es una sola y nombra la media de la liga', () => {
    const linea = lineaDePrediccion({
      local: 'U.D. Santa Marta de Tormes', visitante: 'Júpiter Leonés', ...PREDICCION,
    });
    expect(linea).not.toContain('\n');
    expect(linea).toContain('4,42');
    expect(linea).toContain('535');
    expect(linea).toContain('1,27');
  });
});
