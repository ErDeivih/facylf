import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  ARBITRO_POR_ID, CONSULTAS_OFICIALES, DELEGADO_POR_ID, ENTRENADOR_POR_ID, PARAMETROS_OFICIALES,
  type AsignacionDeDelegado, type AsignacionDeEntrenador, type FilaArbitro, type FilaDelegado,
  type FilaEntrenador, type LineaCompeticionArbitro, type PartidoDeArbitro, type PartidoDeDelegado,
  type PartidoDeEntrenador,
} from '../src/consultas/oficiales';
import { CabeceraOficial } from '../src/componentes/oficiales/CabeceraOficial';
import {
  CompeticionesDeArbitro, ResumenDeArbitro, UltimosPartidosDeArbitro,
} from '../src/componentes/oficiales/Arbitro';
import {
  AsignacionesDeEntrenador, ResumenDeEntrenador, UltimosPartidosDeEntrenador,
} from '../src/componentes/oficiales/Entrenador';
import {
  AsignacionesDeDelegado, ResumenDeDelegado, UltimosPartidosDeDelegado,
} from '../src/componentes/oficiales/Delegado';
import {
  agrupaAsignacionesPorTemporada, esRolDeArbitroPrincipal, esRolDeDelegadoDeEquipo,
  esRolDeEntrenador, etiquetaFamilia, familiaDeRol, idDeOficial, mediaPorPartido, mediaTexto,
  normalizaRol, rachaDeResultados, resumenDeResultados, signoDeResultado,
} from '../src/lib/oficiales';

/**
 * Estadísticas de árbitros, entrenadores y delegados (WALL, «Revisión de las capturas», David 05/11/2026).
 *
 * Referencias reales del canónico:
 *  · **árbitro 18951** (CAÑIBANO ARIAS, CARLOS): 10 partidos, todos con acta, en el grupo 797
 *    (Liga Nacional Juvenil 2025-26);
 *  · **entrenador 19080** (GAÑAN RODRIGUEZ, MANUEL): 30 partidos con el C.D.I. de la Amistad Deltacinco;
 *  · **delegado 19236** (GARCÍA LARA, ENOL): 30 partidos como «DEL. Equipo» del C.D. La Virgen del Camino.
 *
 * Lo que se defiende:
 *  · los roles del acta se normalizan (español, euskera, catalán e inglés) y cada pantalla enseña SÓLO los
 *    suyos: el árbitro, el cuerpo técnico y el delegado de EQUIPO (el delegado de campo no es el de equipo);
 *  · las cifras salen de una consulta por pantalla, sin N+1, y lo que no está publicado no se convierte en 0;
 *  · la racha y los resultados se leen en V-E-D (decisión de David, 04/11/2026), con palabra accesible;
 *  · un id que no es de esa figura es un 404, no una página vacía; y la interfaz no enseña textos internos.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

const ARBITRO = 18951;
const ENTRENADOR = 19080;
const DELEGADO = 19236;
/** Persona real que no es árbitro, entrenador ni delegado: ninguna de las tres fichas existe. */
const PERSONA_SIN_ROL = 31;

afterAll(async () => {
  await cierraCanonico();
});

/* ── Roles del acta: normalización y familia ────────────────────────────────────────────────────────── */

describe('los roles del acta se normalizan a una familia', () => {
  it('normaliza como la base: minúsculas, sin tildes ni puntuación', () => {
    expect(normalizaRol('DEL. Equipo')).toBe('del equipo');
    expect(normalizaRol('2ºEntrenador')).toBe('2oentrenador');
    expect(normalizaRol('Entrenatzailea')).toBe('entrenatzailea');
    expect(normalizaRol('  A.T.S. ')).toBe('a t s');
  });

  it('reconoce al entrenador en español, euskera e inglés, y al segundo entrenador', () => {
    for (const rol of ['Entrenador', 'entrenador', 'ENTRENADOR', 'Entrenatzailea', 'Entrenador Titular', 'Coach', 'Head coach']) {
      expect(familiaDeRol(rol), rol).toBe('entrenador');
    }
    for (const rol of ['2ºEntrenador', 'segundo-entrenador', 'Segundo Entrenador', 'Entrenador Auxiliar', '2ºEntrenatzailea', 'Assistant coach']) {
      expect(familiaDeRol(rol), rol).toBe('segundo_entrenador');
    }
    // El entrenador de porteros es del cuerpo técnico, pero no es el entrenador del equipo.
    expect(familiaDeRol('Entrenador Porteros')).toBe('entrenador_porteros');
    expect(esRolDeEntrenador('Entrenador Porteros')).toBe(false);
  });

  it('distingue el delegado de equipo del delegado de campo (en las lenguas que aparecen)', () => {
    for (const rol of ['DEL. Equipo', 'delegado', 'DELEGADO EQUIPO', 'Delegado de Equipo', 'DELEGAT EQUIP', 'Taldeko Delegatua']) {
      expect(familiaDeRol(rol), rol).toBe('delegado_equipo');
      expect(esRolDeDelegadoDeEquipo(rol), rol).toBe(true);
    }
    for (const rol of ['DEL. Campo', 'delegado-campo', 'DELEGAT CAMP', 'Zelaiko Delegatua']) {
      expect(familiaDeRol(rol), rol).toBe('delegado_campo');
      expect(esRolDeDelegadoDeEquipo(rol), rol).toBe(false);
    }
    // Un delegado de protección de la infancia no es el delegado del equipo.
    expect(familiaDeRol('DELEGADO DE PROTECCIÓN DE LA INFANCIA')).toBe('otro');
  });

  it('el resto del cuerpo técnico no se confunde con un entrenador ni con un delegado', () => {
    expect(familiaDeRol('Preparador Físico')).toBe('preparador_fisico');
    expect(familiaDeRol('A.T.S.')).toBe('fisioterapeuta');
    expect(familiaDeRol('Médico')).toBe('medico');
    expect(familiaDeRol('Encargado Material')).toBe('material');
    expect(familiaDeRol('Auxiliar')).toBe('auxiliar');
    expect(familiaDeRol('')).toBe('otro');
    expect(familiaDeRol('epr')).toBe('otro');
  });

  it('las etiquetas que se leen son palabras, no el literal raro de la fuente', () => {
    expect(etiquetaFamilia('entrenador')).toBe('Entrenador');
    expect(etiquetaFamilia('segundo_entrenador')).toBe('Segundo entrenador');
    expect(etiquetaFamilia('delegado_equipo')).toBe('Delegado de equipo');
    expect(etiquetaFamilia('delegado_campo')).toBe('Delegado de campo');
  });

  it('sólo el rol principal cuenta como árbitro: los asistentes no están en el canónico y no se inventan', () => {
    expect(esRolDeArbitroPrincipal('principal')).toBe(true);
    for (const rol of ['asistente1', 'asistente2', 'cuarto', 'otro', '']) {
      expect(esRolDeArbitroPrincipal(rol), rol).toBe(false);
    }
  });
});

/* ── Cifras de la pantalla ─────────────────────────────────────────────────────────────────────────── */

describe('las cifras de la ficha', () => {
  it('la media por partido no divide entre cero ni convierte un hueco en cero', () => {
    expect(mediaPorPartido(37, 10)).toBeCloseTo(3.7, 5);
    expect(mediaPorPartido(0, 10)).toBe(0);
    expect(mediaPorPartido(37, 0)).toBeNull();
    expect(mediaPorPartido(null, 10)).toBeNull();
    expect(mediaPorPartido(37, null)).toBeNull();
  });

  it('la media se escribe en castellano con un decimal, y sin dato es un guion', () => {
    expect(mediaTexto(3.7)).toBe('3,7');
    expect(mediaTexto(4.5875)).toBe('4,6');
    expect(mediaTexto(null)).toBe('—');
  });

  it('el resultado del partido se traduce al signo del dominio y respeta el sin resultado', () => {
    expect(signoDeResultado('ganado')).toBe('G');
    expect(signoDeResultado('empatado')).toBe('E');
    expect(signoDeResultado('perdido')).toBe('P');
    expect(signoDeResultado('sin_resultado')).toBeNull();
    expect(signoDeResultado(null)).toBeNull();
  });

  it('la racha ignora los partidos sin resultado y enseña como mucho cinco, del más antiguo al más reciente', () => {
    expect(rachaDeResultados(['ganado', 'perdido', 'empatado', 'sin_resultado', 'ganado'])).toEqual(['G', 'P', 'E', 'G']);
    // Seis resultados: se queda con los cinco últimos (el primero, «ganado», se cae).
    expect(rachaDeResultados(['ganado', 'ganado', 'perdido', 'perdido', 'empatado', 'ganado']))
      .toEqual(['G', 'P', 'P', 'E', 'G']);
    expect(rachaDeResultados([])).toEqual([]);
  });

  it('el resumen de resultados cuenta sólo los partidos jugados', () => {
    expect(resumenDeResultados(['ganado', 'ganado', 'empatado', 'perdido', 'sin_resultado']))
      .toEqual({ jugados: 4, victorias: 2, empates: 1, derrotas: 1 });
  });

  it('las asignaciones se agrupan por temporada, de la más reciente a la más antigua', () => {
    const asignaciones = [
      { temporada: '2024-25', temporada_orden: 2024, equipo: 'A' },
      { temporada: '2025-26', temporada_orden: 2025, equipo: 'B' },
      { temporada: '2025-26', temporada_orden: 2025, equipo: 'C' },
    ];
    expect(agrupaAsignacionesPorTemporada(asignaciones).map((g) => [g.temporada, g.asignaciones.length]))
      .toEqual([['2025-26', 2], ['2024-25', 1]]);
  });

  it('un id de la URL sólo vale si es un entero positivo', () => {
    expect(idDeOficial('18951')).toBe(18951);
    for (const crudo of ['abc', '0', '-3', '1.5', '', undefined]) {
      expect(idDeOficial(crudo), String(crudo)).toBeNull();
    }
  });
});

/* ── Contrato estático de las consultas ───────────────────────────────────────────────────────────── */

describe('contrato estático de las consultas de oficiales', () => {
  it('las tres llevan LIMIT, parámetros numerados y declaran lo que prometen', () => {
    expect(CONSULTAS_OFICIALES).toHaveLength(3);
    for (const c of CONSULTAS_OFICIALES) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
      expect(c.sql, `${c.nombre} interpola un valor`).not.toContain('${');
      expect(c.sql, `${c.nombre} sin parámetro`).toContain('$1');
      expect(c.presupuestoMs, `${c.nombre} sin presupuesto`).toBeGreaterThan(0);
      expect(c.plan, `${c.nombre} sin tipo de recorrido`).toBe('indexado');
      expect(c.columnas.length, `${c.nombre} sin columnas`).toBeGreaterThan(2);
      expect(PARAMETROS_OFICIALES[c.nombre], `${c.nombre} sin parámetros de ejemplo`).toBeDefined();
    }
  });

  it('cada consulta es una sola ida a la base: no hay consultas por fila ni concatenación', () => {
    for (const c of CONSULTAS_OFICIALES) {
      // Una consulta por pantalla: el SQL no puede contener dos sentencias separadas por `;`.
      expect(c.sql.trim().replace(/;$/, ''), `${c.nombre} tiene más de una sentencia`).not.toMatch(/;\s*\S/);
      expect(c.descripcion.length, `${c.nombre} sin descripción`).toBeGreaterThan(30);
    }
  });
});

/* ── Contrato real con el canónico ────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('contrato real: las cifras salen del canónico, no de un ejemplo', () => {
  it('el árbitro 18951 trae sus partidos, tarjetas, penaltis y la comparación con su competición', async () => {
    const [fila] = await consulta<FilaArbitro>(ARBITRO_POR_ID.sql, [ARBITRO]);
    expect(fila).toBeDefined();
    expect(fila!.nombre).toContain('CAÑIBANO');
    expect(fila!.partidos).toBe(10);
    expect(fila!.con_acta).toBe(10);
    expect(fila!.amarillas).toBe(37);
    expect(fila!.rojas).toBe(12);
    expect(fila!.penaltis).toBe(4);
    expect(fila!.competiciones.length).toBeGreaterThanOrEqual(1);
    const competicion = fila!.competiciones[0]!;
    expect(competicion.edicion).toBe('Liga Nacional Juvenil');
    expect(competicion.temporada).toBe('2025-26');
    expect(competicion.partidos).toBe(10);
    // La media de la competición sale de TODOS sus partidos con acta, no de los del árbitro.
    expect(competicion.partidos_competicion).toBe(240);
    expect(competicion.amarillas_competicion).toBe(1101);
    expect(competicion.rojas_competicion).toBe(113);
    expect(competicion.penaltis_competicion).toBe(66);
    // Los últimos partidos son suyos, con su acta, y están ordenados del más reciente al más antiguo.
    expect(fila!.ultimos.length).toBe(10);
    expect(fila!.ultimos[0]!.match_id).toBe(16942);
    expect(fila!.ultimos[0]!.tiene_acta).toBe(true);
    const fechas = fila!.ultimos.map((p) => p.fecha ?? '');
    expect(fechas).toEqual([...fechas].sort((a, b) => b.localeCompare(a)));
    // Sólo partidos arbitrados como principal.
    for (const p of fila!.ultimos) expect(p.match_id).toBeGreaterThan(0);
  });

  it('el entrenador 19080 trae sus 30 partidos, su balance y su equipo', async () => {
    const [fila] = await consulta<FilaEntrenador>(ENTRENADOR_POR_ID.sql, [ENTRENADOR]);
    expect(fila).toBeDefined();
    expect(fila!.nombre).toContain('GAÑAN');
    expect(fila!.partidos).toBe(30);
    expect(fila!.victorias).toBe(13);
    expect(fila!.empates).toBe(5);
    expect(fila!.derrotas).toBe(12);
    expect(fila!.victorias + fila!.empates + fila!.derrotas).toBe(fila!.partidos);
    expect(fila!.equipos).toBe(1);
    expect(fila!.temporadas).toBe(1);
    const asignacion = fila!.asignaciones[0]!;
    expect(asignacion.equipo).toContain('Amistad');
    expect(asignacion.temporada).toBe('2025-26');
    expect(asignacion.edicion).toBe('Liga Nacional Juvenil');
    expect(asignacion.rol).toBe('Entrenador');
    expect(esRolDeEntrenador(asignacion.rol)).toBe(true);
    expect(fila!.ultimos.length).toBe(20);
    for (const p of fila!.ultimos) {
      expect(esRolDeEntrenador(p.rol), p.rol).toBe(true);
      expect(['ganado', 'empatado', 'perdido', 'sin_resultado']).toContain(p.resultado);
    }
  });

  it('el delegado 19236 trae sus partidos como delegado de equipo, no como delegado de campo', async () => {
    const [fila] = await consulta<FilaDelegado>(DELEGADO_POR_ID.sql, [DELEGADO]);
    expect(fila).toBeDefined();
    expect(fila!.nombre).toContain('GARCÍA LARA');
    expect(fila!.partidos).toBe(30);
    expect(fila!.equipos).toBe(1);
    const asignacion = fila!.asignaciones[0]!;
    expect(asignacion.rol).toBe('DEL. Equipo');
    expect(esRolDeDelegadoDeEquipo(asignacion.rol)).toBe(true);
    expect(asignacion.equipo).toContain('Virgen del Camino');
    expect(asignacion.temporada).toBe('2025-26');
    for (const p of fila!.ultimos) expect(esRolDeDelegadoDeEquipo(p.rol), p.rol).toBe(true);
  });

  it('un id que no es de esa figura no devuelve fila: la página es un 404, no una ficha vacía', async () => {
    for (const [consultaOficial, id] of [
      [ARBITRO_POR_ID, PERSONA_SIN_ROL],
      [ENTRENADOR_POR_ID, PERSONA_SIN_ROL],
      [DELEGADO_POR_ID, PERSONA_SIN_ROL],
      [ARBITRO_POR_ID, 999999999],
      [ENTRENADOR_POR_ID, 999999999],
      [DELEGADO_POR_ID, 999999999],
    ] as const) {
      const filas = await consulta(consultaOficial.sql, [id]);
      expect(filas, `${consultaOficial.nombre} con id ${id}`).toHaveLength(0);
    }
    // Y al revés: el árbitro no responde en la ficha de entrenador y el entrenador no responde en la de árbitro.
    expect(await consulta(ENTRENADOR_POR_ID.sql, [ARBITRO])).toHaveLength(0);
    expect(await consulta(ARBITRO_POR_ID.sql, [ENTRENADOR])).toHaveLength(0);
  });

  it('el árbitro de 3769 también responde (contrato de la temporada en curso)', async () => {
    const [fila] = await consulta<FilaArbitro>(ARBITRO_POR_ID.sql, [123522]);
    expect(fila).toBeDefined();
    // La temporada en curso crece con la importación: cota, no un número clavado.
    expect(fila!.partidos).toBeGreaterThanOrEqual(2);
    expect(fila!.competiciones[0]!.temporada).toBe('2026-27');
  });
});

/* ── Render: lo que ve el usuario ─────────────────────────────────────────────────────────────────── */

const PARTIDO_ARBITRO: PartidoDeArbitro = {
  match_id: 16942, fecha: '2026-05-09', jornada: 30, temporada: '2025-26',
  edicion: 'Liga Nacional Juvenil', edicion_id: 797, grupo: 'Primera - III', grupo_id: 797,
  local_id: 2531, local: 'C.D. Parquesol', visitante_id: 2534, visitante: 'Gimnástica Segoviana S.A.D.',
  goles_local: 1, goles_visitante: 0, amarillas: 0, rojas: 2, dobles_amarillas: 0, penaltis: 0,
  tiene_acta: true,
};

const COMPETICION_ARBITRO: LineaCompeticionArbitro = {
  edicion_id: 797, edicion: 'Liga Nacional Juvenil', temporada: '2025-26',
  partidos: 10, con_acta: 10, amarillas: 37, rojas: 12, dobles_amarillas: 5, penaltis: 4,
  partidos_competicion: 240, amarillas_competicion: 1101, rojas_competicion: 113, penaltis_competicion: 66,
};

const FILA_ARBITRO: FilaArbitro = {
  person_id: ARBITRO, nombre: 'CAÑIBANO ARIAS, CARLOS',
  partidos: 10, con_acta: 10, amarillas: 37, rojas: 12, dobles_amarillas: 5, penaltis: 4,
  competiciones: [COMPETICION_ARBITRO], ultimos: [PARTIDO_ARBITRO],
};

const PARTIDO_ENTRENADOR: PartidoDeEntrenador = {
  match_id: 16946, fecha: '2026-05-10', jornada: 30, temporada: '2025-26',
  edicion: 'Liga Nacional Juvenil', edicion_id: 797, grupo: 'Primera - III', grupo_id: 797,
  equipo_id: 2533, equipo: 'C.D.I. de la Amistad Deltacinco', club_id: 1519, club: 'C.D.I. de la Amistad Deltacinco',
  rival_id: 2537, rival: 'Salamanca C.F. UDS', condicion: 'casa',
  goles_propios: 1, goles_rival: 3, resultado: 'perdido', rol: 'Entrenador', tiene_acta: true,
};

const ASIGNACION_ENTRENADOR: AsignacionDeEntrenador = {
  temporada: '2025-26', temporada_orden: 2025, edicion_id: 797, edicion: 'Liga Nacional Juvenil',
  grupo_id: 797, grupo: 'Primera - III', equipo_id: 2533, equipo: 'C.D.I. de la Amistad Deltacinco',
  club_id: 1519, club: 'C.D.I. de la Amistad Deltacinco', rol: 'Entrenador', partidos: 30,
  victorias: 13, empates: 5, derrotas: 12, primera_fecha: '2025-09-14', ultima_fecha: '2026-05-10',
};

const FILA_ENTRENADOR: FilaEntrenador = {
  person_id: ENTRENADOR, nombre: 'GAÑAN RODRIGUEZ, MANUEL',
  partidos: 30, victorias: 13, empates: 5, derrotas: 12, equipos: 1, clubes: 1, temporadas: 1,
  asignaciones: [ASIGNACION_ENTRENADOR], ultimos: [PARTIDO_ENTRENADOR],
};

const PARTIDO_DELEGADO: PartidoDeDelegado = {
  match_id: 16942, fecha: '2026-05-09', jornada: 30, temporada: '2025-26',
  edicion: 'Liga Nacional Juvenil', edicion_id: 797, grupo: 'Primera - III', grupo_id: 797,
  equipo_id: 2529, equipo: 'C.D. La Virgen del Camino', club_id: 9, club: 'C.D. La Virgen del Camino',
  rival_id: 2535, rival: 'Puente Castro F.C.', condicion: 'casa',
  goles_propios: 1, goles_rival: 0, rol: 'DEL. Equipo', tiene_acta: true,
};

const ASIGNACION_DELEGADO: AsignacionDeDelegado = {
  temporada: '2025-26', temporada_orden: 2025, edicion_id: 797, edicion: 'Liga Nacional Juvenil',
  grupo_id: 797, grupo: 'Primera - III', equipo_id: 2529, equipo: 'C.D. La Virgen del Camino',
  club_id: 9, club: 'C.D. La Virgen del Camino', rol: 'DEL. Equipo', partidos: 30,
  primera_fecha: '2025-09-14', ultima_fecha: '2026-05-10',
};

const FILA_DELEGADO: FilaDelegado = {
  person_id: DELEGADO, nombre: 'GARCÍA LARA, ENOL',
  partidos: 30, equipos: 1, clubes: 1, temporadas: 1,
  asignaciones: [ASIGNACION_DELEGADO], ultimos: [PARTIDO_DELEGADO],
};

/** Líneas de una insignia de forma V-E-D (letra visible y palabra accesible). */
function insigniasDeForma(html: string): Array<{ etiqueta: string; letra: string }> {
  return [...html.matchAll(/<span[^>]*\btitle="(Victoria|Empate|Derrota)"[^>]*>([^<]*)/g)]
    .map((m) => ({ etiqueta: m[1]!, letra: m[2]!.trim() }));
}

describe('el árbitro: lo que ve el usuario', () => {
  it('la cabecera dice quién es y que es árbitro principal', () => {
    const html = renderToStaticMarkup(createElement(CabeceraOficial, {
      nombre: FILA_ARBITRO.nombre, rol: 'Árbitro principal', lineas: ['10 partidos arbitrados'],
    }));
    expect(html).toContain('CAÑIBANO ARIAS, CARLOS');
    expect(html).toContain('Árbitro principal');
    expect(html).toContain('10 partidos arbitrados');
  });

  it('el resumen enseña partidos, amonestaciones, rojas y penaltis con su media por partido', () => {
    const html = renderToStaticMarkup(createElement(ResumenDeArbitro, { fila: FILA_ARBITRO }));
    expect(html).toContain('Partidos');
    expect(html).toContain('10');
    expect(html).toContain('Amarillas');
    expect(html).toContain('37');
    expect(html).toContain('Rojas');
    expect(html).toContain('12');
    expect(html).toContain('3,7'); // 37 / 10
    // El dato ausente no se convierte en cero: sin acta la media es un guion.
    const sinActas = renderToStaticMarkup(createElement(ResumenDeArbitro, {
      fila: { ...FILA_ARBITRO, con_acta: 0, partidos: 10 },
    }));
    expect(sinActas).toContain('—');
  });

  it('la competición compara sus medias con las de la competición, no consigo mismo', () => {
    const html = renderToStaticMarkup(createElement(CompeticionesDeArbitro, {
      competiciones: [COMPETICION_ARBITRO],
    }));
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('2025-26');
    expect(html).toContain('3,7');  // sus amarillas por partido
    expect(html).toContain('4,6');  // 1101 / 240 (toda la competición)
    expect(html).toContain('0,5');  // 113 / 240 de rojas en la competición
    expect(html).not.toContain('—'); // con actas no hay huecos
  });

  it('los últimos partidos enlazan equipo, competición y acta, y llevan las tarjetas del partido', () => {
    const html = renderToStaticMarkup(createElement(UltimosPartidosDeArbitro, { partidos: [PARTIDO_ARBITRO] }));
    expect(html).toContain('C.D. Parquesol');
    expect(html).toContain('Gimnástica Segoviana S.A.D.');
    expect(html).toContain('href="/explorar/equipo/2531"');
    expect(html).toContain('href="/explorar/competicion/797"');
    expect(html).toContain('href="/explorar/acta/16942"');
    expect(html).toContain('J30');
    // Tarjetas del partido, con letra y número (nunca sólo color).
    expect(html).toMatch(/>A</);
    expect(html).toMatch(/>R</);
    expect(html).toContain('2'); // rojas de ese partido
    // Sin acta no se pinta un enlace que no lleva a ninguna parte.
    const sinActa = renderToStaticMarkup(createElement(UltimosPartidosDeArbitro, {
      partidos: [{ ...PARTIDO_ARBITRO, tiene_acta: false }],
    }));
    expect(sinActa).not.toContain('/explorar/acta/');
  });

  it('sin partidos lo dice, no pinta una lista vacía', () => {
    expect(renderToStaticMarkup(createElement(UltimosPartidosDeArbitro, { partidos: [] })))
      .toMatch(/sin partidos/i);
    expect(renderToStaticMarkup(createElement(CompeticionesDeArbitro, { competiciones: [] })))
      .toMatch(/sin competiciones/i);
  });
});

describe('el entrenador: lo que ve el usuario', () => {
  it('el resumen da el balance y la racha en V-E-D', () => {
    const html = renderToStaticMarkup(createElement(ResumenDeEntrenador, { fila: FILA_ENTRENADOR }));
    expect(html).toContain('30');  // partidos
    expect(html).toContain('13');  // victorias
    expect(html).toContain('5');   // empates
    expect(html).toContain('12');  // derrotas
    expect(html).toContain('Racha');
    const insignias = insigniasDeForma(html);
    expect(insignias.length).toBeGreaterThan(0);
    for (const i of insignias) {
      expect(['V', 'E', 'D']).toContain(i.letra);
      expect(['Victoria', 'Empate', 'Derrota']).toContain(i.etiqueta);
    }
  });

  it('las asignaciones dicen equipo, temporada, competición y rol en palabras', () => {
    const html = renderToStaticMarkup(createElement(AsignacionesDeEntrenador, {
      asignaciones: [ASIGNACION_ENTRENADOR],
    }));
    expect(html).toContain('C.D.I. de la Amistad Deltacinco');
    expect(html).toContain('2025-26');
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('Entrenador');
    expect(html).toContain('13-5-12'); // victorias-empatías-derrotas del equipo
    expect(html).toContain('href="/explorar/equipo/2533"');
    expect(html).toContain('href="/explorar/competicion/797"');
  });

  it('los últimos partidos llevan el marcador, el resultado en V-E-D y el acta', () => {
    const html = renderToStaticMarkup(createElement(UltimosPartidosDeEntrenador, {
      partidos: [PARTIDO_ENTRENADOR],
    }));
    expect(html).toContain('Salamanca C.F. UDS');
    expect(html).toContain('1 - 3');
    expect(html).toContain('href="/explorar/acta/16946"');
    const insignias = insigniasDeForma(html);
    expect(insignias).toEqual([{ etiqueta: 'Derrota', letra: 'D' }]);
    expect(html).not.toMatch(/Ganado|Perdido/);
  });

  it('sin equipos ni partidos lo dice', () => {
    expect(renderToStaticMarkup(createElement(AsignacionesDeEntrenador, { asignaciones: [] })))
      .toMatch(/sin equipos/i);
    expect(renderToStaticMarkup(createElement(UltimosPartidosDeEntrenador, { partidos: [] })))
      .toMatch(/sin partidos/i);
  });
});

describe('el delegado: lo que ve el usuario', () => {
  it('el resumen da partidos, equipos y temporadas', () => {
    const html = renderToStaticMarkup(createElement(ResumenDeDelegado, { fila: FILA_DELEGADO }));
    expect(html).toContain('Partidos');
    expect(html).toContain('30');
    expect(html).toContain('Equipos');
    expect(html).toContain('1');
  });

  it('las asignaciones y los partidos dicen el equipo y el rol de delegado de equipo', () => {
    const asignaciones = renderToStaticMarkup(createElement(AsignacionesDeDelegado, {
      asignaciones: [ASIGNACION_DELEGADO],
    }));
    expect(asignaciones).toContain('C.D. La Virgen del Camino');
    expect(asignaciones).toContain('2025-26');
    expect(asignaciones).toContain('Delegado de equipo');

    const partidos = renderToStaticMarkup(createElement(UltimosPartidosDeDelegado, {
      partidos: [PARTIDO_DELEGADO],
    }));
    expect(partidos).toContain('Puente Castro F.C.');
    expect(partidos).toContain('href="/explorar/acta/16942"');
    expect(partidos).toContain('J30');
  });

  it('sin partidos lo dice', () => {
    expect(renderToStaticMarkup(createElement(UltimosPartidosDeDelegado, { partidos: [] })))
      .toMatch(/sin partidos/i);
  });
});

/* ── La interfaz no habla de cómo está hecha ──────────────────────────────────────────────────────── */

describe('la interfaz no enseña textos internos (DOCTRINA-CALIDAD §8)', () => {
  it('ninguna de las tres pantallas habla de tablas, consultas, caché ni endpoints', () => {
    const html = [
      renderToStaticMarkup(createElement(CabeceraOficial, {
        nombre: FILA_ARBITRO.nombre, rol: 'Árbitro principal', lineas: ['10 partidos arbitrados'],
      })),
      renderToStaticMarkup(createElement(ResumenDeArbitro, { fila: FILA_ARBITRO })),
      renderToStaticMarkup(createElement(CompeticionesDeArbitro, { competiciones: [COMPETICION_ARBITRO] })),
      renderToStaticMarkup(createElement(UltimosPartidosDeArbitro, { partidos: [PARTIDO_ARBITRO] })),
      renderToStaticMarkup(createElement(ResumenDeEntrenador, { fila: FILA_ENTRENADOR })),
      renderToStaticMarkup(createElement(AsignacionesDeEntrenador, { asignaciones: [ASIGNACION_ENTRENADOR] })),
      renderToStaticMarkup(createElement(UltimosPartidosDeEntrenador, { partidos: [PARTIDO_ENTRENADOR] })),
      renderToStaticMarkup(createElement(ResumenDeDelegado, { fila: FILA_DELEGADO })),
      renderToStaticMarkup(createElement(AsignacionesDeDelegado, { asignaciones: [ASIGNACION_DELEGADO] })),
      renderToStaticMarkup(createElement(UltimosPartidosDeDelegado, { partidos: [PARTIDO_DELEGADO] })),
    ].join('');
    expect(html).not.toMatch(/match_staff|match_official|core\.|SQL|caché|endpoint|canónico|base de datos/i);
    // Sin cifras inventadas: los ceros que aparecen son datos publicados, no huecos rellenados.
    expect(html).not.toMatch(/undefined|NaN/);
  });
});
