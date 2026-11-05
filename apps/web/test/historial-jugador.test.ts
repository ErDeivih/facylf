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
 *  · dos tramos con fechas solapadas NO son un cambio: son dos equipos a la vez;
 *  · partidos, titularidades, goles, tarjetas y minutos salen de las actas; los minutos sólo se
 *    enseñan si son fiables, y si no se dice «sin datos», nunca un cero;
 *  · identidad con contexto: si la identidad es nominal, la página lo avisa (la consulta trae la marca).
 *
 * La referencia real es la persona **1181455** (SÁNCHEZ GUTIÉRREZ, ALEJANDRO): 8 inscripciones en 6
 * temporadas, con un cambio real de club a mitad de la 2015-16 (U.M. Escobedo → Internacional F.C.) y
 * dos equipos del mismo club en 2016-17 y 2017-18. También se prueba 19057 (dos equipos del mismo club
 * con fechas solapadas) y una persona sin apariciones (917112).
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** Persona real con cambio de club a mitad de temporada y varios equipos del mismo club. */
const PERSONA = 1181455;
/** Persona real con dos equipos del mismo club y fechas solapadas (2023-24). */
const PERSONA_MISMO_CLUB = 19057;
/** Persona con eventos pero sin ninguna aparición registrada. */
const PERSONA_SIN_APARICIONES = 917112;

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

  it('dos tramos con fechas solapadas no son un cambio: son dos equipos a la vez', () => {
    const [temporada] = agrupaHistorial(SIMULTANEOS);
    expect(temporada!.transiciones).toHaveLength(1);
    expect(temporada!.transiciones[0]!.tipo).toBe('simultaneo');
    // Y no aparecen como «cambio» en la lista de cambios a mitad de temporada.
    expect(cambiosAMitadDeTemporada(agrupaHistorial(SIMULTANEOS))).toEqual([]);
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
    expect(tituloDeHistorial('SÁNCHEZ GUTIÉRREZ, ALEJANDRO')).toBe('SÁNCHEZ GUTIÉRREZ, ALEJANDRO · Historial — Cantera');
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

  it('marca los cambios de temporada: cambio de club, mismo club y dos equipos a la vez', () => {
    const html = renderToStaticMarkup(createElement(TablaHistorial, { temporadas }));
    expect(html).toContain('Cambio de club');
    expect(html).toContain('Cambio de equipo');
    expect(html).toContain('Dos equipos a la vez');
    // Un cambio de club no se presenta como si fuera del mismo club.
    expect(html).toContain('U.M. Escobedo');
    expect(html).toContain('Internacional F.C.');
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
  it('la persona 1181455 tiene 144 apariciones en 8 inscripciones y 6 temporadas', async () => {
    const fila = await historialReal(PERSONA);
    expect(fila).toBeDefined();
    expect(fila!.persona_id).toBe(PERSONA);
    expect(fila!.nombre_mostrado).toBe('SANCHEZ GUTIERREZ, ALEJANDRO');
    expect(fila!.identidad_nominal).toBe(false);
    expect(fila!.apariciones).toHaveLength(144);

    const temporadas = agrupaHistorial(fila!.apariciones);
    expect(temporadas).toHaveLength(5);
    expect(temporadas.flatMap((t) => t.tramos)).toHaveLength(8);
  });

  it('refleja el cambio real de club a mitad de la 2015-16 (Escobedo → Internacional)', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const temporada = temporadas.find((t) => t.temporada === '2015-16')!;
    expect(temporada.tramos).toHaveLength(2);
    expect(temporada.tramos[0]).toMatchObject({ club: 'U.M. ESCOBEDO', equipo: 'U.M. ESCOBEDO' });
    expect(temporada.tramos[1]).toMatchObject({ club: 'INTERNACIONAL F.C.', equipo: 'INTERNACIONAL F.C.' });
    expect(temporada.transiciones[0]).toMatchObject({ tipo: 'cambio-club', fecha: '2016-03-13' });
    const cambios = cambiosAMitadDeTemporada(temporadas);
    expect(cambios.length).toBeGreaterThanOrEqual(1);
    expect(cambios.some((c) => c.temporada === '2015-16' && c.tipo === 'cambio-club')).toBe(true);
  });

  it('refleja varios equipos del mismo club en la misma temporada, y un solape no se vende como cambio', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const t2017 = temporadas.find((t) => t.temporada === '2017-18')!;
    expect(t2017.tramos.map((t) => t.equipo).sort()).toEqual(['C.F. VIMENOR', 'C.F. VIMENOR "B"']);
    expect(t2017.transiciones[0]!.tipo).toBe('cambio-equipo');
    expect(t2017.transiciones[0]!.fecha).toBe('2017-09-10');
  });

  it('una persona con dos equipos del mismo club solapados (19057) se enseña como dos equipos a la vez', async () => {
    const fila = await historialReal(PERSONA_MISMO_CLUB);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const t = temporadas.find((temporada) => temporada.temporada === '2023-24')!;
    expect(t.tramos).toHaveLength(2);
    expect(new Set(t.tramos.map((tramo) => tramo.club)).size).toBe(1);
    expect(t.transiciones[0]!.tipo).toBe('simultaneo');
  });

  it('los minutos de la persona son fiables y no se multiplican por partido', async () => {
    const fila = await historialReal(PERSONA);
    const temporadas = agrupaHistorial(fila!.apariciones);
    const tramo2015 = temporadas.find((t) => t.temporada === '2015-16')!.tramos[0]!;
    // Escobedo: 5 partidos demostrados y 450 minutos exactos (no 5 × 450).
    expect(tramo2015.partidos).toBe(26);
    expect(tramo2015.minutos).toBe(450);
    expect(tramo2015.minutosFiables).toBe(true);
  });

  it('una persona sin apariciones devuelve una fila con la lista vacía; un id inexistente no devuelve fila', async () => {
    const sinApariciones = await historialReal(PERSONA_SIN_APARICIONES);
    expect(sinApariciones).toBeDefined();
    expect(sinApariciones!.apariciones).toEqual([]);
    expect(agrupaHistorial(sinApariciones!.apariciones)).toEqual([]);

    expect(await historialReal(999999999)).toBeUndefined();
  });
});
