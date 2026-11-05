import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CONSULTAS_ESTADISTICAS, EVENTOS_DEL_GRUPO, GOLEADORES_DE_ESTADISTICAS, OPCIONES_DE_ESTADISTICAS,
  PARAMETROS_ESTADISTICAS, RESUMEN_DE_ESTADISTICAS,
  type EventosDelGrupo, type FilaGoleadorEstadisticas, type ResumenEstadisticas,
} from '../src/consultas/estadisticas';
import type { FilaPartidoCanonico } from '../src/consultas/partidos';
import { Cifras } from '../src/componentes/estadisticas/Cifras';
import { EsqueletoEstadisticas, SinDatos } from '../src/componentes/estadisticas/Estados';
import { BarraReparto, GraficoBarras, GraficoLineas } from '../src/componentes/estadisticas/Graficos';
import {
  ListaGoleadores, TablaCasaFuera, TablaDisciplina, TablaForma,
} from '../src/componentes/estadisticas/Tablas';
import {
  agregaResumenDePartidos, avisoDeFiltroInexistente, casaFueraPorEquipo, conclusionDeGoleadores, conclusionDeMes, etiquetaDeMes, etiquetaDeMesCorta,
  conclusionDePuntos, conclusionDeResultados, conclusionDeTramos, decimal, etiquetaDeTramo, golesPorMesOrdenados,
  golesPorPartido,
  goleadoresConAcumulado, idDeGrupoDeUrl, leeFiltrosEstadisticas, nombrePublicado, numero, porcentaje,
  puntosPorJornada, repartoDeResultados, rutaDeEstadisticas, temporadaPorDefecto, temporadasParaCabecera,
  tieneFiltrosEstadisticas, tituloDeEstadisticasGrupo, TITULO_ESTADISTICAS, tokensDeBusqueda, totalDeTarjetas,
  tramosCompletos, ultimosResultados, urlDeEstadisticas,
} from '../src/lib/estadisticas';

/**
 * Contrato de las páginas de estadísticas (WALL objetivo 5).
 *
 * Referencias reales: grupo 3769 (Liga Nacional Juvenil 2026-27, 32 partidos y 135 goles con minuto) y
 * grupo 30665 (histórico 2016-17: 157 partidos, 615 goles y NINGUNA tarjeta publicada).
 *
 * Lo que se defiende:
 *  · ningún partido sin resultado se convierte en 0-0 ni suma puntos;
 *  · un porcentaje sin denominador es «—», no 0;
 *  · lo que no está publicado (tarjetas del 30665) se dice, no se rellena;
 *  · los gráficos tienen resumen en texto y tabla equivalente;
 *  · la interfaz no explica cómo se calcula nada (§8).
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

const TEXTO_PROHIBIDO: readonly RegExp[] = [
  /canónico/i, /según la base/i, /según el prototipo/i, /prototipo/i, /se calcula/i, /calculad[oa]/i,
  /cálculo/i, /SQL/i, /backend/i, /endpoint/i, /consulta sql/i, /<code/i,
];

function sinTextoProhibido(html: string) {
  for (const prohibido of TEXTO_PROHIBIDO) {
    expect(html, `la interfaz no debe contener «${prohibido}»`).not.toMatch(prohibido);
  }
}

afterAll(async () => {
  await cierraCanonico();
});

/* ── Fixtures ────────────────────────────────────────────────────────────────────────────────────── */

function partido(extra: Partial<FilaPartidoCanonico> & { match_id: number; jornada: number }): FilaPartidoCanonico {
  return {
    orden: extra.match_id, fecha: '2026-09-12', hora: null, local_id: 1, visitante_id: 2,
    local: 'U.D. Valdecastro', visitante: 'C.D. Ribera del Tormes', goles_local: null, goles_visitante: null,
    campo: null, arbitro: null, calidad_acta: null, estado: null, ...extra,
  };
}

/** J1 jugada (local gana), J2 jugada (empate), J3 sin resultado, J4 jugada (visitante gana). */
const PARTIDOS: FilaPartidoCanonico[] = [
  partido({ match_id: 1, jornada: 1, goles_local: 2, goles_visitante: 0, calidad_acta: 'correct' }),
  partido({
    match_id: 2, jornada: 2, local_id: 2, visitante_id: 1,
    local: 'C.D. Ribera del Tormes', visitante: 'U.D. Valdecastro',
    goles_local: 1, goles_visitante: 1, calidad_acta: 'review',
  }),
  partido({ match_id: 3, jornada: 3 }),
  partido({
    match_id: 4, jornada: 4, local_id: 2, visitante_id: 1,
    local: 'C.D. Ribera del Tormes', visitante: 'U.D. Valdecastro',
    goles_local: 3, goles_visitante: 0, calidad_acta: 'correct',
  }),
];

const RESUMEN: ResumenEstadisticas['resumen'] = {
  partidos: 4, con_resultado: 3, goles: 7, local: 2, empate: 1, visitante: 0, con_cero: 2,
  actas: 3, actas_correctas: 2,
};

const GOLEADORES: FilaGoleadorEstadisticas[] = [
  { persona_id: 1, nombre: 'MARTÍN EZQUERRA, PABLO', es_menor: false, goles: 5, goles_penalti: 1, partidos: 4, equipo: 'U.D. Valdecastro', club_id: 7, tiene_escudo: true },
  { persona_id: 2, nombre: 'ADRIÁN GONZALVO', es_menor: false, goles: 3, goles_penalti: 0, partidos: 4, equipo: 'C.D. Ribera del Tormes', club_id: 8, tiene_escudo: false },
  { persona_id: 3, nombre: null, es_menor: false, goles: 1, goles_penalti: 0, partidos: 2, equipo: 'C.D. Ribera del Tormes', club_id: 8, tiene_escudo: false },
];

/* ── Contrato estático ──────────────────────────────────────────────────────────────────────────── */

describe('contrato estático de las consultas de estadísticas', () => {
  it('todas llevan LIMIT y ningún valor interpolado', () => {
    for (const c of CONSULTAS_ESTADISTICAS) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
      expect(c.sql, `${c.nombre} interpola una plantilla`).not.toContain('${');
    }
  });

  it('cada consulta declara nombre, descripción, presupuesto, plan y columnas', () => {
    for (const c of CONSULTAS_ESTADISTICAS) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(['indexado', 'agregado']).toContain(c.plan);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_ESTADISTICAS[c.nombre], `${c.nombre} sin parámetros de ejemplo`).toBeDefined();
    }
  });

  it('el resumen y los goleadores prometen lo que la página pinta', () => {
    expect(RESUMEN_DE_ESTADISTICAS.columnas).toEqual(['datos']);
    expect(EVENTOS_DEL_GRUPO.columnas).toEqual(['datos']);
    expect(GOLEADORES_DE_ESTADISTICAS.columnas).toContain('persona_id');
    expect(GOLEADORES_DE_ESTADISTICAS.columnas).toContain('goles');
    expect(GOLEADORES_DE_ESTADISTICAS.columnas).toContain('equipo');
    expect(OPCIONES_DE_ESTADISTICAS.columnas).toEqual(['federaciones', 'temporadas']);
  });
});

/* ── Filtros ────────────────────────────────────────────────────────────────────────────────────── */

describe('los filtros de la página de estadísticas', () => {
  it('lee valores válidos y descarta los que no lo son', () => {
    expect(leeFiltrosEstadisticas({ fed: 'castilla-leon', temp: '2026-27', q: '  Liga Nacional  ' }))
      .toEqual({ federacion: 'castilla-leon', temporada: '2026-27', texto: 'Liga Nacional' });
    expect(leeFiltrosEstadisticas({ fed: 'DROP TABLE', temp: '2026', q: '   ' }))
      .toEqual({ federacion: null, temporada: null, texto: null });
  });

  it('las URLs no escriben los valores por defecto y conservan el resto', () => {
    expect(urlDeEstadisticas({ federacion: null, temporada: null, texto: null })).toBe('/explorar/estadisticas');
    const u = new URL(urlDeEstadisticas({ federacion: 'castilla-leon', temporada: '2026-27', texto: 'Burgos' }), 'http://local');
    expect(u.pathname).toBe('/explorar/estadisticas');
    expect(u.searchParams.get('fed')).toBe('castilla-leon');
    expect(u.searchParams.get('temp')).toBe('2026-27');
    expect(u.searchParams.get('q')).toBe('Burgos');
    expect(tieneFiltrosEstadisticas({ federacion: null, temporada: null, texto: 'x' })).toBe(true);
    expect(tieneFiltrosEstadisticas({ federacion: null, temporada: null, texto: null })).toBe(false);
  });

  it('un filtro que no existe en el catálogo se dice, no se sustituye en silencio', () => {
    const federaciones = ['castilla-leon', 'madrid'];
    const temporadas = ['2026-27', '2025-26'];
    expect(avisoDeFiltroInexistente({ federacion: null, temporada: null, texto: null }, federaciones, temporadas)).toBeNull();
    expect(avisoDeFiltroInexistente({ federacion: 'narnia', temporada: null, texto: null }, federaciones, temporadas))
      .toBe('La federación «narnia» no está en el catálogo.');
    expect(avisoDeFiltroInexistente({ federacion: null, temporada: '1900-01', texto: null }, federaciones, temporadas))
      .toBe('La temporada «1900-01» no está publicada.');
  });

  it('la búsqueda se parte en palabras sin tildes y sin vacías', () => {
    expect(tokensDeBusqueda('Segunda Juvenil de Burgos')).toEqual(['segunda', 'juvenil', 'burgos']);
    expect(tokensDeBusqueda('Ávila 2017')).toEqual(['avila', '2017']);
    expect(tokensDeBusqueda(null)).toEqual([]);
    expect(tokensDeBusqueda('a b c d e f g h i j k').length).toBeLessThanOrEqual(8);
  });

  it('la temporada por defecto es la más reciente publicada', () => {
    expect(temporadaPorDefecto(['2026-27', '2025-26'], null)).toBe('2026-27');
    expect(temporadaPorDefecto(['2026-27', '2025-26'], '2025-26')).toBe('2025-26');
    expect(temporadaPorDefecto(['2026-27'], '2016-17')).toBe('2026-27');
    expect(temporadaPorDefecto([], null)).toBeNull();
  });

  it('la cabecera conserva la temporada de una competición histórica', () => {
    const temporadas = [
      { temporada: '2026-27' }, { temporada: '2025-26' }, { temporada: '2016-17' },
    ];
    const publicable = (t: string) => t >= '2023-24';
    expect(temporadasParaCabecera(temporadas, '2016-17', publicable).map((t) => t.temporada))
      .toEqual(['2016-17', '2026-27', '2025-26']);
    expect(temporadasParaCabecera(temporadas, '2026-27', publicable).map((t) => t.temporada))
      .toEqual(['2026-27', '2025-26']);
  });

  it('un id de grupo sólo vale si es un entero positivo', () => {
    expect(idDeGrupoDeUrl('3769')).toBe(3769);
    for (const crudo of ['0', '-1', '4.5', 'abc', undefined]) expect(idDeGrupoDeUrl(crudo)).toBeNull();
  });

  it('las rutas y títulos de la pantalla', () => {
    expect(rutaDeEstadisticas(3769)).toBe('/explorar/competicion/3769/estadisticas');
    expect(TITULO_ESTADISTICAS).toBe('Estadísticas — Balompié');
    expect(tituloDeEstadisticasGrupo({ edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III' }))
      .toBe('Estadísticas · Liga Nacional Juvenil · Primera - III — Balompié');
  });
});

/* ── Cuentas puras ─────────────────────────────────────────────────────────────────────────────── */

describe('las cuentas de los partidos', () => {
  it('un partido sin resultado no cuenta como jugado ni como 0-0', () => {
    const resumen = agregaResumenDePartidos(PARTIDOS);
    expect(resumen).toMatchObject({
      partidos: 4, con_resultado: 3, goles: 7, local: 2, empate: 1, visitante: 0, con_cero: 2,
      actas: 3, actas_correctas: 2,
    });
    expect(golesPorPartido(resumen)).toBe(2.33);
  });

  it('los puntos por jornada se acumulan y no inventan jornadas sin partidos', () => {
    const { jornadas, equipos } = puntosPorJornada(PARTIDOS);
    expect(jornadas).toEqual([1, 2, 4]);
    const local = equipos.find((equipo) => equipo.id === 1)!;
    // J1 gana (3), J2 empata (1), J3 sin resultado no suma, J4 pierde (0).
    expect(local.puntos).toEqual([3, 4, 4]);
    expect(local.total).toBe(4);
    const visitante = equipos.find((equipo) => equipo.id === 2)!;
    expect(visitante.puntos).toEqual([0, 1, 4]);
    expect(equipos[0]!.total).toBeGreaterThanOrEqual(equipos[equipos.length - 1]!.total);
  });

  it('casa y fuera reparten los partidos y suman el total', () => {
    const filas = casaFueraPorEquipo(PARTIDOS);
    const local = filas.find((fila) => fila.id === 1)!;
    expect(local.casa).toMatchObject({ jugados: 1, ganados: 1, puntos: 3, goles_favor: 2, goles_contra: 0 });
    expect(local.fuera).toMatchObject({ jugados: 2, empatados: 1, perdidos: 1, puntos: 1 });
    expect(local.total.jugados).toBe(3);
    expect(local.total.puntos).toBe(local.casa.puntos + local.fuera.puntos);
  });

  it('la forma son los últimos cinco con resultado, del más antiguo al más reciente', () => {
    const formas = ultimosResultados(PARTIDOS);
    expect(formas.get(1)).toEqual(['G', 'E', 'P']);
    expect(formas.get(2)).toEqual(['P', 'E', 'G']);
    expect(ultimosResultados(PARTIDOS, 2).get(1)).toEqual(['E', 'P']);
  });

  it('la forma se calcula aunque los ids lleguen como texto (bigint del driver)', () => {
    const conTexto = PARTIDOS.map((p) => ({
      ...p,
      local_id: String(p.local_id) as unknown as number,
      visitante_id: String(p.visitante_id) as unknown as number,
    }));
    expect(ultimosResultados(conTexto).get(1)).toEqual(['G', 'E', 'P']);
  });

  it('el reparto de resultados usa los partidos con marcador como denominador', () => {
    const partes = repartoDeResultados(RESUMEN);
    expect(partes.map((parte) => parte.clave)).toEqual(['local', 'empate', 'visitante']);
    expect(partes.reduce((suma, parte) => suma + parte.partidos, 0)).toBe(3);
    expect(partes.every((parte) => parte.porcentaje >= 0 && parte.porcentaje <= 100)).toBe(true);
  });
});

describe('porcentajes y textos que no se inventan', () => {
  it('sin denominador no hay porcentaje ni media', () => {
    expect(porcentaje(0, 0)).toBeNull();
    expect(golesPorPartido({ ...RESUMEN, con_resultado: 0, goles: 0 })).toBeNull();
    expect(goleadoresConAcumulado(GOLEADORES, 0).every((fila) => fila.acumulado === null)).toBe(true);
  });

  it('el acumulado de goleadores se calcula sobre los goles del ámbito', () => {
    const filas = goleadoresConAcumulado(GOLEADORES, 9);
    expect(filas.map((fila) => fila.acumulado)).toEqual([56, 89, 100]);
  });

  it('sin nombre publicado no se inventa un nombre', () => {
    expect(nombrePublicado(null)).toBe('Nombre no publicado');
    expect(nombrePublicado('  ')).toBe('Nombre no publicado');
    expect(nombrePublicado('MARTÍN EZQUERRA, PABLO')).toBe('MARTÍN EZQUERRA, PABLO');
  });

  it('los tramos son siempre seis y el «sin minuto» sólo si existe', () => {
    const seis = tramosCompletos([{ orden: 0, goles: 3 }, { orden: 6, goles: 1 }]);
    expect(seis.map((tramo) => tramo.etiqueta)).toEqual(["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'"]);
    expect(seis[0]!.goles).toBe(3);
    expect(seis[1]!.goles).toBe(0);
    expect(tramosCompletos([{ orden: 99, goles: 2 }]).at(-1)!.etiqueta).toBe('Sin minuto');
    expect(tramosCompletos([])).toHaveLength(6);
    expect(etiquetaDeTramo(6)).toBe("90+'");
  });

  it('las conclusiones dicen algo útil y honrado', () => {
    expect(conclusionDeResultados({ ...RESUMEN, con_resultado: 0 })).toBe('Sin resultados publicados');
    expect(conclusionDeResultados(RESUMEN)).toMatch(/% de los partidos/);
    expect(conclusionDeMes([{ mes: '2026-09', partidos: 2, goles: 3 }, { mes: '2026-10', partidos: 2, goles: 8 }]))
      .toBe('Octubre es el mes más goleador (8 goles)');
    expect(conclusionDeMes([])).toBe('Sin goles publicados');
    expect(etiquetaDeMes('2026-09')).toBe('Septiembre');
    expect(etiquetaDeMesCorta('2026-10')).toBe('oct');
    expect(golesPorMesOrdenados([
      { mes: '2026-10', partidos: 1, goles: 2 }, { mes: '2026-09', partidos: 1, goles: 1 },
    ]).map((mes) => mes.mes)).toEqual(['2026-09', '2026-10']);
    expect(conclusionDeTramos([{ orden: 0, goles: 0 }])).toBe('Sin goles publicados');
    expect(conclusionDeTramos([{ orden: 2, goles: 4 }, { orden: 0, goles: 1 }])).toContain("30-45'");
    expect(conclusionDePuntos([{ id: 1, nombre: 'A', puntos: [3, 6], total: 6 }], 2)).toBe('A cierra con 6 puntos en 2 jornadas');
    expect(conclusionDePuntos([], 0)).toBe('Sin puntos publicados');
    expect(conclusionDeGoleadores([], 0)).toBe('Sin goleadores publicados');
    expect(conclusionDeGoleadores(goleadoresConAcumulado(GOLEADORES, 9), 9)).toBe('Los 3 máximos goleadores firman el 100 % de los goles');
  });

  it('el formato de los números es el español', () => {
    expect(numero(27268)).toBe('27.268');
    expect(decimal(2.333)).toBe('2,33');
    expect(decimal(null)).toBe('—');
    expect(totalDeTarjetas({ equipo_id: 1, equipo: 'A', amarillas: 4, rojas: 1 })).toBe(5);
  });
});

/* ── Contrato contra el canónico ────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('el resumen de una federación contra el canónico', () => {
  it('devuelve una fila con el JSON prometido y las invariantes de los totales', async () => {
    const filas = await consulta<Record<string, unknown>>(RESUMEN_DE_ESTADISTICAS.sql,
      PARAMETROS_ESTADISTICAS['resumen-de-estadísticas']);
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0]!).sort()).toEqual([...RESUMEN_DE_ESTADISTICAS.columnas].sort());
    const datos = filas[0]!.datos as ResumenEstadisticas;
    expect(datos).not.toBeNull();
    const r = datos.resumen;
    expect(r.partidos).toBeGreaterThan(0);
    expect(r.con_resultado).toBeLessThanOrEqual(r.partidos);
    expect(r.local + r.empate + r.visitante).toBe(r.con_resultado);
    expect(r.goles).toBeGreaterThan(0);
    expect(r.actas_correctas).toBeLessThanOrEqual(r.actas);
    // Los goles por mes cuadran con el total del ámbito.
    const sumaMeses = datos.por_mes.reduce((suma, mes) => suma + mes.goles, 0);
    expect(sumaMeses).toBe(r.goles);
    // Los tramos no pueden sumar más goles que el marcador: lo que falte es un gol sin autoría/minuto.
    const sumaTramos = datos.tramos.reduce((suma, tramo) => suma + tramo.goles, 0);
    expect(sumaTramos).toBeGreaterThan(0);
    expect(sumaTramos).toBeLessThanOrEqual(r.goles);
    for (const mes of datos.por_mes) {
      expect(mes.mes).toMatch(/^\d{4}-\d{2}$/);
      expect(mes.goles).toBeGreaterThanOrEqual(0);
    }
  });

  it('las tarjetas por equipo tienen datos y están ordenadas de más a menos', async () => {
    const filas = await consulta<Record<string, unknown>>(RESUMEN_DE_ESTADISTICAS.sql, ['castilla-leon', '2026-27']);
    const datos = filas[0]!.datos as ResumenEstadisticas;
    expect(datos.tarjetas.length).toBeGreaterThan(0);
    const totales = datos.tarjetas.map(totalDeTarjetas);
    expect(totales).toEqual([...totales].sort((a, b) => b - a));
    for (const tarjeta of datos.tarjetas) {
      expect(tarjeta.equipo.length).toBeGreaterThan(0);
      expect(totalDeTarjetas(tarjeta)).toBeGreaterThan(0);
    }
  });

  it('sin partidos devuelve totales a cero y listas vacías, no datos inventados', async () => {
    const filas = await consulta<Record<string, unknown>>(RESUMEN_DE_ESTADISTICAS.sql, ['castilla-leon', '1900-01']);
    const datos = filas[0]!.datos as ResumenEstadisticas;
    expect(datos.resumen.partidos).toBe(0);
    expect(datos.resumen.goles).toBe(0);
    expect(datos.por_mes).toEqual([]);
    expect(datos.tramos).toEqual([]);
    expect(datos.tarjetas).toEqual([]);
  });

  it('los eventos del grupo 3769 traen goles por tramo y tarjetas', async () => {
    const filas = await consulta<Record<string, unknown>>(EVENTOS_DEL_GRUPO.sql, [3769]);
    const datos = filas[0]!.datos as EventosDelGrupo;
    expect(datos.tramos.length).toBeGreaterThan(0);
    expect(datos.tramos.reduce((suma, tramo) => suma + tramo.goles, 0)).toBeGreaterThan(100);
    expect(datos.tarjetas.length).toBeGreaterThan(0);
  });

  it('el grupo histórico 30665 enseña sus goles pero no inventa tarjetas', async () => {
    const filas = await consulta<Record<string, unknown>>(EVENTOS_DEL_GRUPO.sql, [30665]);
    const datos = filas[0]!.datos as EventosDelGrupo;
    expect(datos.tramos.reduce((suma, tramo) => suma + tramo.goles, 0)).toBeGreaterThan(0);
    expect(datos.tarjetas).toEqual([]);
  });

  it('los goleadores son números, están ordenados y pertenecen al ámbito', async () => {
    const filas = await consulta<Record<string, unknown>>(GOLEADORES_DE_ESTADISTICAS.sql,
      PARAMETROS_ESTADISTICAS['goleadores-de-estadísticas']);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(10);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...GOLEADORES_DE_ESTADISTICAS.columnas].sort());
      expect(typeof fila.persona_id).toBe('number');
      expect(Number(fila.goles)).toBeGreaterThan(0);
      expect(Number(fila.partidos)).toBeGreaterThanOrEqual(1);
      expect(String(fila.equipo).length).toBeGreaterThan(0);
      expect(fila.club_id === null || typeof fila.club_id === 'number').toBe(true);
    }
    const goles = filas.map((fila) => Number(fila.goles));
    expect(goles).toEqual([...goles].sort((a, b) => b - a));
  });

  it('las opciones de los filtros son las del catálogo y respetan la ventana publicada', async () => {
    const filas = await consulta<Record<string, unknown>>(OPCIONES_DE_ESTADISTICAS.sql,
      PARAMETROS_ESTADISTICAS['opciones-de-estadísticas']);
    expect(filas).toHaveLength(1);
    const federaciones = filas[0]!.federaciones as Array<{ codigo: string; nombre: string; nombre_corto: string | null }>;
    const temporadas = filas[0]!.temporadas as Array<{ etiqueta: string; orden: number }>;
    expect(federaciones.map((f) => f.codigo)).toContain('castilla-leon');
    expect(federaciones.find((f) => f.codigo === 'castilla-leon')?.nombre_corto).toBe('Castilla y León');
    expect(temporadas.map((t) => t.etiqueta)).toContain('2026-27');
    for (const temporada of temporadas) expect(temporada.etiqueta >= '2023-24').toBe(true);
  });
});

/* ── Render ────────────────────────────────────────────────────────────────────────────────────── */

describe('los gráficos se leen también sin verlos', () => {
  it('el gráfico de líneas lleva resumen en texto y tabla equivalente', () => {
    const html = renderToStaticMarkup(createElement(GraficoLineas, {
      id: 'prueba-lineas',
      titulo: 'A cierra con 6 puntos',
      subtitulo: 'Puntos acumulados por jornada',
      resumen: 'A: 3, 6 puntos',
      etiquetasX: ['1', '2'],
      series: [
        { nombre: 'A', valores: [3, 6], destacada: true },
        { nombre: 'B', valores: [0, 1] },
      ],
      leyenda: [{ etiqueta: 'A', color: 'var(--accion)' }, { etiqueta: 'Resto', color: 'var(--borde-fuerte)' }],
      tableHeaders: ['Equipo', 'J1', 'J2', 'Total'],
      tableRows: [['A', '3', '6', '6'], ['B', '0', '1', '1']],
    }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="A: 3, 6 puntos"');
    expect(html).toContain('<title>A: 3, 6 puntos</title>');
    expect(html).toContain('<details');
    expect(html).toContain('<table');
    expect(html).toContain('Ver como tabla');
    expect(html).toContain('<polyline');
    sinTextoProhibido(html);
  });

  it('el gráfico de barras deja las cifras visibles, no sólo el color', () => {
    const html = renderToStaticMarkup(createElement(GraficoBarras, {
      id: 'prueba-barras',
      titulo: "30-45' es el tramo con más goles (4)",
      subtitulo: 'Goles por tramo',
      resumen: "30-45', 4 goles",
      datos: [{ etiqueta: "0-15'", valor: 1 }, { etiqueta: "30-45'", valor: 4 }],
      tableHeaders: ['Tramo', 'Goles', '%'],
      tableRows: [["0-15'", '1', '20 %'], ["30-45'", '4', '80 %']],
    }));
    expect(html).toContain('role="img"');
    expect(html).toContain('<rect');
    expect(html).toContain('>4</text>');
    expect(html).toContain('<details');
    expect(html).toContain('<table');
    sinTextoProhibido(html);
  });

  it('el reparto de resultados tiene leyenda de texto con porcentajes', () => {
    const html = renderToStaticMarkup(createElement(BarraReparto, {
      id: 'prueba-reparto',
      titulo: '50 % de los partidos los gana el local',
      subtitulo: 'Reparto de resultados',
      resumen: 'Local 50 %, empate 25 %, visitante 25 %',
      partes: [
        { clave: 'local', etiqueta: 'Gana el local', partidos: 2, porcentaje: 50, clase: 'bg-[var(--accion)]' },
        { clave: 'empate', etiqueta: 'Empate', partidos: 1, porcentaje: 25, clase: 'bg-[var(--texto-tenue)]' },
        { clave: 'visitante', etiqueta: 'Gana el visitante', partidos: 1, porcentaje: 25, clase: 'bg-[var(--zona-fase-ascenso)]' },
      ],
    }));
    expect(html).toContain('role="img"');
    expect(html).toContain('Gana el local');
    expect(html).toContain('50 %');
    expect(html).toContain('Empate');
    sinTextoProhibido(html);
  });
});

describe('las tablas de apoyo', () => {
  it('las cifras se pintan con su etiqueta', () => {
    const html = renderToStaticMarkup(createElement(Cifras, {
      cifras: [{ etiqueta: 'Goles', valor: '27.268', nota: '7,07 por partido' }, { etiqueta: 'Actas', valor: '96 %' }],
    }));
    expect(html).toContain('Goles');
    expect(html).toContain('27.268');
    expect(html).toContain('7,07 por partido');
    expect(html).toContain('tabular-nums');
    sinTextoProhibido(html);
  });

  it('la lista de goleadores publica el nombre y no lo sustituye por una etiqueta', () => {
    const html = renderToStaticMarkup(createElement(ListaGoleadores, {
      filas: goleadoresConAcumulado(GOLEADORES, 9),
      golesDelAmbito: 9,
    }));
    expect(html).toContain('MARTÍN EZQUERRA, PABLO');
    expect(html).toContain('Nombre no publicado');
    expect(html).toContain('9 goles en el ámbito');
    expect(html).not.toContain('Jugador menor de edad');
    sinTextoProhibido(html);
  });

  it('casa y fuera muestra las dos condiciones y sus puntos', () => {
    const html = renderToStaticMarkup(createElement(TablaCasaFuera, { filas: casaFueraPorEquipo(PARTIDOS) }));
    expect(html).toContain('Casa');
    expect(html).toContain('Fuera');
    expect(html).toContain('pts');
    sinTextoProhibido(html);
  });

  it('la forma se pinta con letras, no sólo con colores', () => {
    const html = renderToStaticMarkup(createElement(TablaForma, {
      filas: [{ id: 1, nombre: 'U.D. Valdecastro', forma: ['G', 'E', 'P'] }],
    }));
    expect(html).toContain('>G</span>');
    expect(html).toContain('>E</span>');
    expect(html).toContain('Ganado');
    sinTextoProhibido(html);
  });

  it('sin tarjetas se dice; no se pinta una tabla de ceros', () => {
    const html = renderToStaticMarkup(createElement(TablaDisciplina, { filas: [] }));
    expect(html).toContain('Sin tarjetas publicadas.');
    sinTextoProhibido(html);
  });

  it('la disciplina distingue amarillas y rojas con letras, no sólo con color', () => {
    const html = renderToStaticMarkup(createElement(TablaDisciplina, {
      filas: [{ equipo_id: 1, equipo: 'U.D. Valdecastro', amarillas: 3, rojas: 1 }],
    }));
    expect(html).toContain('>A</span>');
    expect(html).toContain('>R</span>');
    expect(html).toContain('>3</span>');
  });

  it('en una federación entera no se enseña un porcentaje acumulado que siempre es 0', () => {
    const html = renderToStaticMarkup(createElement(ListaGoleadores, {
      filas: goleadoresConAcumulado(GOLEADORES, 27268),
      golesDelAmbito: 27268,
      mostrarAcumulado: false,
    }));
    expect(html).toContain('PJ');
    expect(html).not.toContain('0 %');
  });
});

describe('estados de la pantalla', () => {
  it('sin datos se dice en una frase', () => {
    const html = renderToStaticMarkup(createElement(SinDatos, {
      titulo: 'Sin datos', children: 'Sin partidos publicados.',
    }));
    expect(html).toContain('Sin partidos publicados.');
    sinTextoProhibido(html);
  });

  it('el esqueleto anuncia la carga y tiene filas, sin spinner', () => {
    const html = renderToStaticMarkup(createElement(EsqueletoEstadisticas, { filas: 5 }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect((html.match(/data-esqueleto="fila"/g) ?? []).length).toBe(5);
    expect(html).not.toContain('animate-spin');
  });
});
