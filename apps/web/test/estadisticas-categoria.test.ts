import { describe, expect, it } from 'vitest';
import {
  GOLEADORES_DE_ESTADISTICAS, GOLEADORES_POR_CATEGORIA, RESUMEN_DE_ESTADISTICAS, RESUMEN_POR_CATEGORIA,
} from '../src/consultas/estadisticas';
import {
  CATEGORIA_POR_DEFECTO, categoriaDeEstadisticas, urlDeEstadisticasConCategoria,
} from '../src/lib/estadisticas';

describe('estadísticas generales: siempre de una categoría', () => {
  it('las consultas por categoría añaden su condición y no cambian nada más', () => {
    expect(RESUMEN_POR_CATEGORIA.sql).toContain('and e.categoria = $3::text');
    expect(RESUMEN_POR_CATEGORIA.sql.length).toBeGreaterThan(RESUMEN_DE_ESTADISTICAS.sql.length);
    expect(GOLEADORES_POR_CATEGORIA.sql).toContain('and ce.categoria = $6::text');
    expect(GOLEADORES_POR_CATEGORIA.sql.length).toBeGreaterThan(GOLEADORES_DE_ESTADISTICAS.sql.length);
    expect(GOLEADORES_POR_CATEGORIA.columnas).toEqual(GOLEADORES_DE_ESTADISTICAS.columnas);
  });

  it('sin categoría en la URL se enseña aficionados, nunca todas', () => {
    expect(categoriaDeEstadisticas(undefined)).toBe(CATEGORIA_POR_DEFECTO);
    expect(categoriaDeEstadisticas('todas')).toBe('aficionados');
    expect(categoriaDeEstadisticas('Alevin')).toBe('alevin');
  });

  it('la categoría viaja en la URL junto al resto de filtros', () => {
    const filtros = { federacion: null, temporada: '2026-27', texto: null };
    expect(urlDeEstadisticasConCategoria(filtros, 'aficionados')).toBe('/explorar/estadisticas?temp=2026-27');
    expect(urlDeEstadisticasConCategoria(filtros, 'juvenil')).toBe('/explorar/estadisticas?temp=2026-27&cat=juvenil');
    expect(urlDeEstadisticasConCategoria({ federacion: null, temporada: null, texto: null }, 'cadete'))
      .toBe('/explorar/estadisticas?cat=cadete');
  });
});
