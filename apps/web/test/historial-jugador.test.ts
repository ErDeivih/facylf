import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico, consulta } from '../src/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DE_JUGADOR, type AparicionDeHistorial, type FilaHistorialJugador } from '../src/consultas/historial';
import { ResumenHistorial } from '../src/componentes/historial/ResumenHistorial';
import { TablaHistorial } from '../src/componentes/historial/TablaHistorial';
import {
  agrupaHistorial, cambiosAMitadDeTemporada, resumenDeCarrera, textoDeFechas, textoDeMinutos,
  textoDeTarjetas, tituloDeHistorial,
} from '../src/lib/historial-jugador';

/**
 * Contrato del historial de jugador (feedback de David, 05/11/2026).
 *
 * Lo que se defiende, porque es justo lo que la trayectoria agregada no enseñaba:
 *  · un jugador puede tener **varios equipos del mismo club** en una temporada;
 *  · puede **cambiar de equipo o de club a mitad de temporada**, y eso se marca;
 *  · dos tramos con fechas solapadas NO son un cambio; si son del mismo club es cantera y no se avisa,
 *    y sólo se avisa cuando son dos CLUBES distintos en la misma temporada (regla de David, 09/11/2026);
 *  · partidos, titularidades, goles, tarjetas y minutos salen de las actas; los minutos sólo se
 *    enseñan si son fiables, y si no se dice «sin datos», nunca un cero;
 *  · identidad con contexto: si la identidad es nominal, la página lo avisa (la consulta trae la marca).
 *
 * La referencia real es la persona **122** (CAMINERO FERNÁNDEZ, RODRIGO): varias temporadas en CyL, con
 * un cambio real de club a mitad de la 2023-24 (Palencia C.F. → C.D. Carrión) y dos equipos del mismo
 * club en esa misma temporada. También se prueba 19057 (dos equipos del mismo club con fechas solapadas)
 * y una persona sin apariciones (917112). La persona 1181455 es el caso contrario a la publicación: sus
 * apariciones están en Cantabria y no se ven por el rol de lectura.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** Persona real con cambio de club a mitad de temporada y varios equipos del mismo club. */
const PERSONA = 122;
/** Persona real con dos equipos del mismo club y fechas solapadas (2023-24). */
const PERSONA_MISMO_CLUB = 19057;
/** Persona con eventos pero sin ninguna aparición registrada. */
const PERSONA_SIN_APARICIONES = 917112;
/** Persona real cuyas apariciones son de otra federación (Cantabria): no se publican en esta web. */
const PERSONA_DE_OTRA_FEDERACION = 1181455;

afterAll(async () => {
  await cierraCanonico();
});

/* ── Fixture ─────────────────────────────────────────────────────────────────────────────────────── */

function aparicion(extra: Partial<AparicionDeHistorial> & {
  match_id: number;
  team_entry_id: number;
  temporada: string;
  fecha: string | null;
}): AparicionDeHistorial {
  return {
    temporada_orden: Number(extra.temporada?.slice(0, 4) ?? 0),
    condicion: 'starter',
    equipo: 'Equipo',
    club_id: 1,
    club: 'Club',
    edicion: 'Liga',
    edicion_id: 1,
    grupo_id: 10,
    grupo: 'Grupo',
    federacion: 'castilla-leon',
    federacion_nombre: 'Castilla y León',
    goles: 0, goles_penalti: 0, propias: 0, amarillas: 0, rojas: 0,
    minutos_exactos: null, minutos_estimados: null, minutos_fiables: null,
    ...extra,
  };
}

const CAMBIO_DE_CLUB: AparicionDeHistorial[] = [
  aparicion({ match_id: 1, team_entry_id: 100, temporada: '2015-16', fecha: '2015-08-21', equipo: 'U.M. Escobedo', club_id: 983, club: 'U.M. Escobedo', minutos_exactos: 450, minutos_estimados: 450, minutos_fiables: true }),
  aparicion({ match_id: 2, team_entry_id: 100, temporada: '2015-16', fecha: '2016-02-20', equipo: 'U.M. Escobedo', club_id: 983, club: 'U.M. Escobedo', condicion: 'substitute', minutos_exactos: 450, minutos_estimados: 450, minutos_fiables: true }),
  aparicion({ match_id: 3, team_entry_id: 101, temporada: '2015-16', fecha: '2016-03-13', equipo: 'Internacional F.C.', club_id: 29763, club: 'Internacional F.C.', minutos_exactos: 731, minutos_estimados: 731, minutos_fiables: true }),
];

const MISMO_CLUB_DISJUNTO: AparicionDeHistorial[] = [
  aparicion({ match_id: 10, team_entry_id: 200, temporada: '2017-18', fecha: '2017-08-20', equipo: 'C.F. Vimenor', club_id: 976, club: 'C.F. Vimenor' }),
  aparicion({ match_id: 11, team_entry_id: 201, temporada: '2017-18', fecha: '2017-09-10', equipo: 'C.F. Vimenor "B"', club_id: 976, club: 'C.F. Vimenor' }),
];

const SIMULTANEOS: AparicionDeHistorial[] = [
  aparicion({ match_id: 20, team_entry_id: 300, temporada: '2023-24', fecha: '2023-09-16', equipo: 'C.D. San Juanillo', club_id: 5355, club: 'C.D. San Juanillo', edicion: '1ª División Regional de Cadetes', edicion_id: 20, grupo_id: 200 }),
  aparicion({ match_id: 22, team_entry_id: 300, temporada: '2023-24', fecha: '2024-05-04', equipo: 'C.D. San Juanillo', club_id: 5355, club: 'C.D. San Juanillo', edicion: '1ª División Regional de Cadetes', edicion_id: 20, grupo_id: 200 }),
  aparicion({ match_id: 21, team_entry_id: 301, temporada: '2023-24', fecha: '2024-04-14', equipo: 'C.D. San Juanillo', club_id: 5355, club: 'C.D. San Juanillo', edicion: '1ª División Provincial de Juveniles', edicion_id: 21, grupo_id: 201 }),
];

/** Lo que la interfaz no puede decir: cómo está hecha o de dónde sale el cálculo (§8 de la doctrina). */
const TEXTO_PROHIBIDO: readonly RegExp[] = [
  /según el canónico/i,
  /según la base/i,
  /según el prototipo/i,
  /canónico/i,
  /prototipo/i,
  /reconstruid/i,
  /se calcula/i,
  /calculad[oa]/i,
  /cálculo/i,
  /SQL/i,
  /backend/i,
  /endpoint/i,
  /consulta (de la base|sql)/i,
  /<code/i,
];

function sinTextoProhibido(html: string) {
  for (const prohibido of TEXTO_PROHIBIDO) {
    expect(html, `la interfaz no debe contener «${prohibido}»`).not.toMatch(prohibido);
  }
}

/** Una persona real de la consulta, sin depender del resto de campos del fixture. */
async function historialReal(personaId: number): Promise<FilaHistorialJugador | undefined> {
  const [fila] = await consulta<FilaHistorialJugador>(HISTORIAL_DE_JUGADOR.sql, [personaId]);
  return fila;
}

/* ── Reglas puras ────────────────────────────────────────────────────────────────────────────────── */

describe('historial: agrupación en tramos', () => {
  it('agrupa por temporada y equipo, de la temporada más reciente a la más antigua', () => {
    const temporadas = agrupaHistorial([...CAMBIO_DE_CLUB, ...MISMO_CLUB_DISJUNTO]);
    expect(temporadas.map((t) => t.temporada)).toEqual(['2017-18', '2015-16']);
    expect(temporadas[1]!.tramos.map((t) => t.equipo)).toEqual(['U.M. Escobedo', 'Internacional F.C.']);
  });

  it('cuenta partidos, titularidades, suplencias y convocados sin condición', () => {
    const [temporada] = agrupaHistorial(CAMBIO_DE_CLUB);
    const [escobedo] = temporada!.tramos;
    expect(escobedo).toMatchObject({
      equipo: 'U.M. Escobedo',
      partidos: 2,
      titularidades: 1,
      suplencias: 1,
      convocadosSinCondicion: 0,
      desde: '2015-08-21',
      hasta: '2016-02-20',
    });
  });

  it('suma goles, penaltis, propias, amarillas y rojas de las actas', () => {
    const eventos = [
      aparicion({ match_id: 1, team_entry_id: 400, temporada: '2020-21', fecha: '2020-09-01', goles: 2, goles_penalti: 1, amarillas: 1 }),
      aparicion({ match_id: 2, team_entry_id: 400, temporada: '2020-21', fecha: '2020-09-08', goles: 1, propias: 1, rojas: 1 }),
    ];
    const [temporada] = agrupaHistorial(eventos);
    expect(temporada!.tramos[0]).toMatchObject({ goles: 3, golesPenalti: 1, propias: 1, amarillas: 1, rojas: 1 });
  });

  it('los minutos se enseñan sólo si son fiables; si no, quedan sin dato', () => {
    const fiables = agrupaHistorial([
      aparicion({ match_id: 1, team_entry_id: 500, temporada: '2020-21', fecha: '2020-09-01', minutos_exactos: 900, minutos_estimados: 900, minutos_fiables: true }),
      aparicion({ match_id: 2, team_entry_id: 500, temporada: '2020-21', fecha: '2020-09-08', minutos_exactos: 900, minutos_estimados: 900, minutos_fiables: true }),
    ]);
    // El resumen de minutos es del equipo-temporada: no se suma una vez por partido.
    expect(fiables[0]!.tramos[0]!.minutos).toBe(900);
    expect(fiables[0]!.tramos[0]!.minutosFiables).toBe(true);

    const noFiables = agrupaHistorial([
      aparicion({ match_id: 1, team_entry_id: 501, temporada: '2020-21', fecha: '2020-09-01', minutos_exactos: null, minutos_estimados: 750, minutos_fiables: false }),
    ]);
    expect(noFiables[0]!.tramos[0]!.minutos).toBeNull();
    expect(noFiables[0]!.tramos[0]!.minutosFiables).toBe(false);
    expect(noFiables[0]!.tramos[0]!.minutosEstimados).toBe(750);
  });

  it('marca un cambio de club a mitad de temporada cuando los tramos no se solapan', () => {
    const [temporada] = agrupaHistorial(CAMBIO_DE_CLUB);
    expect(temporada!.transiciones).toHaveLength(1);
    expect(temporada!.transiciones[0]).toMatchObject({
      tipo: 'cambio-club',
      desdeEquipo: 'U.M. Escobedo',
      hastaEquipo: 'Internacional F.C.',
      fecha: '2016-03-13',
    });
  });

  it('un cambio dentro del mismo club se distingue del cambio de club', () => {
    const [temporada] = agrupaHistorial(MISMO_CLUB_DISJUNTO);
    expect(temporada!.transiciones[0]).toMatchObject({ tipo: 'cambio-equipo', fecha: '2017-09-10' });
  });

  it('dos equipos del mismo club con fechas solapadas NO son un aviso: es cantera, no dos clubes', () => {
    const [temporada] = agrupaHistorial(SIMULTANEOS);
    // Un jugador puede subir con equipos de categorías superiores del mismo club: eso no es un problema.
    expect(temporada!.transiciones.filter((t) => t.tipo === 'simultaneo')).toEqual([]);
    // Y no aparecen como «cambio» en la lista de cambios a mitad de temporada.
    expect(cambiosAMitadDeTemporada(agrupaHistorial(SIMULTANEOS))).toEqual([]);
  });

  it('dos CLUBES distintos con fechas solapadas sí se avisan', () => {
    const dosClubes = [
      aparicion({ match_id: 30, team_entry_id: 700, temporada: '2023-24', fecha: '2023-09-16', equipo: 'C.D. Uno', club_id: 1, club: 'C.D. Uno' }),
      aparicion({ match_id: 31, team_entry_id: 700, temporada: '2023-24', fecha: '2024-02-10', equipo: 'C.D. Uno', club_id: 1, club: 'C.D. Uno' }),
      aparicion({ match_id: 32, team_entry_id: 701, temporada: '2023-24', fecha: '2024-01-20', equipo: 'C.D. Dos', club_id: 2, club: 'C.D. Dos' }),
    ];
    const [temporada] = agrupaHistorial(dosClubes);
    expect(temporada!.transiciones.filter((t) => t.tipo === 'simultaneo')).toHaveLength(1);
    expect(temporada!.transiciones.find((t) => t.tipo === 'simultaneo')).toMatchObject({
      desdeClubId: 1,
      hastaClubId: 2,
    });
  });

  it('sin fechas no se afirma que haya cambio', () => {
    const sinFechas = [
      aparicion({ match_id: 1, team_entry_id: 600, temporada: '2019-20', fecha: null, equipo: 'A', club_id: 1 }),
      aparicion({ match_id: 2, team_entry_id: 601, temporada: '2019-20', fecha: null, equipo: 'B', club_id: 2 }),
    ];
    const [temporada] = agrupaHistorial(sinFechas);
    expect(temporada!.transiciones[0]!.tipo).toBe('sin-fechas');
    expect(temporada!.transiciones[0]!.fecha).toBeNull();
  });

  it('los totales de la temporada suman los tramos y respetan la fiabilidad de los minutos', () => {
    const temporadas = agrupaHistorial([...CAMBIO_DE_CLUB]);
    const [temporada] = temporadas;
    expect(temporada!.totales).toMatchObject({ partidos: 3, titularidades: 2, goles: 0 });
    expect(temporada!.totales.minutos).toBe(1181);
    expect(temporada!.totales.minutosFiables).toBe(true);
  });
});

describe('historial: resumen y textos', () => {
  it('resume temporadas, equipos, clubes, federaciones y totales', () => {
    const resumen = resumenDeCarrera(agrupaHistorial([...CAMBIO_DE_CLUB, ...MISMO_CLUB_DISJUNTO]));
    expect(resumen).toMatchObject({
      temporadas: 2,
      equipos: 4,
      clubes: 3,
      federaciones: ['Castilla y León'],
      partidos: 5,
    });
  });

  it('las fechas de un tramo se escriben en castellano', () => {
    expect(textoDeFechas('2015-08-21', '2016-02-20')).toBe('21 ago – 20 feb');
    expect(textoDeFechas('2016-03-13', '2016-03-13')).toBe('13 mar');
    expect(textoDeFechas(null, null)).toBeNull();
  });

  it('los minutos y las tarjetas se escriben sin ceros que no significan cero', () => {
    expect(textoDeMinutos({ minutos: 1182, minutosFiables: true, minutosEstimados: null })).toBe('1182′');
    expect(textoDeMinutos({ minutos: null, minutosFiables: false, minutosEstimados: 750 })).toBe('Sin datos');
    expect(textoDeTarjetas({ amarillas: 2, rojas: 1 })).toBe('A 2 · R 1');
    expect(textoDeTarjetas({ amarillas: 0, rojas: 0 })).toBe('Sin tarjetas');
  });

  it('el título de la pestaña dice el jugador y el historial', () => {
    expect(tituloDeHistorial('SÁNCHEZ GUTIÉRREZ, ALEJANDRO')).toBe('SÁNCHEZ GUTIÉRREZ, ALEJANDRO · Historial — Fondo Popular');
  });
});

/* ── Render ─────────────────────────────────────────────────────────────────────────────────────── */

describe('historial: la tabla por temporada y equipo', () => {
  const temporadas = agrupaHistorial([
    ...CAMBIO_DE_CLUB,
    ...MISMO_CLUB_DISJUNTO,
    ...SIMULTANEOS,
    aparicion({ match_id: 99, team_entry_id: 700, temporada: '2018-19', fecha: '2018-09-01', minutos_exactos: null, minutos_estimados: 500, minutos_fiables: false }),
  ]);

  it('una sección por temporada con una tabla por equipo y enlaces a equipo, club y competición', () => {
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas }));
    expect(html).toContain('2018-19');
    expect(html).toContain('2017-18');
    expect(html).toContain('2015-16');
    expect(html).toContain('U.M. Escobedo');
    expect(html).toContain('Internacional F.C.');
    expect(html).toContain('href="/explorar/equipo/100"');
    expect(html).toContain('href="/explorar/club/983"');
    expect(html).toContain('href="/explorar/competicion/10"');
    expect(html).toContain('<table');
    expect(html).toContain('scope="col"');
    expect(html).not.toContain('<img');
    sinTextoProhibido(html);
  });

  it('marca los cambios de temporada: cambio de club y cambio de equipo del mismo club', () => {
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas }));
    expect(html).toContain('Cambio de club');
    expect(html).toContain('Cambio de equipo');
    // Dos equipos del mismo club con fechas solapadas son cantera: no se avisa de nada (regla de David).
    expect(html).not.toContain('Dos equipos a la vez');
    expect(html).not.toContain('Dos clubes a la vez');
    // Un cambio de club no se presenta como si fuera del mismo club.
    expect(html).toContain('U.M. Escobedo');
    expect(html).toContain('Internacional F.C.');
  });

  it('avisa de «dos clubes a la vez» cuando el solape es entre clubes distintos', () => {
    const dosClubes = [
      aparicion({ match_id: 40, team_entry_id: 800, temporada: '2022-23', fecha: '2022-09-10', equipo: 'C.D. Uno', club_id: 11, club: 'C.D. Uno' }),
      aparicion({ match_id: 41, team_entry_id: 800, temporada: '2022-23', fecha: '2023-02-11', equipo: 'C.D. Uno', club_id: 11, club: 'C.D. Uno' }),
      aparicion({ match_id: 42, team_entry_id: 801, temporada: '2022-23', fecha: '2023-01-14', equipo: 'C.D. Dos', club_id: 12, club: 'C.D. Dos' }),
    ];
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas: agrupaHistorial(dosClubes) }));
    expect(html).toContain('Dos clubes a la vez');
  });

  it('sin minutos fiables lo dice, no pinta un cero', () => {
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas }));
    expect(html).toContain('Sin datos');
    expect(html).not.toMatch(/>0′</);
  });

  it('sin historial lo dice explícitamente', () => {
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas: [] }));
    expect(html).toContain('Sin historial de partidos publicado.');
    expect(html).not.toContain('<table');
    sinTextoProhibido(html);
  });
});

describe('historial: el resumen', () => {
  it('enseña los totales de carrera con minutos fiables o «Sin datos»', () => {
    const conMinutos = resumenDeCarrera(agrupaHistorial([
      aparicion({ match_id: 1, team_entry_id: 800, temporada: '2020-21', fecha: '2020-09-01', minutos_exactos: 900, minutos_estimados: 900, minutos_fiables: true, goles: 2 }),
    ]));
    const html = renderToStaticMarkup(createElement(ResumenHistorial, { resumen: conMinutos }));
    expect(html).toContain('Temporadas');
    expect(html).toContain('Equipos');
    expect(html).toContain('Partidos');
    expect(html).toContain('900′');
    expect(html).toContain('2');
    sinTextoProhibido(html);

    const sinDatos = resumenDeCarrera([]);
    const vacio = renderToStaticMarkup(createElement(ResumenHistorial, { resumen: sinDatos }));
    expect(vacio).toContain('Sin datos');
  });
});

/* ── Contrato contra el canónico real ──────────────────────────────────────────────────────────── */

describe('contrato estático de la consulta del historial', () => {
  it('lleva LIMIT, va por índice y no interpola valores', () => {
    expect(HISTORIAL_DE_JUGADOR.sql.toLowerCase()).toContain('limit');
    expect(HISTORIAL_DE_JUGADOR.plan).toBe('indexado');
    expect(HISTORIAL_DE_JUGADOR.sql).not.toContain('${');
    expect(HISTORIAL_DE_JUGADOR.columnas).toContain('apariciones');
    expect(HISTORIAL_DE_JUGADOR.columnas).toContain('persona_id');
  });
});

describe.skipIf(!hayCanonico)('historial contra el canónico real', () => {
  it('la persona 122 tiene su historial completo: varias temporadas, todas sus apariciones publicadas', async () => {
    const fila = await historialReal(PERSONA);
    expect(fila).toBeDefined();
    expect(fila!.persona_id).toBe(PERSONA);
    expect(fila!.nombre_mostrado).toBe('CAMINERO FERNANDEZ, RODRIGO');
    expect(fila!.identidad_nominal).toBe(false);
    // El canónico crece con la importación: se comprueba que no viene truncado, no un número exacto.
    expect(fila!.apariciones.length).toBeGreaterThanOrEqual(100);

    const temporadas = agrupaHistorial(fila!.apariciones);
    expect(temporadas.length).toBeGreaterThanOrEqual(6);
    expect(temporadas.flatMap((t) => t.tramos).length).toBeGreaterThanOrEqual(8);
    for (const tramo of temporadas.flatMap((t) => t.tramos)) {
      expect(tramo.partidos).toBeGreaterThan(0);
    }
  });

  it('refleja el cambio real de club a mitad de la 2023-24 (Palencia → Carrión)', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const temporada = temporadas.find((t) => t.temporada === '2023-24')!;
    expect(temporada.tramos.length).toBeGreaterThanOrEqual(3);
    expect(temporada.tramos.some((tramo) => /palencia/i.test(tramo.club))).toBe(true);
    expect(temporada.tramos.some((tramo) => /carri/i.test(tramo.club))).toBe(true);
    // El cambio de club es de los que se avisan, y se fecha con el primer partido del club nuevo.
    const cambio = temporada.transiciones.find((transicion) => transicion.tipo === 'cambio-club');
    expect(cambio).toBeDefined();
    expect(cambio!.fecha).toBe('2024-02-03');
    const cambios = cambiosAMitadDeTemporada(temporadas);
    expect(cambios.some((c) => c.temporada === '2023-24' && c.tipo === 'cambio-club')).toBe(true);
  });

  it('refleja varios equipos del mismo club en la misma temporada como cambio de equipo', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const t2023 = temporadas.find((t) => t.temporada === '2023-24')!;
    // Palencia C.F. tiene dos inscripciones (equipos) en la 2023-24: es cambio de equipo, no de club.
    const palencia = t2023.tramos.filter((tramo) => /palencia/i.test(tramo.club));
    expect(palencia.length).toBeGreaterThanOrEqual(2);
    expect(new Set(palencia.map((tramo) => tramo.clubId)).size).toBe(1);
    const cambioEquipo = t2023.transiciones.find((transicion) => transicion.tipo === 'cambio-equipo');
    expect(cambioEquipo).toBeDefined();
    expect(cambioEquipo!.fecha).not.toBeNull();
  });

  it('una persona con dos equipos del mismo club solapados (19057) NO se marca como dos clubes', async () => {
    const fila = await historialReal(PERSONA_MISMO_CLUB);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const t = temporadas.find((temporada) => temporada.temporada === '2023-24')!;
    expect(t.tramos).toHaveLength(2);
    expect(new Set(t.tramos.map((tramo) => tramo.club)).size).toBe(1);
    // Mismo club: no hay aviso de dos clubes a la vez (es cantera).
    expect(t.transiciones.filter((transicion) => transicion.tipo === 'simultaneo')).toEqual([]);
  });

  it('los minutos de la persona son fiables y no se multiplican por partido', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const t2023 = temporadas.find((t) => t.temporada === '2023-24')!;
    // Segunda inscripción de Palencia en la 2023-24: 17 partidos y 802 minutos del equipo-temporada,
    // no 17 × 802.
    const tramo = t2023.tramos.find((candidato) => candidato.equipoId === 124028)!;
    expect(tramo).toBeDefined();
    expect(tramo.partidos).toBeGreaterThan(5);
    expect(tramo.minutosFiables).toBe(true);
    expect(tramo.minutos).toBe(802);
    const minutosPorPartido = (tramo.minutos ?? 0) / tramo.partidos;
    expect(minutosPorPartido).toBeGreaterThan(10);
    expect(minutosPorPartido).toBeLessThan(100);
  });

  it('una persona sin apariciones en CyL no devuelve fila; un id inexistente tampoco', async () => {
    expect(await historialReal(PERSONA_SIN_APARICIONES)).toBeUndefined();
    expect(await historialReal(999999999)).toBeUndefined();
  });

  it('una persona de otra federación no se publica: el historial no devuelve fila', async () => {
    // 1181455 tiene todas sus apariciones en Cantabria. La fase C publica sólo CyL, así que no hay
    // fila pública que enseñar.
    expect(await historialReal(PERSONA_DE_OTRA_FEDERACION)).toBeUndefined();
  });
});
