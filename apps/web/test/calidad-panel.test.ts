import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EQUIPOS_DE_LA_TEMPORADA, type FilaCalidadGlobal } from '../src/consultas/calidad';
import { FilaCalidad } from '../src/componentes/calidad/FilaCalidad';

/**
 * Contrato del panel de calidad global tras la revisión externa del 13/11/2026.
 *
 * Lo que se defiende:
 *  · la consulta de equipos (buscador por equipo) es una lectura acotada, parametrizada y con LIMIT;
 *  · la fila móvil enseña el nombre legible y UNA métrica principal, y los indicadores quedan dentro
 *    del desplegable (`<details>`), que funciona sin JavaScript;
 *  · el estado nunca va sólo con color: «Cuadra»/«No cuadra» es texto, y el descuadre lleva su signo.
 */
const FILA: FilaCalidadGlobal = {
  grupo_id: 2939,
  edicion: '1ª División Provincial de Juveniles',
  grupo: 'Primera - Salamanca',
  federacion: 'castilla-leon',
  partidos: 26,
  con_resultado: 7,
  con_acta: 6,
  porcentaje_actas: 86,
  descuadre_pj: 0,
  descuadre_puntos: 0,
  descuadre_goles: 0,
  resultado: 'OK',
  total_grupos: 249,
  total_ko: 0,
};

describe('consulta de equipos para el buscador del panel', () => {
  it('es una lectura acotada, parametrizada y con LIMIT', () => {
    expect(EQUIPOS_DE_LA_TEMPORADA.sql.toLowerCase()).toContain('limit');
    expect(EQUIPOS_DE_LA_TEMPORADA.sql).toContain('$1');
    expect(EQUIPOS_DE_LA_TEMPORADA.sql).not.toContain('${');
    expect(EQUIPOS_DE_LA_TEMPORADA.columnas).toEqual(expect.arrayContaining(['grupo_id', 'equipos']));
    expect(EQUIPOS_DE_LA_TEMPORADA.presupuestoMs).toBeGreaterThan(0);
  });
});

describe('fila de calidad adaptada al móvil', () => {
  it('enseña nombre legible y una métrica principal, y el resto queda al desplegar', () => {
    const html = renderToStaticMarkup(createElement(FilaCalidad, { fila: FILA }));
    expect(html).toContain('1ª División Provincial de Juveniles');
    expect(html).toContain('Primera - Salamanca');
    expect(html).toContain('Cuadra');
    expect(html).toContain('6/7 (86 %)');
    expect(html).toContain('<details');
    expect(html).toContain('Partidos jugados');
    expect(html).toContain('PJ = V+E+D');
    expect(html).toContain('Ver la ficha del grupo');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('min-h-11');
  });

  it('una regla que no cuadra se dice con texto y con el descuadre exacto, no sólo con color', () => {
    const html = renderToStaticMarkup(createElement(FilaCalidad, {
      fila: { ...FILA, descuadre_pj: 3, resultado: 'KO' },
    }));
    expect(html).toContain('No cuadra');
    expect(html).toContain('No cuadra (+3)');
    expect(html).toMatch(/no cuadra/i);
  });
});
