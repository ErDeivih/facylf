/**
 * Comparador de jugadores y ficha de federación: reglas puras, contrato de las consultas y render.
 *
 * Datos reales de Castilla y León:
 *  · jugador **19057** (ROYUELA DE ROZAS, JOAQUIN) y **19054** (LABUNSKIY, MAKSYM), con trayectoria en
 *    los grupos 797 y 3769;
 *  · federación **castilla-leon**, con perfil medido, escudo guardado y competiciones de 2026-27.
 *
 * Lo que se defiende: desconocido ≠ 0 (una métrica sin dato dice «sin datos» y no se compara contra un
 * cero), el nombre no une a dos personas (si hay varios candidatos no se elige solo), la cobertura solo
 * se afirma con cifras medidas, y un código de federación desconocido es un 404 de verdad.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import type { FilaTemporadaDePersona } from '../src/consultas/entidades';
import type { FilaFichaFederacion } from '../src/consultas/federaciones';
import {
  CONSULTAS_COMPARAR, PARAMETROS_COMPARAR, PERSONAS_POR_IDS, TRAYECTORIAS_DE_PERSONAS,
} from '../src/consultas/comparar';
import {
  CONSULTAS_FEDERACION_FICHA, EDICIONES_DE_LA_FEDERACION, FEDERACION_POR_CODIGO, PARAMETROS_FEDERACION_FICHA,
  type FilaEdicionDeFederacion,
} from '../src/consultas/federacion-ficha';
import { FICHA_FEDERACION } from '../src/consultas/federaciones';
import {
  abreviarCategoria, celdaDeTemporada, ladoDestacado, metricasComparadas, porcentajeMinutosDeCarrera,
  temporadasComparadas, textoDeSeleccion, type LadoComparado,
} from '../src/lib/comparar';
import {
  avisosDeCobertura, coberturaDeEdicion, codigoDeFederacion, etiquetasDeEdicion, federacionesComparables,
  medidasDeCobertura, nivelDeEdicion, numeroDePorcentaje, porcentajeDe, tituloDeFederacion,
} from '../src/lib/federacion-ficha';
import { FichasDeJugadores, MetricasComparadas, TrayectoriasComparadas } from '../src/componentes/comparar/Comparar';
import {
  AvisosDeLaFederacion, CabeceraFederacion, ComparativaDeFederaciones, CompeticionesDeLaFederacion, QueDatosPublica,
} from '../src/componentes/federacion/Federacion';
import PaginaComparar from '../src/app/explorar/comparar/page';
import PaginaFederacion from '../src/app/explorar/federacion/[codigo]/page';

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

const render = (elemento: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(elemento);

const TEXTO_PROHIBIDO = /can[óo]nico|\bsql\b|endpoint|parser|consulta interna|tabla de hechos|servidor|\bcach[ée]\b/i;

const filaTemporada = (extra: Partial<FilaTemporadaDePersona>): FilaTemporadaDePersona => ({
  temporada: '2025-26', temporada_orden: 3, equipo_id: 1, club_id: 1, club: 'Club', nombre_en_fuente: 'Equipo',
  edicion: 'Liga', edicion_categoria: 'juvenil', edicion_ambito: 'nacional', grupo: 'Grupo 1',
  federacion: 'castilla-leon', federacion_nombre: 'Castilla y León', partidos_con_aparicion: 10,
  convocatorias: 10, partidos_demostrados: 10, titularidades: 8, suplencias: 2, minutos_exactos: 900,
  minutos_estimados: 900, minutos_fiables: true, goles: 5, goles_penalti: 0, propias_puerta: 0,
  amarillas: 1, rojas: 0, partidos_elegibles: 10, partidos_cubiertos: 10, total: 2,
  ...extra,
});

const FICHA_CYL: FilaFichaFederacion = {
  codigo: 'castilla-leon', nombre_corto: 'Castilla y León', comunidad: 'Castilla y León',
  federacion_madre: null, plataforma: 'fenix', codigo_jugador: true, varios_arbitros: false,
  posiciones_desde: null, sistema_juego: false, capitan: false, medido_en: '2026-10-22',
  temporada: '2026-27', ediciones: 55, partidos: 4100,
  pct_resultado: 94.1, pct_alineacion: 100.0, pct_cambios: 54.3, pct_tarjetas: 51.4,
  pct_minuto_gol: 100.0, pct_posicion: 0.0,
  ediciones_completas: 28, ediciones_alineaciones: 24, ediciones_solo_resultados: 3,
};

const EDICION_CYL: FilaEdicionDeFederacion = {
  edicion_id: 1, edicion: '1ª División Provincial de Juveniles', categoria: 'juvenil', ambito: 'provincial',
  genero: 'masculina', modalidad: 'futbol11', temporada: '2026-27', grupos: 2, primer_grupo_id: 75250,
  partidos: 175, con_resultado: 159, con_acta: 170, lados_con_cambios: 90, partidos_con_tarjetas: 120,
  goles: 500, goles_con_minuto: 480, con_arbitro: 160, con_posicion: 0, personas: 400, personas_con_codigo: 380,
  nivel: 'completo',
};

const LADO_A: LadoComparado = {
  persona: { persona_id: 1, nombre_mostrado: 'JUGADOR A', identidad_nominal: false, es_menor: false, codigos: '111', decisiones_identidad: 0, total: 2 },
  trayectoria: [filaTemporada({ temporada: '2025-26', temporada_orden: 3, equipo_id: 10, titularidades: 8, minutos_exactos: 900, goles: 5 })],
  totales: {
    temporadas: 1, equipos: 1, partidos: 10, goles: 5, minutos: 900, minutosFiables: true,
    convocatorias: 10, titularidades: 8, suplencias: 2, amarillas: 1, rojas: 0,
  },
  porcentajeMinutos: 100,
  contexto: { equipoActual: { equipo_id: 10, nombre: 'Equipo', edicion: 'Liga', temporada: '2025-26' }, federaciones: ['Castilla y León'], temporadas: 1 },
};

const LADO_B: LadoComparado = {
  persona: { persona_id: 2, nombre_mostrado: 'JUGADOR B', identidad_nominal: true, es_menor: false, codigos: null, decisiones_identidad: 0, total: 2 },
  trayectoria: [filaTemporada({ temporada: '2025-26', temporada_orden: 3, equipo_id: 20, titularidades: 5, minutos_exactos: null, minutos_fiables: false, goles: null })],
  totales: {
    temporadas: 1, equipos: 1, partidos: 10, goles: null, minutos: null, minutosFiables: false,
    convocatorias: 10, titularidades: 5, suplencias: 2, amarillas: null, rojas: 0,
  },
  porcentajeMinutos: null,
  contexto: { equipoActual: { equipo_id: 20, nombre: 'Otro equipo', edicion: 'Liga', temporada: '2025-26' }, federaciones: ['Castilla y León'], temporadas: 1 },
};

describe('las cuentas del comparador', () => {
  it('el porcentaje de minutos sólo se calcula si todas las temporadas tienen minutos exactos', () => {
    expect(porcentajeMinutosDeCarrera([filaTemporada({ minutos_exactos: 900, partidos_elegibles: 10 })])).toBe(100);
    expect(porcentajeMinutosDeCarrera([filaTemporada({ minutos_exactos: null, minutos_fiables: false })])).toBeNull();
    expect(porcentajeMinutosDeCarrera([filaTemporada({ partidos_elegibles: null })])).toBeNull();
  });

  it('las métricas comparadas llevan «sin datos» donde falta el dato y no un cero', () => {
    const metricas = metricasComparadas(LADO_A, LADO_B);
    const minutos = metricas.find((m) => m.clave === 'minutos')!;
    expect(minutos.a).toBe(900);
    expect(minutos.b).toBeNull();
    const goles = metricas.find((m) => m.clave === 'goles')!;
    expect(goles.b).toBeNull();
    // El lado con dato gana la comparación; el que no lo tiene no se compara contra un cero.
    expect(ladoDestacado(minutos)).toBeNull();
    expect(ladoDestacado({ ...goles, b: 3 })).toBe('a');
    const minutosPorGol = metricas.find((m) => m.clave === 'minutos-por-gol')!;
    expect(minutosPorGol.a).toBe(180);
    expect(minutosPorGol.b).toBeNull();
  });

  it('las temporadas comparadas son la unión de las dos trayectorias, de la más reciente a la más antigua', () => {
    const a = [filaTemporada({ temporada: '2025-26', temporada_orden: 3 }), filaTemporada({ temporada: '2024-25', temporada_orden: 2 })];
    const b = [filaTemporada({ temporada: '2026-27', temporada_orden: 4 }), filaTemporada({ temporada: '2025-26', temporada_orden: 3 })];
    expect(temporadasComparadas(a, b).map((t) => t.temporada)).toEqual(['2026-27', '2025-26', '2024-25']);
    expect(temporadasComparadas(a, b, 2)).toHaveLength(2);
  });

  it('la casilla de una temporada elige el equipo con más partidos y avisa de que hay otro', () => {
    const filas = [
      filaTemporada({ equipo_id: 1, partidos_con_aparicion: 3, nombre_en_fuente: 'Filial', club: 'Club A' }),
      filaTemporada({ equipo_id: 2, partidos_con_aparicion: 20, nombre_en_fuente: 'Primer equipo', club: 'Club A' }),
    ];
    const celda = celdaDeTemporada(filas, '2025-26')!;
    expect(celda.equipoId).toBe(2);
    expect(celda.detalle).toContain('(+1 equipo)');
    expect(celdaDeTemporada(filas, '2024-25')).toBeNull();
  });

  it('las categorías se abrevian para una casilla estrecha y lo desconocido no se disfraza', () => {
    expect(abreviarCategoria('juvenil')).toBe('Juv.');
    expect(abreviarCategoria('aficionados')).toBe('Afi.');
    expect(abreviarCategoria('nueva-categoria')).toBe('nue.');
    expect(abreviarCategoria(null)).toBe('—');
  });

  it('el texto de selección se recorta y no se inventa cuando está vacío', () => {
    expect(textoDeSeleccion('  royuela  ')).toBe('royuela');
    expect(textoDeSeleccion('')).toBeNull();
    expect(textoDeSeleccion(undefined)).toBeNull();
    expect(textoDeSeleccion('x'.repeat(200))).toHaveLength(80);
  });
});

describe('las reglas de la ficha de federación', () => {
  it('el código de federación sólo admite minúsculas, dígitos y guiones', () => {
    expect(codigoDeFederacion('castilla-leon')).toBe('castilla-leon');
    expect(codigoDeFederacion('CYL')).toBe('cyl');
    expect(codigoDeFederacion('no existe')).toBeNull();
    expect(codigoDeFederacion('../../etc')).toBeNull();
  });

  it('los porcentajes de PostgreSQL (texto) se convierten sin inventar un 0', () => {
    expect(numeroDePorcentaje('94.1')).toBe(94.1);
    expect(numeroDePorcentaje(null)).toBeNull();
    expect(numeroDePorcentaje('no-numero')).toBeNull();
    expect(porcentajeDe(159, 175)).toBe(91);
    expect(porcentajeDe(null, 175)).toBeNull();
    expect(porcentajeDe(1, 0)).toBeNull();
  });

  it('«qué datos publica» sale de lo medido y no de una plantilla', () => {
    const medidas = medidasDeCobertura(FICHA_CYL);
    expect(medidas.find((m) => m.clave === 'resultado')!.porcentaje).toBe(94.1);
    expect(medidas.find((m) => m.clave === 'cambios')!.porcentaje).toBe(54.3);
    expect(medidas.every((m) => m.porcentaje === null || typeof m.porcentaje === 'number')).toBe(true);
    expect(medidasDeCobertura(null).every((m) => m.porcentaje === null)).toBe(true);
  });

  it('los avisos llevan la cifra medida y no prometen minutos donde no hay cambios', () => {
    const avisos = avisosDeCobertura(FICHA_CYL);
    expect(avisos.some((a) => a.texto.includes('94.1'))).toBe(true);
    expect(avisos.some((a) => a.texto.includes('54.3') && /minutos/i.test(a.texto))).toBe(true);
    expect(avisosDeCobertura(null)[0]!.texto).toMatch(/no se enseñan porcentajes/i);
  });

  it('las federaciones comparables excluyen la actual, las de prueba y las que no se publican', () => {
    const otras = federacionesComparables([
      FICHA_CYL,
      { ...FICHA_CYL, codigo: 'pruebas', nombre_corto: 'Pruebas' },
      { ...FICHA_CYL, codigo: 'galicia', nombre_corto: 'Galicia', pct_resultado: 88.0 },
      { ...FICHA_CYL, codigo: 'sin-datos', nombre_corto: 'Sin datos', partidos: null, pct_resultado: null },
    ], 'castilla-leon');
    const codigos = otras.map((f) => f.codigo);
    // Fase C: la publicación es sólo Castilla y León (ver `lib/federaciones-excluidas.ts`), así que una
    // federación con datos como Galicia tampoco se ofrece para comparar.
    expect(codigos).toEqual([]);
    expect(codigos).not.toContain('galicia');
    expect(codigos).not.toContain('castilla-leon');
    expect(codigos).not.toContain('pruebas');
    expect(codigos).not.toContain('sin-datos');
  });

  it('el nivel de una edición se traduce con su tono y lo desconocido no se disfraza', () => {
    expect(nivelDeEdicion('completo')).toEqual({ etiqueta: 'Completo', tono: 'completo' });
    expect(nivelDeEdicion('alineaciones')!.etiqueta).toBe('Con alineaciones');
    expect(nivelDeEdicion('raro')).toEqual({ etiqueta: 'raro', tono: 'calendario' });
    expect(nivelDeEdicion(null)).toBeNull();
  });

  it('la cobertura de una competición se calcula de sus recuentos medidos', () => {
    const cobertura = coberturaDeEdicion(EDICION_CYL);
    expect(cobertura.resultado).toBe(91);
    expect(cobertura.cambios).toBe(51);
    expect(cobertura.tarjetas).toBe(69);
    expect(cobertura.minutoGol).toBe(96);
    expect(cobertura.posicion).toBe(0);
  });

  it('la etiqueta de la competición no repite lo que no aporta', () => {
    expect(etiquetasDeEdicion(EDICION_CYL)).toBe('Juvenil · Provincial');
  });

  it('el título de la pestaña nombra la federación', () => {
    expect(tituloDeFederacion('Castilla y León')).toBe('Castilla y León — Fondo Popular');
  });
});

describe('contrato estático de las consultas nuevas', () => {
  it('todas llevan LIMIT y parámetros, y declaran columnas y presupuesto', () => {
    for (const consultaNueva of [...CONSULTAS_COMPARAR, ...CONSULTAS_FEDERACION_FICHA]) {
      expect(consultaNueva.sql.toLowerCase(), `${consultaNueva.nombre} sin LIMIT`).toContain('limit');
      expect(consultaNueva.sql, `${consultaNueva.nombre} interpola`).not.toContain('${');
      expect(consultaNueva.columnas.length).toBeGreaterThan(0);
      expect(consultaNueva.presupuestoMs).toBeGreaterThan(0);
      expect([...(PARAMETROS_COMPARAR[consultaNueva.nombre] ?? []), ...(PARAMETROS_FEDERACION_FICHA[consultaNueva.nombre] ?? [])].length)
        .toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hayCanonico)('contrato contra el canónico real', () => {
  it('las dos personas y sus trayectorias llegan en dos consultas, sin N+1', async () => {
    const personas = await consulta<Record<string, unknown>>(PERSONAS_POR_IDS.sql, [[19057, 19054]]);
    expect(personas).toHaveLength(2);
    expect(new Set(personas.map((p) => Number(p.persona_id)))).toEqual(new Set([19057, 19054]));
    for (const persona of personas) {
      expect(Object.keys(persona).sort()).toEqual([...PERSONAS_POR_IDS.columnas].sort());
      expect(String(persona.nombre_mostrado).length).toBeGreaterThan(0);
    }
    const trayectorias = await consulta<Record<string, unknown>>(TRAYECTORIAS_DE_PERSONAS.sql, [[19057, 19054], 200]);
    expect(trayectorias.length).toBeGreaterThan(2);
    for (const fila of trayectorias) {
      expect(Object.keys(fila).sort()).toEqual([...TRAYECTORIAS_DE_PERSONAS.columnas].sort());
      expect([19057, 19054]).toContain(Number(fila.persona_id));
      expect(String(fila.federacion_nombre).length).toBeGreaterThan(0);
    }
    for (const id of [19057, 19054]) {
      expect(trayectorias.some((fila) => Number(fila.persona_id) === id)).toBe(true);
    }
  });

  it('la federación de CyL existe con escudo y la desconocida no devuelve fila', async () => {
    const [cyl] = await consulta<Record<string, unknown>>(FEDERACION_POR_CODIGO.sql, ['castilla-leon']);
    expect(cyl).toBeDefined();
    expect(Object.keys(cyl!).sort()).toEqual([...FEDERACION_POR_CODIGO.columnas].sort());
    expect(String(cyl!.nombre)).toMatch(/Castilla y León/);
    expect(cyl!.tiene_escudo).toBe(true);
    const sinFederacion = await consulta(FEDERACION_POR_CODIGO.sql, ['no-existe-999']);
    expect(sinFederacion).toHaveLength(0);
  });

  it('las competiciones de la temporada medida llegan con cobertura y enlace a su primer grupo', async () => {
    const filas = await consulta<FilaEdicionDeFederacion>(EDICIONES_DE_LA_FEDERACION.sql, ['castilla-leon', null, 80]);
    expect(filas.length).toBeGreaterThan(10);
    expect(new Set(filas.map((fila) => fila.temporada))).toEqual(new Set(['2026-27']));
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...EDICIONES_DE_LA_FEDERACION.columnas].sort());
      expect(fila.grupos).toBeGreaterThan(0);
      expect(fila.primer_grupo_id).not.toBeNull();
      if (fila.partidos !== null) expect(fila.partidos).toBeGreaterThanOrEqual(0);
    }
    // La temporada 2025-26 también se puede pedir explícitamente.
    const anteriores = await consulta<FilaEdicionDeFederacion>(EDICIONES_DE_LA_FEDERACION.sql, ['castilla-leon', '2025-26', 80]);
    expect(anteriores.length).toBeGreaterThan(0);
    expect(new Set(anteriores.map((fila) => fila.temporada))).toEqual(new Set(['2025-26']));
  });

  it('la ficha medida de CyL tiene cifras y no ceros de relleno', async () => {
    const filas = await consulta<FilaFichaFederacion>(FICHA_FEDERACION.sql, [null]);
    const cyl = filas.find((fila) => fila.codigo === 'castilla-leon');
    expect(cyl).toBeDefined();
    expect(Number(cyl!.pct_resultado)).toBeGreaterThan(0);
    expect(Number(cyl!.pct_alineacion)).toBeGreaterThan(0);
    expect(Number(cyl!.partidos)).toBeGreaterThan(0);
  });
});

describe('el render del comparador y de la federación', () => {
  it('las dos fichas comparadas publican el nombre, el contexto y avisan de la identidad nominal', () => {
    const html = render(createElement(FichasDeJugadores, { a: LADO_A, b: LADO_B }));
    expect(html).toContain('JUGADOR A');
    expect(html).toContain('JUGADOR B');
    expect(html).toContain('/explorar/jugador/1');
    expect(html).toContain('/explorar/jugador/1/historial');
    expect(html).toContain('Identidad nominal');
    expect(html).not.toContain('<img');
  });

  it('las métricas comparadas dicen «sin datos» en el lado que no tiene dato', () => {
    const html = render(createElement(MetricasComparadas, { a: LADO_A, b: LADO_B, metricas: metricasComparadas(LADO_A, LADO_B) }));
    expect(html).toContain('sin datos');
    expect(html).toContain('Minutos por gol');
    expect(html).toContain('Titularidades');
    // Las barras no convierten el hueco en una barra llena.
    expect(html).toContain('aria-hidden="true"');
  });

  it('la rejilla de trayectorias lleva su tabla equivalente accesible', () => {
    const html = render(createElement(TrayectoriasComparadas, {
      temporadas: temporadasComparadas(LADO_A.trayectoria, LADO_B.trayectoria),
      a: LADO_A,
      b: LADO_B,
    }));
    expect(html).toContain('Ver la trayectoria en tabla');
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
  });

  it('la federación renderiza medidas, avisos, competiciones y comparativa', () => {
    const medidas = medidasDeCobertura(FICHA_CYL);
    expect(render(createElement(QueDatosPublica, { medidas }))).toContain('94.1 %');
    const avisos = render(createElement(AvisosDeLaFederacion, { avisos: avisosDeCobertura(FICHA_CYL) }));
    expect(avisos).toContain('Límite');
    expect(avisos).toContain('54.3');
    const competiciones = render(createElement(CompeticionesDeLaFederacion, { ediciones: [EDICION_CYL], federacion: 'castilla-leon' }));
    expect(competiciones).toContain('/explorar/competicion/75250');
    expect(competiciones).toContain('Completo');
    const comparativa = render(createElement(ComparativaDeFederaciones, {
      fichas: [{ ...FICHA_CYL, codigo: 'laspalmas', nombre_corto: 'Las Palmas', partidos: null, pct_resultado: null, pct_alineacion: null, pct_cambios: null, pct_tarjetas: null }],
      actual: 'castilla-leon',
    }));
    expect(comparativa).toContain('Sin medir');
    const cabecera = render(createElement(CabeceraFederacion, {
      federacion: { federacion_id: 7, codigo: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', portal_url: 'https://www.rfcylf.es/pnfg/', activa: true, adaptador: 'pnfg', tiene_escudo: true },
      ficha: FICHA_CYL,
    }));
    expect(cabecera).toContain('Real Federación de Castilla y León de Fútbol');
    expect(cabecera).toContain('/api/escudo/federacion/castilla-leon');
    expect(cabecera).toContain('Web oficial');
  });
});

describe.skipIf(!hayCanonico)('las dos páginas', () => {
  it('el comparador con dos ids reales se pinta con sus trayectorias y sin textos internos', async () => {
    const html = render(await PaginaComparar({ searchParams: Promise.resolve({ a: '19057', b: '19054' }) }));
    expect(html).toContain('ROYUELA DE ROZAS, JOAQUIN');
    expect(html).toContain('LABUNSKIY, MAKSYM');
    expect(html).toContain('Trayectorias');
    expect(html).toContain('Carrera completa');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it('con un nombre ambiguo no se elige solo: se enseñan candidatos', async () => {
    const html = render(await PaginaComparar({ searchParams: Promise.resolve({ a: 'royuela de rozas', b: '19054' }) }));
    expect(html).toContain('Elige al jugador A');
    expect(html).toContain('No se elige solo');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it('sin parámetros el comparador pide dos jugadores y no inventa una comparación', async () => {
    const html = render(await PaginaComparar({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Elige dos jugadores');
    expect(html).not.toContain('Carrera completa');
  });

  it('un id inexistente en el comparador se dice, no se convierte en una comparación vacía', async () => {
    const html = render(await PaginaComparar({ searchParams: Promise.resolve({ a: '999999998', b: '19054' }) }));
    expect(html).toContain('No se encuentran los dos jugadores');
  });

  it('la federación de CyL se pinta con su perfil y sus competiciones, sin textos internos', async () => {
    const html = render(await PaginaFederacion({ params: Promise.resolve({ codigo: 'castilla-leon' }) }));
    expect(html).toContain('Real Federación de Castilla y León de Fútbol');
    expect(html).toContain('Qué datos publica');
    expect(html).toContain('Competiciones');
    expect(html).toContain('Castilla y León');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it('un código de federación inexistente o inválido es un 404 de verdad', async () => {
    for (const codigo of ['no-existe-999', 'NO VALE']) {
      await expect(PaginaFederacion({ params: Promise.resolve({ codigo }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
  });
});
