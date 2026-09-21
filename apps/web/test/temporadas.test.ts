import { describe, expect, it } from 'vitest';
import { TEMPORADA_MINIMA, enVentana, filtroVentana } from '../src/lib/temporadas';

/**
 * La ventana de temporadas de la web.
 *
 * Decisión del cliente (14/9/2026): se recogen y se publican 2023-24 en adelante. Si la web enseñara
 * temporadas que ya no se recogen, el visitante vería un catálogo enorme con casi todo a medias para
 * siempre; y si el suelo se comparara por código de temporada, La Rioja (código 9 = 2013-14) y
 * Andalucía (código 19 = 2023-24) darían resultados distintos con la misma regla.
 */
describe('ventana de temporadas de la web', () => {
  it('el suelo por defecto es 2023-24 y tiene forma de etiqueta', () => {
    expect(TEMPORADA_MINIMA).toMatch(/^\d{4}-\d{2}$/);
    expect(TEMPORADA_MINIMA).toBe('2023-24');
  });

  it('compara por etiqueta, no por código', () => {
    expect(enVentana('2023-24')).toBe(true);
    expect(enVentana('2024-25')).toBe(true);
    expect(enVentana('2025-26')).toBe(true);
    expect(enVentana('2026-27')).toBe(true);
    expect(enVentana('2022-23')).toBe(false);
    expect(enVentana('2013-14')).toBe(false);
    expect(enVentana(null)).toBe(false);
  });

  it('el filtro SQL es un fragmento con el alias y la etiqueta validada', () => {
    const filtro = filtroVentana('g');
    expect(filtro).toContain('g.temporada in (select codigo from temporadas where etiqueta >= ');
    expect(filtro).toContain(`'${TEMPORADA_MINIMA}'`);
    // Nada de comillas sueltas ni comentarios: la etiqueta está validada con `^\d{4}-\d{2}$`.
    expect(filtro.match(/'/g)?.length).toBe(2);
  });
});
