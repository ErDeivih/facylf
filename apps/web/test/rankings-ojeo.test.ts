import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { SinResultados } from '../src/componentes/listados/Estados';
import { TablaOjeo } from '../src/componentes/ojeo/TablaOjeo';
import { TablaRanking } from '../src/componentes/rankings/TablaRanking';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { OPCIONES_DE_ESTADISTICAS } from '../src/consultas/estadisticas';
import { OJEO_JUGADORES, type FilaOjeo } from '../src/consultas/ojeo';
import {
  CATEGORIAS_DEL_OJEO, EDICIONES_DEL_RANKING, PARAMETROS_RANKINGS, RANKING_DE_JUGADORES,
  type FilaEdicionRanking, type FilaRankingJugador,
} from '../src/consultas/rankings';
import {
  LIMITE_OJEO, RUTA_OJEO, RUTA_RANKINGS, TAMANO_PAGINA_RANKING, TIPOS_RANKING,
  etiquetasDeEdad, leeFiltrosOjeo, leeFiltrosRanking, nacimientoDesde, parametrosDeOjeo,
  parametrosDeRanking, posicionDeFiltro, urlDeOjeo, urlDeRanking,
} from '../src/lib/rankings';

/**
 * Contrato de las pantallas de Rankings y Ojeo.
 *
 * Lo que se defiende:
 *  · los filtros viven en la URL y un valor inválido se ignora (no rompe la página);
 *  · la edad del ojeo se deduce de la temporada sin inventar fechas (sub-19 de 2026-27 = nacidos en
 *    2008 o después);
 *  · los nombres de menores **se publican** (decisión del 05/11/2026): la pantalla no los oculta;
 *  · cada fila enlaza a la ficha del jugador (y su historial), a la del equipo y a la competición, y
 *    lo que no está medido (minutos, min/gol) se enseña como «—» o con «≥», nunca como cero;
 *  · contra el canónico real, Castilla y León tiene goleadores, tarjetas y perfiles de ojeo en 2026-27.
 *
 * `next/link` se mockea: estos renders no corren dentro de un router de Next.
 */
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

const FILA_RANKING: FilaRankingJugador = {
  posicion: 2,
  persona_id: 46503,
  nombre: 'ÁLVAREZ GARCÍA, GUILLERMO',
  es_menor: true,
  equipo_id: 17670,
  equipo: 'C.D. La Virgen del Camino "B"',
  club_id: 9,
  tiene_escudo: false,
  federacion: 'castilla-leon',
  federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
  federacion_corta: 'Castilla y León',
  edicion_id: 3762,
  edicion: '1ª División Provincial de Aficionados',
  division: 'primera',
  categoria: 'aficionados',
  grupo_id: 3772,
  grupo: 'Primera - León',
  goles: 3,
  goles_penalti: 0,
  partidos: 5,
  minutos_exactos: 450,
  minutos_estimados: null,
  minutos_fiables: true,
  goles_por_partido: 0.6,
  minutos_por_gol: null,
  amarillas: 2,
  rojas: 0,
  dobles_amarillas: 0,
  partidos_sancion: 0,
  total: 73,
};

const FILA_OJEO: FilaOjeo = {
  posicion: 1,
  grupo_persona_id: 1927,
  persona_id: 1927,
  nombre: 'REDONDO CHAVEZ, DIEGO',
  es_menor: true,
  federaciones: ['castilla-leon'],
  club_id: 82,
  club: 'C.D. Numancia de Soria S.A.D.',
  equipo: 'C.D. Numancia de Soria S.A.D.',
  categoria: 'juvenil',
  mejor_escalon: 2,
  nacimiento_desde: 2008,
  nacimiento_hasta: 2008,
  minutos: 364,
  minutos_exactos: true,
  pct_minutos: 93.6,
  minutos_por_encima: 27,
  partidos: 5,
  titularidades: 4,
  goles: 4,
  goles_por_90: 0.99,
  expulsiones: 0,
  es_portero: false,
  linea: null,
  posicion_campo: null,
  por_encima_de_su_edad: true,
  temporadas_previas_alto_nivel: 1,
  edad_incoherente: false,
  p_minutos: 95,
  p_pct: 67,
  p_nivel: 90,
  p_encima: 100,
  p_continuidad: 82,
  p_goles: 84,
  puntuacion: 88,
  total: 1001,
};

describe('rankings · filtros y URL', () => {
  it('sin parámetros arranca en goleadores, primera página y sin filtros', () => {
    const filtros = leeFiltrosRanking({});
    expect(filtros).toEqual({
      federacion: null, temporada: null, tipo: 'goles', edicion: null, grupo: null,
      minimoPartidos: 5, desplazamiento: 0,
    });
    expect(TIPOS_RANKING.map((t) => t.valor)).toEqual(['goles', 'tarjetas']);
  });

  it('lee lo válido y descarta lo que no lo es (tipo, ids, mínimo y desplazamiento)', () => {
    const filtros = leeFiltrosRanking({
      fed: 'castilla-leon', temp: '2026-27', tipo: 'tarjetas', ed: '3762', grupo: '3772',
      min: '5', offset: '55',
    });
    expect(filtros).toMatchObject({
      federacion: 'castilla-leon', temporada: '2026-27', tipo: 'tarjetas', edicion: 3762,
      grupo: 3772, minimoPartidos: 5,
    });
    expect(filtros.desplazamiento).toBe(Math.floor(55 / TAMANO_PAGINA_RANKING) * TAMANO_PAGINA_RANKING);
    expect(leeFiltrosRanking({ tipo: 'inventado', ed: '-2', grupo: 'x', min: 'muchos', offset: '-9' }))
      .toMatchObject({ tipo: 'goles', edicion: null, grupo: null, minimoPartidos: 5, desplazamiento: 0 });
  });

  it('construye una URL limpia y la vuelve a leer igual', () => {
    const filtros = {
      federacion: 'castilla-leon', temporada: '2026-27', tipo: 'tarjetas' as const,
      edicion: 3762, grupo: null, minimoPartidos: 10, desplazamiento: 25,
    };
    const url = urlDeRanking(filtros);
    expect(url.startsWith(`${RUTA_RANKINGS}?`)).toBe(true);
    const query = Object.fromEntries(new URL(url, 'http://local').searchParams.entries());
    expect(query).toMatchObject({ fed: 'castilla-leon', temp: '2026-27', tipo: 'tarjetas', ed: '3762', min: '10', offset: '25' });
    expect(leeFiltrosRanking(query)).toEqual(filtros);
    expect(urlDeRanking(leeFiltrosRanking({}))).toBe(RUTA_RANKINGS);
  });

  it('los parámetros de la consulta llevan el tipo y la paginación en su sitio', () => {
    const filtros = leeFiltrosRanking({ fed: 'castilla-leon', temp: '2026-27', tipo: 'goles', min: '5' });
    expect(parametrosDeRanking(filtros, TAMANO_PAGINA_RANKING)).toEqual([
      'castilla-leon', '2026-27', 'goles', null, null, 5, TAMANO_PAGINA_RANKING, 0,
    ]);
  });
});

describe('ojeo · filtros, edad y URL', () => {
  it('sin parámetros arranca en sub-19 con 270 minutos y cualquier posición', () => {
    expect(leeFiltrosOjeo({})).toEqual({
      federacion: null, temporada: null, categoria: null, edad: 19, minutos: 270, posicion: 'cualquiera',
    });
  });

  it('la edad se traduce a año de nacimiento desde la temporada, sin inventar', () => {
    expect(nacimientoDesde('2026-27', 19)).toBe(2008);
    expect(nacimientoDesde('2026-27', 17)).toBe(2010);
    expect(nacimientoDesde('2026-27', 16)).toBe(2011);
    expect(nacimientoDesde('2026-27', null)).toBeNull();
    expect(nacimientoDesde(null, 19)).toBeNull();
    const etiquetas = etiquetasDeEdad('2026-27');
    expect(etiquetas.map((e) => e.valor)).toEqual(['19', '17', '16', '15']);
    expect(etiquetas[0]!.etiqueta).toContain('2008 o después');
  });

  it('lee filtros válidos y descarta los inválidos', () => {
    const filtros = leeFiltrosOjeo({
      fed: 'castilla-leon', temp: '2025-26', cat: 'juvenil', edad: '17', min: '540', pos: 'portero',
    });
    expect(filtros).toMatchObject({
      federacion: 'castilla-leon', temporada: '2025-26', categoria: 'juvenil', edad: 17, minutos: 540, posicion: 'portero',
    });
    expect(leeFiltrosOjeo({ edad: '12', min: '123', pos: 'defensa' }))
      .toMatchObject({ edad: 19, minutos: 270, posicion: 'defensa' });
    expect(leeFiltrosOjeo({ edad: 'x', min: 'x', pos: 'x' }))
      .toMatchObject({ edad: 19, minutos: 270, posicion: 'cualquiera' });
  });

  it('la posición se traduce a los parámetros que entiende la consulta', () => {
    expect(posicionDeFiltro('cualquiera')).toEqual({ esPortero: null, linea: null });
    expect(posicionDeFiltro('portero')).toEqual({ esPortero: true, linea: null });
    expect(posicionDeFiltro('defensa')).toEqual({ esPortero: null, linea: 'DEF' });
    expect(posicionDeFiltro('medio')).toEqual({ esPortero: null, linea: 'MED' });
    expect(posicionDeFiltro('delantero')).toEqual({ esPortero: null, linea: 'DEL' });
  });

  it('los parámetros de la consulta piden los nombres de los menores (decisión 05/11/2026)', () => {
    const filtros = leeFiltrosOjeo({ fed: 'castilla-leon', temp: '2026-27', edad: '19', min: '270' });
    const parametros = parametrosDeOjeo(filtros, LIMITE_OJEO);
    expect(parametros).toHaveLength(13);
    expect(parametros[0]).toBe('castilla-leon');
    expect(parametros[1]).toBe('2026-27');
    expect(parametros[2]).toBe(2008); // nacidos en 2008 o después
    expect(parametros[6]).toBe(270);
    expect(parametros[11]).toBe(LIMITE_OJEO);
    expect(parametros[12]).toBe(true); // nombres publicados
  });

  it('la URL del ojeo conserva los filtros y se vuelve a leer igual', () => {
    const filtros = {
      federacion: 'castilla-leon', temporada: '2026-27', categoria: 'juvenil',
      edad: 19, minutos: 270, posicion: 'portero' as const,
    };
    const url = urlDeOjeo(filtros);
    expect(url.startsWith(`${RUTA_OJEO}?`)).toBe(true);
    expect(leeFiltrosOjeo(Object.fromEntries(new URL(url, 'http://local').searchParams.entries()))).toEqual(filtros);
    expect(urlDeOjeo(leeFiltrosOjeo({}))).toBe(RUTA_OJEO);
  });
});

describe('tablas de rankings y ojeo', () => {
  it('cada fila enlaza a jugador, equipo y competición, y un menor conserva su nombre', () => {
    const html = renderToStaticMarkup(createElement(TablaRanking, {
      filas: [FILA_RANKING], tipo: 'goles',
    }));
    expect(html).toContain('href="/explorar/jugador/46503"');
    expect(html).toContain('href="/explorar/equipo/17670"');
    expect(html).toContain('href="/explorar/competicion/3772"');
    expect(html).toContain('ÁLVAREZ GARCÍA, GUILLERMO');
    expect(html).toContain('C.D. La Virgen del Camino');
    expect(html).toContain('3'); // goles
    expect(html).toContain('—'); // min/gol no fiable
  });

  it('la tabla de tarjetas enseña amarillas y rojas sin inventar el resto', () => {
    const html = renderToStaticMarkup(createElement(TablaRanking, {
      filas: [FILA_RANKING], tipo: 'tarjetas',
    }));
    expect(html).toContain('Amarillas');
    expect(html).toContain('Rojas');
  });

  it('el ojeo enlaza la ficha y el historial, y marca con «≥» los minutos no exactos', () => {
    const html = renderToStaticMarkup(createElement(TablaOjeo, {
      filas: [{ ...FILA_OJEO, minutos_exactos: false }],
    }));
    expect(html).toContain('href="/explorar/jugador/1927"');
    expect(html).toContain('href="/explorar/jugador/1927/historial"');
    expect(html).toContain('REDONDO CHAVEZ, DIEGO');
    expect(html).toContain('≥');
  });

  it('el estado vacío dice qué pasa y ofrece quitar los filtros', () => {
    const html = renderToStaticMarkup(createElement(SinResultados, {
      titulo: 'Sin goleadores',
      quitarHref: RUTA_RANKINGS,
    }, 'No hay jugadores con estos filtros.'));
    expect(html).toContain('Sin goleadores');
    expect(html).toContain('No hay jugadores con estos filtros.');
    expect(html).toContain(`href="${RUTA_RANKINGS}"`);
  });
});

describe('contrato estático de las consultas nuevas', () => {
  it('declaran presupuesto, plan, columnas, LIMIT y parámetros de ejemplo', () => {
    for (const c of [RANKING_DE_JUGADORES, EDICIONES_DEL_RANKING, CATEGORIAS_DEL_OJEO]) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(['indexado', 'agregado']).toContain(c.plan);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(c.sql.toLowerCase()).toContain('limit');
      expect(c.sql).not.toContain('${');
      expect(PARAMETROS_RANKINGS[c.nombre], `${c.nombre} sin parámetros`).toBeDefined();
    }
  });
});

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;
afterAll(async () => { await cierraCanonico(); });

describe.skipIf(!hayCanonico)('contrato contra el canónico real (Castilla y León)', () => {
  it('los goleadores de 2026-27 salen ordenados y con sus ids para enlazar', async () => {
    const filas = await consulta<FilaRankingJugador>(RANKING_DE_JUGADORES.sql,
      ['castilla-leon', '2026-27', 'goles', null, null, 5, 10, 0]);
    expect(filas.length).toBeGreaterThan(0);
    const goles = filas.map((f) => Number(f.goles));
    expect(goles).toEqual([...goles].sort((a, b) => b - a));
    for (const fila of filas) {
      expect(Number(fila.persona_id)).toBeGreaterThan(0);
      expect(Number(fila.equipo_id)).toBeGreaterThan(0);
      expect(Number(fila.grupo_id)).toBeGreaterThan(0);
      expect(fila.nombre.length).toBeGreaterThan(0);
    }
    expect(filas.some((f) => f.es_menor && f.nombre.length > 0)).toBe(true);
    expect(Number(filas[0]!.total)).toBeGreaterThan(0);
  });

  it('el ranking de tarjetas ordena por amarillas', async () => {
    const filas = await consulta<FilaRankingJugador>(RANKING_DE_JUGADORES.sql,
      ['castilla-leon', '2026-27', 'tarjetas', null, null, 5, 10, 0]);
    expect(filas.length).toBeGreaterThan(0);
    const amarillas = filas.map((f) => Number(f.amarillas));
    expect(amarillas).toEqual([...amarillas].sort((a, b) => b - a));
  });

  it('las competiciones de una federación y temporada traen sus grupos', async () => {
    const filas = await consulta<FilaEdicionRanking>(EDICIONES_DEL_RANKING.sql, ['castilla-leon', '2026-27']);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => Number(f.grupos) >= 0)).toBe(true);
    expect(filas[0]!.edicion.length).toBeGreaterThan(0);
  });

  it('las categorías del ojeo de 2026-27 existen y son valores reales', async () => {
    const filas = await consulta<{ categoria: string }>(CATEGORIAS_DEL_OJEO.sql, ['2026-27']);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.map((f) => f.categoria)).toContain('juvenil');
  });

  it('los perfiles de ojeo de CyL publican nombres (también de menores) y respetan el mínimo de minutos', async () => {
    const filtros = leeFiltrosOjeo({ fed: 'castilla-leon', temp: '2026-27', edad: '19', min: '270' });
    const filas = await consulta<FilaOjeo>(OJEO_JUGADORES.sql, parametrosDeOjeo(filtros, 10));
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(fila.nombre, 'un menor no puede salir sin nombre').not.toBeNull();
      expect(fila.nombre!.length).toBeGreaterThan(0);
      const minutos = fila.minutos ?? (fila.titularidades * 60);
      expect(minutos).toBeGreaterThanOrEqual(270);
    }
    expect(filas.some((f) => f.es_menor && (f.nombre ?? '').length > 0)).toBe(true);
    const puntuaciones = filas.map((f) => Number(f.puntuacion));
    expect(puntuaciones).toEqual([...puntuaciones].sort((a, b) => b - a));
  });

  it('las opciones de federación y temporada del catálogo incluyen Castilla y León y 2026-27', async () => {
    const [fila] = await consulta<{ federaciones: Array<{ codigo: string }> | null; temporadas: Array<{ etiqueta: string }> | null }>(
      OPCIONES_DE_ESTADISTICAS.sql, []);
    expect(fila?.federaciones?.some((f) => f.codigo === 'castilla-leon')).toBe(true);
    expect(fila?.temporadas?.some((t) => t.etiqueta === '2026-27')).toBe(true);
  });
});
