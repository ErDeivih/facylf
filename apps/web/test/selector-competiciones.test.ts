import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { FiltrosSelector } from '../src/componentes/catalogo/FiltrosSelector';
import { SinGrupos } from '../src/componentes/catalogo/EstadosSelector';
import { ListaGrupos } from '../src/componentes/catalogo/ListaGrupos';
import { GRUPOS_DEL_SELECTOR, OPCIONES_DEL_SELECTOR, PARAMETROS_SELECTOR } from '../src/consultas/catalogo-selector';
import type { FilaGrupoSelector, FilaOpcionSelector } from '../src/consultas/catalogo-selector';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  TAMANO_PAGINA_SELECTOR, chipsDeFiltros, interpretaTexto, leeFiltrosSelector, opcionesDeSelector,
  temporadasSugeridas, tieneFiltrosSelector, urlDeSelector, RUTA_SELECTOR,
} from '../src/lib/selector-competiciones';
import type { EstadoSelector } from '../src/lib/selector-competiciones';

/**
 * Contrato del selector de temporada y competición (WALL objetivo 4).
 *
 * Lo que se defiende:
 *  · una búsqueda como «Segunda Juvenil 2017, Burgos» se interpreta sin inventar: el año 2017 es la
 *    temporada 2016-17 (la que termina ese año) y las palabras se buscan por comienzo de palabra;
 *  · el estado vive en la URL (`fed`, `temp`, `cat`, `mod`, `gen`, `prov`, `nivel`, `q`, `offset`), con
 *    paginación por desplazamiento y sin filtros que no se pueden cumplir;
 *  · cuando no hay resultados se dice con palabras y se ofrecen temporadas con datos, no una lista vacía;
 *  · la consulta devuelve el id del grupo (para enlazar a `/explorar/competicion/<id>`) y su cobertura,
 *    y contra el canónico real encuentra el grupo 30665 de Castilla y León (2016-17, Burgos).
 *
 * `next/link` se mockea porque estos renders no corren dentro de un router de Next.
 */
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return {
    default: ({ href, children, ...resto }: { href: string; children?: ReactNode } & Record<string, unknown>) =>
      h('a', { href, ...resto }, children),
  };
});

const TEMPORADAS = ['2026-27', '2025-26', '2024-25', '2023-24', '2016-17', '2015-16'];

function parametros(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra };
}

function estado(extra: Partial<EstadoSelector['filtros']> = {}): EstadoSelector {
  const filtros = {
    federacion: null, temporada: null, categoria: null, modalidad: null, genero: null,
    provincia: null, nivel: null, texto: null, desplazamiento: 0, ...extra,
  };
  return { filtros, explicita: filtros, interpretacion: { tokens: [], temporada: null, anio: null, textoSinTemporada: '' } };
}

const FILA: FilaGrupoSelector = {
  grupo_id: 30665,
  federacion: 'castilla-leon',
  federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
  federacion_corta: 'Castilla y León',
  temporada: '2016-17',
  edicion_codigo: '12926',
  edicion: '2ª División Provincial de Juveniles',
  ambito: 'provincial',
  modalidad: 'desconocida',
  genero: 'desconocido',
  categoria: 'juvenil',
  provincia: null,
  nivel: 6,
  grupo_codigo: '12926',
  grupo: 'Primera - Burgos',
  grupo_tipo: 'liga',
  jornadas_previstas: 26,
  partidos_conocidos: 157,
  partidos_con_resultado: 156,
  actas_disponibles: 156,
  actas_parseadas: 156,
  complete_through_matchday: null,
  visibility_state: 'parcial_privada',
  calculado_en: '2026-10-13T10:53:59Z',
  total: 1,
};

function opciones(filas: readonly FilaOpcionSelector[]) {
  return opcionesDeSelector(filas);
}

describe('interpretación de la búsqueda libre', () => {
  it('«Segunda Juvenil 2017, Burgos» es la temporada 2016-17 y las palabras segunda/juvenil/burgos', () => {
    const r = interpretaTexto('Segunda Juvenil 2017, Burgos', TEMPORADAS);
    expect(r.temporada).toBe('2016-17');
    expect(r.tokens).toEqual(['2', 'juvenil', 'burgos']);
    expect(r.anio).toBe('2017');
  });

  it('un rango escrito «2016-17» es esa temporada exacta y no deja el año como palabra', () => {
    const r = interpretaTexto('2ª División 2016-17 Burgos', TEMPORADAS);
    expect(r.temporada).toBe('2016-17');
    expect(r.tokens).toEqual(['2', 'division', 'burgos']);
  });

  it('si el año no está en el catálogo no se inventa la temporada: el año se busca tal cual', () => {
    const r = interpretaTexto('Segunda Juvenil 1999 Burgos', TEMPORADAS);
    expect(r.temporada).toBeNull();
    // El orden de las palabras no importa para la consulta (se exigen todas); sí que esté el año.
    expect(r.tokens).toHaveLength(4);
    expect(r.tokens).toEqual(expect.arrayContaining(['2', 'juvenil', '1999', 'burgos']));
  });

  it('los números ordinales en palabra buscan como su cifra', () => {
    expect(interpretaTexto('primera juvenil', TEMPORADAS).tokens).toEqual(['1', 'juvenil']);
    expect(interpretaTexto('tercera', TEMPORADAS).tokens).toEqual(['3']);
  });

  it('sin tildes y sin palabras vacías: «el juvenil de Burgos» busca juvenil y burgos', () => {
    expect(interpretaTexto('el juvenil de Burgos', TEMPORADAS).tokens).toEqual(['juvenil', 'burgos']);
    expect(interpretaTexto('División', TEMPORADAS).tokens).toEqual(['division']);
  });

  it('una palabra repetida no se busca dos veces', () => {
    expect(interpretaTexto('juvenil juvenil', TEMPORADAS).tokens).toEqual(['juvenil']);
  });
});

describe('filtros del selector en la URL', () => {
  it('sin parámetros no hay filtros y se empieza en la primera página', () => {
    const r = leeFiltrosSelector(parametros(), TEMPORADAS);
    expect(r.filtros).toEqual({
      federacion: null, temporada: null, categoria: null, modalidad: null, genero: null,
      provincia: null, nivel: null, texto: null, desplazamiento: 0,
    });
    expect(tieneFiltrosSelector(r.filtros)).toBe(false);
  });

  it('lee los filtros válidos y descarta los que no lo son', () => {
    const r = leeFiltrosSelector(parametros({
      fed: 'castilla-leon', temp: '2016-17', cat: 'juvenil', mod: 'futbol11', gen: 'masculina',
      prov: 'Burgos', nivel: '6', q: 'Segunda Juvenil', offset: '95',
    }), TEMPORADAS);
    expect(r.filtros).toMatchObject({
      federacion: 'castilla-leon', temporada: '2016-17', categoria: 'juvenil', modalidad: 'futbol11',
      genero: 'masculina', provincia: 'Burgos', nivel: 6, texto: 'Segunda Juvenil',
    });
    // 95 no es múltiplo de la página: se ajusta hacia abajo (paginación por desplazamiento).
    expect(r.filtros.desplazamiento).toBe(Math.floor(95 / TAMANO_PAGINA_SELECTOR) * TAMANO_PAGINA_SELECTOR);
    expect(leeFiltrosSelector(parametros({ temp: '2025', nivel: 'x', offset: '-30', fed: 'MAYÚSCULAS' }), TEMPORADAS).filtros)
      .toMatchObject({ temporada: null, nivel: null, desplazamiento: 0, federacion: null });
  });

  it('la temporada escrita en el texto se aplica sólo si la URL no pide una', () => {
    const deducida = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017 Burgos' }), TEMPORADAS);
    expect(deducida.filtros.temporada).toBe('2016-17');
    expect(deducida.explicita.temporada).toBeNull();

    const explicita = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017 Burgos', temp: '2025-26' }), TEMPORADAS);
    expect(explicita.filtros.temporada).toBe('2025-26');
  });

  it('construye una URL limpia y la vuelve a leer igual', () => {
    const filtros = {
      federacion: 'castilla-leon', temporada: '2016-17', categoria: null, modalidad: null,
      genero: null, provincia: 'Burgos', nivel: 6, texto: 'Segunda Juvenil', desplazamiento: 30,
    };
    const url = urlDeSelector(filtros);
    expect(url.startsWith(`${RUTA_SELECTOR}?`)).toBe(true);
    const query = Object.fromEntries(new URL(url, 'http://local').searchParams.entries());
    expect(query).toMatchObject({
      fed: 'castilla-leon', temp: '2016-17', prov: 'Burgos', nivel: '6', q: 'Segunda Juvenil', offset: '30',
    });
    const releido = leeFiltrosSelector(query, TEMPORADAS);
    expect(releido.filtros).toEqual(filtros);
    expect(urlDeSelector(estado().filtros)).toBe(RUTA_SELECTOR);
  });

  it('los filtros activos se enseñan como chips con su enlace para quitarlos', () => {
    const deducida = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017 Burgos', fed: 'castilla-leon' }), TEMPORADAS);
    const chips = chipsDeFiltros(deducida, opciones([
      { dimension: 'federacion', valor: 'castilla-leon', etiqueta: 'Castilla y León', orden: null },
    ]));
    expect(chips.map((c) => c.clave).sort()).toEqual(['federacion', 'temporada', 'texto']);
    const temporada = chips.find((c) => c.clave === 'temporada')!;
    // Quitar la temporada deducida quita el año del texto, no la temporada de la URL a secas.
    const query = Object.fromEntries(new URL(temporada.url, 'http://local').searchParams.entries());
    expect(query.temp).toBeUndefined();
    expect(query.q).toBe('Segunda Juvenil Burgos');
    expect(tieneFiltrosSelector(deducida.filtros)).toBe(true);
  });

  it('propone temporadas con datos cercanas a la pedida para recuperar una búsqueda sin resultados', () => {
    const r = leeFiltrosSelector(parametros({ temp: '2016-17' }), TEMPORADAS);
    const sugeridas = temporadasSugeridas(r.filtros, TEMPORADAS, 4);
    expect(sugeridas).not.toContain('2016-17');
    expect(sugeridas.length).toBe(4);
    expect(sugeridas).toContain('2015-16');
  });

  it('agrupa las opciones del canónico y descarta los valores vacíos', () => {
    const o = opciones([
      { dimension: 'federacion', valor: 'castilla-leon', etiqueta: 'Castilla y León', orden: null },
      { dimension: 'temporada', valor: '2016-17', etiqueta: '2016-17', orden: 2016 },
      { dimension: 'temporada', valor: '2025-26', etiqueta: '2025-26', orden: 2025 },
      { dimension: 'nivel', valor: '2', etiqueta: 'Nivel 2', orden: 2 },
      { dimension: 'nivel', valor: '6', etiqueta: 'Nivel 6', orden: 6 },
      { dimension: 'provincia', valor: '', etiqueta: '', orden: null },
      { dimension: 'provincia', valor: 'Burgos', etiqueta: 'Burgos', orden: null },
    ]);
    expect(o.temporadas.map((t) => t.valor)).toEqual(['2025-26', '2016-17']);
    expect(o.niveles.map((n) => n.valor)).toEqual(['2', '6']);
    expect(o.provincias.map((p) => p.valor)).toEqual(['Burgos']);
    expect(o.federaciones).toHaveLength(1);
  });
});

describe('el selector en pantalla', () => {
  it('los filtros son un formulario GET con sus campos y la temporada deducida seleccionada', () => {
    const deducida = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017 Burgos' }), TEMPORADAS);
    const html = renderToStaticMarkup(createElement(FiltrosSelector, {
      estado: deducida,
      opciones: opciones([
        { dimension: 'federacion', valor: 'castilla-leon', etiqueta: 'Castilla y León', orden: null },
        { dimension: 'temporada', valor: '2016-17', etiqueta: '2016-17', orden: 2016 },
      ]),
    }));
    expect(html).toContain(`action="${RUTA_SELECTOR}"`);
    for (const nombre of ['fed', 'temp', 'cat', 'mod', 'gen', 'prov', 'nivel', 'q']) {
      expect(html, `falta el campo ${nombre}`).toMatch(new RegExp(`name="${nombre}"`));
    }
    expect(html).toContain('value="2016-17" selected');
    expect(html).toContain('placeholder="Segunda Juvenil 2017, Burgos"');
    expect(html).toContain('Castilla y León');
  });

  it('la lista enlaza cada grupo con su id y enseña cobertura sin convertir lo ausente en cero', () => {
    const html = renderToStaticMarkup(createElement(ListaGrupos, {
      filas: [FILA, { ...FILA, grupo_id: 2, grupo: 'Primera - Soria', partidos_conocidos: null, partidos_con_resultado: null, actas_disponibles: null, actas_parseadas: null }],
    }));
    expect(html).toContain('href="/explorar/competicion/30665"');
    expect(html).toContain('2016-17');
    expect(html).toContain('2ª División Provincial de Juveniles');
    expect(html).toContain('Primera - Burgos');
    expect(html).toContain('156 de 157 partidos');
    expect(html).toContain('Cobertura sin medir');
    expect(html).not.toContain('0 de 0');
  });

  it('sin resultados dice la verdad, deja quitar filtros y ofrece temporadas con datos', () => {
    const sin = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017 Burgos', fed: 'castilla-leon', temp: '2016-17' }), TEMPORADAS);
    const html = renderToStaticMarkup(createElement(SinGrupos, {
      estado: sin,
      opciones: opciones([
        { dimension: 'temporada', valor: '2025-26', etiqueta: '2025-26', orden: 2025 },
        { dimension: 'temporada', valor: '2015-16', etiqueta: '2015-16', orden: 2015 },
      ]),
    }));
    expect(html).toContain('No hay grupos con esos filtros');
    expect(html).toContain(`href="${RUTA_SELECTOR}"`);
    expect(html).toContain('temp=2025-26');
    expect(html).toContain('2015-16');
    // Sin explicaciones internas: nada de SQL, tablas ni palabras de desarrollador.
    expect(html).not.toMatch(/sql|base de datos|endpoint|core\./i);
  });
});

describe('contrato estático de las consultas del selector', () => {
  it('declaran presupuesto, plan, columnas, LIMIT y parámetros de ejemplo', () => {
    for (const c of [GRUPOS_DEL_SELECTOR, OPCIONES_DEL_SELECTOR]) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(['indexado', 'agregado']).toContain(c.plan);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(c.sql.toLowerCase()).toContain('limit');
      expect(c.sql).not.toContain('${');
      expect(PARAMETROS_SELECTOR[c.nombre], `${c.nombre} sin parámetros`).toBeDefined();
    }
    expect(GRUPOS_DEL_SELECTOR.columnas).toContain('grupo_id');
    expect(GRUPOS_DEL_SELECTOR.columnas).toContain('nivel');
    expect(GRUPOS_DEL_SELECTOR.presupuestoMs).toBeLessThanOrEqual(1_000);
  });
});

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;
afterAll(async () => { await cierraCanonico(); });

describe.skipIf(!hayCanonico)('contrato contra el canónico real', () => {
  it('encuentra «Segunda Juvenil 2017, Burgos»: el grupo 30665 de Castilla y León', async () => {
    const estadoReal = leeFiltrosSelector(parametros({ q: 'Segunda Juvenil 2017, Burgos' }), ['2016-17', '2017-18']);
    expect(estadoReal.filtros.temporada).toBe('2016-17');
    const filas = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
      null, estadoReal.filtros.temporada, null, null, null, null, null, estadoReal.interpretacion.tokens, 30, 0,
    ]);
    expect(filas).toHaveLength(1);
    const fila = filas[0]!;
    expect(Number(fila.grupo_id)).toBe(30665);
    expect(fila.federacion).toBe('castilla-leon');
    expect(fila.temporada).toBe('2016-17');
    expect(fila.edicion).toBe('2ª División Provincial de Juveniles');
    expect(fila.grupo).toBe('Primera - Burgos');
    expect(Number(fila.nivel)).toBe(6);
    expect(Number(fila.partidos_con_resultado)).toBeGreaterThanOrEqual(100);
    expect(Number(fila.total)).toBe(1);
  });

  it('el filtro de provincia también reconoce la provincia escrita en el nombre del grupo', async () => {
    const filas = await consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql, [
      'castilla-leon', '2016-17', null, null, null, 'Burgos', null, ['2', 'juvenil'], 30, 0,
    ]);
    expect(filas.map((f) => Number(f.grupo_id))).toEqual([30665]);
  });

  it('las opciones traen federaciones, temporadas y niveles reales', async () => {
    const filas = await consulta<FilaOpcionSelector>(OPCIONES_DEL_SELECTOR.sql, []);
    const o = opcionesDeSelector(filas);
    expect(o.federaciones.map((f) => f.valor)).toContain('castilla-leon');
    expect(o.temporadas.map((t) => t.valor)).toContain('2016-17');
    expect(o.niveles.map((n) => n.valor)).toContain('6');
    expect(o.provincias.map((p) => p.valor)).toContain('Burgos');
    expect(o.provincias.every((p) => p.valor.trim() !== '')).toBe(true);
  });
});
