import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CONSULTAS_HISTORIAL, HISTORIAL_DEL_CLUB, HISTORIAL_DEL_EQUIPO, PARAMETROS_HISTORIAL,
  type FilaHistorialClub, type FilaHistorialEquipo,
} from '../src/consultas/historial-equipos';
import {
  estadoDeTemporada, etiquetaDeEquipoDeClub, etiquetaDeLineaDeEquipo, filaAncla, filasDeEquiposDelClub,
  historialDeEquipo, masRecientePrimero, movimientoLegible, puestoDeFila, resumenDeClubEnHistorial,
  resumenDeHistorial, resumenDeTemporadaDelClub, signosDeRacha, temporadasDelClub,
} from '../src/lib/historial-equipos';
import PaginaHistorialEquipo from '../src/app/explorar/equipo/[id]/historial/page';
import PaginaHistorialClub from '../src/app/explorar/club/[id]/historial/page';

/**
 * Historiales de equipo y de club: lo que ve el usuario, con datos reales de Castilla y León.
 *
 * Se usan dos entidades REALES del canónico, las mismas de las fichas:
 *  · equipo **2526** (`C. y D. Leonesa S.A.D. "B"`, Liga Nacional Juvenil 2025-26): su línea tiene
 *    cuatro temporadas publicadas (2026-27, 2025-26, 2021-22 y 2013-14).
 *  · club **16** (`Ciudad Rodrigo C.F.`): 13 temporadas con equipos publicados y 14 equipos en la
 *    temporada en curso, con filiales «B» y «C» y categorías distintas.
 *
 * Se defienden las mismas cosas que en las fichas:
 *  1. **Desconocido ≠ 0**: sin puesto no hay «0.º»; sin goles publicados no hay «0 goles».
 *  2. **La temporada en curso no es una temporada terminada**: su puesto es provisional.
 *  3. **Sin textos internos** (DOCTRINA-CALIDAD §8).
 *  4. **404 de verdad** para un id que no existe, y «sin equipos» para un club vacío (que no es 404).
 *  5. **Una consulta por pantalla**: la cabecera viaja en la misma consulta que las filas.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Filas fabricadas para probar las reglas sin base de datos
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function filaEquipo(parcial: Partial<FilaHistorialEquipo> = {}): FilaHistorialEquipo {
  return {
    equipo_id: 1, equipo: 'C. y D. Leonesa S.A.D. "B"', club_id: 1516, club: 'C. y D. Leonesa S.A.D.',
    federacion: 'castilla-leon', federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
    tiene_escudo: true, temporada: '2025-26', temporada_orden: 2025, edicion_id: 797,
    edicion: 'Liga Nacional Juvenil', edicion_categoria: 'juvenil', edicion_genero: 'masculina',
    edicion_ambito: 'nacional', edicion_division: 'liga-nacional', edicion_nivel: 2, edicion_estado: 'publicada',
    grupo_id: 797, grupo: 'Primera - III', jornadas_previstas: 30, letra: 'B', linea: '1516|juvenil|masculina|desconocida|B',
    equipos: 16, posicion_linea: null, origen_posicion: null, movimiento: null, jugo_fase_ascenso: false,
    posicion_oficial: null, jornada_oficial: null, jugados: null, ganados: null, empatados: null, perdidos: null,
    goles_favor: null, goles_contra: null, puntos: null, partidos_cubiertos: null, ultima_jornada: null,
    ultimo_partido_id: null, ultima_fecha: null, racha: null,
    ...parcial,
  };
}

function filaClub(parcial: Partial<FilaHistorialClub> = {}): FilaHistorialClub {
  return {
    club_id: 16, club: 'Ciudad Rodrigo C.F.', municipio: null, provincia: null,
    federacion: 'castilla-leon', federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
    tiene_escudo: true, equipo_id: 8905, equipo: 'Ciudad Rodrigo C.F.', equipo_temporada_id: 8873,
    equipo_temporada: 'Ciudad Rodrigo C.F.', temporada: '2026-27', temporada_orden: 2026, edicion_id: 2941,
    edicion: '1ª División Regional de Aficionados', edicion_categoria: 'aficionados', edicion_genero: 'masculina',
    edicion_ambito: 'regional', edicion_division: 'primera', edicion_nivel: 5, grupo_id: 2941,
    grupo: 'Primera - B', jornadas_previstas: 30, grupo_tipo: 'liga', letra: 'A',
    linea: '16|aficionados|masculina|desconocida|A', equipos: 16, posicion_linea: null, puntos_linea: null,
    origen_posicion: null,
    movimiento: null, jugo_fase_ascenso: false, posicion_oficial: null, jornada_oficial: null,
    jugados: null, ganados: null, empatados: null, perdidos: null, goles_favor: null, goles_contra: null,
    puntos_resumen: null, partidos_cubiertos: null, ultima_jornada: null, ultimo_partido_id: null, total: 1,
    ...parcial,
  };
}

const render = (elemento: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(elemento);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Contrato estático de las consultas
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('contrato estático de las consultas del historial', () => {
  it('cada consulta declara nombre, descripción, presupuesto, plan, columnas y parámetros por defecto', () => {
    for (const consulta of CONSULTAS_HISTORIAL) {
      expect(consulta.nombre.length).toBeGreaterThan(0);
      expect(consulta.descripcion.length).toBeGreaterThan(20);
      expect(consulta.presupuestoMs).toBeGreaterThan(0);
      expect(consulta.plan).toBe('indexado');
      expect(consulta.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_HISTORIAL[consulta.nombre], `${consulta.nombre} sin parámetros por defecto`).toBeDefined();
    }
  });

  it('todas llevan LIMIT, usan parámetros numerados y no interpolan valores de usuario', () => {
    for (const consulta of CONSULTAS_HISTORIAL) {
      expect(consulta.sql.toLowerCase(), `${consulta.nombre} sin LIMIT`).toContain('limit');
      expect(consulta.sql, `${consulta.nombre} sin $1`).toContain('$1');
      // La única interpolación admitida es la lista de federaciones excluidas (ya viene validada y sin `${`).
      expect(consulta.sql, `${consulta.nombre} interpola una plantilla`).not.toContain('${');
      expect(/(['"`])\s*\+\s*\w/.test(consulta.sql), `${consulta.nombre} concatena texto`).toBe(false);
    }
  });

  it('el historial del club no pide una fila por equipo: el club viaja en la misma consulta', () => {
    expect(HISTORIAL_DEL_CLUB.sql).toContain('left join equipos');
    // Y una fila por inscripción, no por team_season colapsado.
    expect(HISTORIAL_DEL_CLUB.sql).toContain('core.team_entry');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Reglas puras
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('reglas del historial: la racha y el puesto', () => {
  it('la racha se lee del más antiguo al más reciente y descarta signos que no conoce', () => {
    expect(signosDeRacha(null)).toEqual([]);
    expect(signosDeRacha(undefined)).toEqual([]);
    expect(signosDeRacha([])).toEqual([]);
    expect(signosDeRacha(['P', 'G', 'E'])).toEqual(['E', 'G', 'P']);
    expect(signosDeRacha(['X', 'G', 'P'])).toEqual(['P', 'G']);
  });

  it('el puesto prefiere el de la línea y, si falta, el del último parte oficial', () => {
    expect(puestoDeFila(filaEquipo({ posicion_linea: 1, equipos: 16, origen_posicion: 'oficial' })))
      .toEqual({ posicion: 1, de: 16, origen: 'publicada' });
    expect(puestoDeFila(filaEquipo({ posicion_linea: 3, equipos: 18, origen_posicion: 'reconstruida' })))
      .toEqual({ posicion: 3, de: 18, origen: 'calculada' });
    // Sin línea, el último parte oficial (el de la clasificación publicada por la federación).
    expect(puestoDeFila(filaEquipo({ posicion_oficial: 9, equipos: null })))
      .toEqual({ posicion: 9, de: null, origen: 'publicada' });
    // Y sin ninguno de los dos, no hay puesto: no es 0.º.
    expect(puestoDeFila(filaEquipo())).toBeNull();
  });

  it('sin puesto no se inventa una posición, y una temporada sin jornadas previstas no dice «en juego»', () => {
    expect(estadoDeTemporada(filaEquipo(), true)).toBe('sin-datos');
    expect(estadoDeTemporada(filaEquipo({ jugados: 4, jornadas_previstas: null }), true)).toBe('sin-datos');
    expect(estadoDeTemporada(filaEquipo({ jugados: 4, jornadas_previstas: 30 }), true)).toBe('en-juego');
    expect(estadoDeTemporada(filaEquipo({ jugados: 4, jornadas_previstas: 30 }), false)).toBe('final');
    expect(estadoDeTemporada(filaEquipo({ jugados: 30, jornadas_previstas: 30 }), true)).toBe('final');
  });

  it('el movimiento se dice en palabras y lo desconocido no se pinta', () => {
    expect(movimientoLegible('asciende')).toBe('Asciende');
    expect(movimientoLegible('desciende')).toBe('Desciende');
    expect(movimientoLegible('mantiene')).toBe('Se mantiene');
    expect(movimientoLegible('desconocido')).toBeNull();
    expect(movimientoLegible(null)).toBeNull();
  });
});

describe('reglas del historial: cómo se llama la línea de un equipo', () => {
  it('la línea lleva categoría y letra del filial, y el femenino cuando lo es', () => {
    expect(etiquetaDeLineaDeEquipo(filaEquipo({ edicion_categoria: 'juvenil', letra: 'B' }))).toBe('Juvenil B');
    expect(etiquetaDeLineaDeEquipo(filaEquipo({ edicion_categoria: 'alevin', letra: 'A' }))).toBe('Alevín');
    expect(etiquetaDeLineaDeEquipo(filaEquipo({ edicion_categoria: 'alevin', letra: null }))).toBe('Alevín');
    expect(etiquetaDeLineaDeEquipo(filaEquipo({ edicion_categoria: 'alevin', letra: 'B', edicion_genero: 'femenina' })))
      .toBe('Alevín B femenino');
    // Un vocabulario que no se conoce no se disfraza.
    expect(etiquetaDeLineaDeEquipo(filaEquipo({ edicion_categoria: 'inventada', letra: 'A' }))).toBe('inventada');
  });
});

describe('reglas del historial: resumen y temporadas', () => {
  it('el resumen suma sólo lo publicado: sin goles conocidos no hay «0 goles»', () => {
    const conGoles = resumenDeHistorial([
      filaEquipo({ temporada: '2025-26', temporada_orden: 2025, jugados: 30, goles_favor: 67, goles_contra: 29, posicion_linea: 1, equipos: 16 }),
      filaEquipo({ temporada: '2013-14', temporada_orden: 2013, jugados: 27, goles_favor: 49, goles_contra: 55, posicion_linea: 9, equipos: 14 }),
    ]);
    expect(conGoles.temporadas).toBe(2);
    expect(conGoles.partidos).toBe(57);
    expect(conGoles.golesFavor).toBe(116);
    expect(conGoles.golesContra).toBe(84);
    expect(conGoles.mejorPuesto?.posicion).toBe(1);
    expect(conGoles.primeraTemporada).toBe('2013-14');
    expect(conGoles.ultimaTemporada).toBe('2025-26');

    const sinDatos = resumenDeHistorial([filaEquipo()]);
    expect(sinDatos.partidos).toBeNull();
    expect(sinDatos.golesFavor).toBeNull();
    expect(sinDatos.golesContra).toBeNull();
    expect(sinDatos.mejorPuesto).toBeNull();
    expect(resumenDeHistorial([]).temporadas).toBe(0);
  });

  it('el historial del equipo va de la temporada más reciente a la más antigua y marca la que está en juego', () => {
    const historial = historialDeEquipo([
      filaEquipo({ equipo_id: 1, temporada: '2013-14', temporada_orden: 2013, jugados: 27, jornadas_previstas: 26, posicion_linea: 9 }),
      filaEquipo({ equipo_id: 2, temporada: '2025-26', temporada_orden: 2025, jugados: 30, jornadas_previstas: 30, posicion_linea: 1, movimiento: 'mantiene' }),
      filaEquipo({ equipo_id: 3, temporada: '2026-27', temporada_orden: 2026, jugados: 4, jornadas_previstas: 30, posicion_linea: 8, racha: ['P', 'G'] }),
    ]);
    expect(historial.temporadas.map((t) => t.fila.temporada)).toEqual(['2026-27', '2025-26', '2013-14']);
    expect(historial.temporadas[0]!.estado).toBe('en-juego');
    expect(historial.temporadas[0]!.racha).toEqual(['G', 'P']);
    expect(historial.temporadas[1]!.estado).toBe('final');
    expect(historial.temporadas[1]!.movimiento).toBe('Se mantiene');
    expect(historial.resumen.enJuego).toBe(1);
    expect(masRecientePrimero([{ temporada_orden: 2013 }, { temporada_orden: 2026 }])[0]!.temporada_orden).toBe(2026);
    expect(filaAncla([filaEquipo({ equipo_id: 9 })], 9)?.equipo_id).toBe(9);
    expect(filaAncla([filaEquipo({ equipo_id: 9 })], 404)?.equipo_id).toBe(9);
    expect(filaAncla([], 404)).toBeUndefined();
  });

  it('el club agrupa por temporada, cuenta equipos y categorías y no inventa una temporada vacía', () => {
    const filas = [
      filaClub({ equipo_id: 1, temporada: '2026-27', temporada_orden: 2026, edicion_categoria: 'alevin', letra: 'A', jugados: 3, jornadas_previstas: 26 }),
      filaClub({ equipo_id: 2, temporada: '2026-27', temporada_orden: 2026, edicion_categoria: 'alevin', letra: 'B', jugados: 3, jornadas_previstas: 26 }),
      filaClub({ equipo_id: 3, temporada: '2026-27', temporada_orden: 2026, edicion_categoria: 'benjamin', letra: 'A', jugados: 3, jornadas_previstas: 26 }),
      filaClub({ equipo_id: 4, temporada: '2025-26', temporada_orden: 2025, edicion_categoria: 'alevin', letra: 'A', jugados: 26, jornadas_previstas: 26, movimiento: 'asciende' }),
      filaClub({ equipo_id: 5, temporada: '2025-26', temporada_orden: 2025, edicion_categoria: 'alevin', letra: 'B', jugados: 26, jornadas_previstas: 26, movimiento: 'desciende' }),
    ];
    const temporadas = temporadasDelClub(filas);
    expect(temporadas.map((t) => t.temporada)).toEqual(['2026-27', '2025-26']);
    expect(temporadas[0]!.resumen.equipos).toBe(3);
    expect(temporadas[0]!.resumen.categorias).toBe(2);
    expect(temporadas[0]!.enJuego).toBe(true);
    expect(temporadas[1]!.enJuego).toBe(false);
    expect(temporadas[1]!.resumen.ascensos).toBe(1);
    expect(temporadas[1]!.resumen.descensos).toBe(1);

    expect(temporadasDelClub([])).toEqual([]);
    expect(temporadasDelClub([filaClub({ equipo_id: null, equipo: null, temporada: null, temporada_orden: null })])).toEqual([]);
    expect(filasDeEquiposDelClub([filaClub({ equipo_id: null, equipo: null })])).toEqual([]);
    expect(resumenDeTemporadaDelClub([]).equipos).toBe(0);
    expect(resumenDeTemporadaDelClub([]).mejorPuesto).toBeNull();
  });

  it('las etiquetas de los equipos de un club distinguen categoría, filial y femenino', () => {
    const etiquetas = [
      filaClub({ edicion_categoria: 'alevin', letra: 'A' }),
      filaClub({ edicion_categoria: 'alevin', letra: 'B' }),
      filaClub({ edicion_categoria: 'alevin', letra: 'A', edicion_genero: 'femenina' }),
      filaClub({ edicion_categoria: 'benjamin', letra: 'C' }),
    ].map(etiquetaDeEquipoDeClub);
    expect(etiquetas).toEqual(['Alevín', 'Alevín B', 'Alevín femenino', 'Benjamín C']);
    expect(new Set(etiquetas).size).toBe(4);
  });

  it('el resumen del club cuenta temporadas, equipos y categorías sin convertir huecos en ceros', () => {
    const resumen = resumenDeClubEnHistorial([
      filaClub({ equipo_id: 1, temporada: '2026-27', temporada_orden: 2026, edicion_categoria: 'alevin', letra: 'A', posicion_oficial: 9 }),
      filaClub({ equipo_id: 2, temporada: '2026-27', temporada_orden: 2026, edicion_categoria: 'benjamin', letra: 'A' }),
      filaClub({ equipo_id: 3, temporada: '2025-26', temporada_orden: 2025, edicion_categoria: 'alevin', letra: 'A', posicion_oficial: 3 }),
    ]);
    expect(resumen.temporadas).toBe(2);
    expect(resumen.equipos).toBe(3);
    expect(resumen.categorias).toBe(2);
    expect(resumen.mejorPuesto?.posicion).toBe(3);
    expect(resumen.primeraTemporada).toBe('2025-26');
    expect(resumen.ultimaTemporada).toBe('2026-27');
    expect(resumenDeClubEnHistorial([]).equipos).toBe(0);
    expect(resumenDeClubEnHistorial([]).mejorPuesto).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Contrato contra el canónico real
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('contrato contra el canónico real', () => {
  it('el historial del equipo 2526 trae cuatro temporadas, la actual en juego y la 2025-26 con su puesto final', async () => {
    const filas = await consulta<FilaHistorialEquipo>(HISTORIAL_DEL_EQUIPO.sql, [2526]);
    expect(filas.length).toBe(4);
    expect(Object.keys(filas[0]!).sort()).toEqual([...HISTORIAL_DEL_EQUIPO.columnas].sort());
    for (const fila of filas) {
      expect(fila.club).toBe('C. y D. Leonesa S.A.D.');
      expect(fila.letra).toBe('B');
      expect(fila.tiene_escudo).toBe(true);
    }
    const porTemporada = new Map(filas.map((fila) => [fila.temporada, fila]));
    expect([...porTemporada.keys()]).toEqual(['2026-27', '2025-26', '2021-22', '2013-14']);

    const pasada = porTemporada.get('2025-26')!;
    expect(pasada.equipo_id).toBe(2526);
    expect(pasada.jugados).toBe(30);
    expect(pasada.jornadas_previstas).toBe(30);
    expect(pasada.goles_favor).toBe(67);
    expect(pasada.goles_contra).toBe(29);
    expect(pasada.posicion_linea).toBe(1);
    expect(pasada.origen_posicion).toBe('oficial');
    expect(pasada.jornadas_previstas).toBe(30);
    expect(pasada.grupo_id).toBe(797);
    expect(pasada.ultima_jornada).toBe(30);
    expect(Number(pasada.ultimo_partido_id)).toBeGreaterThan(0);
    expect(signosDeRacha(pasada.racha).length).toBe(5);

    const actual = porTemporada.get('2026-27')!;
    expect(actual.equipo_id).toBe(17614);
    // La temporada en curso crece con la importación: cota, no un número clavado.
    expect(actual.jugados).toBeGreaterThanOrEqual(4);
    expect(actual.jornadas_previstas).toBe(30);
    expect(actual.posicion_linea).toBe(8);
    // La racha enseña como mucho los cinco últimos: con más partidos jugados no se alarga.
    expect(signosDeRacha(actual.racha).length).toBe(Math.min(5, actual.jugados!));

    const historial = historialDeEquipo(filas);
    expect(historial.temporadas.map((t) => t.fila.temporada)).toEqual(['2026-27', '2025-26', '2021-22', '2013-14']);
    expect(historial.temporadas[0]!.estado).toBe('en-juego');
    expect(historial.temporadas[1]!.estado).toBe('final');
    expect(historial.temporadas[1]!.puesto).toEqual({ posicion: 1, de: 16, origen: 'publicada' });
    expect(historial.resumen.temporadas).toBe(4);
    expect(historial.resumen.enJuego).toBe(1);
    expect(filaAncla(filas, 2526)!.temporada).toBe('2025-26');
    expect(filaAncla(filas, 999999998)!.equipo_id).toBe(17614);
  });

  it('un equipo sin fila de línea no deja la página vacía: usa el último parte oficial del grupo', async () => {
    const filas = await consulta<FilaHistorialEquipo>(HISTORIAL_DEL_EQUIPO.sql, [20488]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.linea).toBeNull();
    expect(filas[0]!.temporada).toBe('2026-27');
    const puesto = puestoDeFila(filas[0]!);
    expect(puesto?.origen).toBe('publicada');
    expect(puesto?.posicion).toBeGreaterThan(0);
  });

  it('un equipo que no existe no devuelve filas: la página puede dar un 404 de verdad', async () => {
    expect(await consulta(HISTORIAL_DEL_EQUIPO.sql, [999999998])).toHaveLength(0);
  });

  it('el historial del club 16 trae sus 14 equipos de la temporada en curso y distingue filiales', async () => {
    const filas = await consulta<FilaHistorialClub>(HISTORIAL_DEL_CLUB.sql, [16, 1200]);
    expect(filas.length).toBeGreaterThanOrEqual(100);
    expect(Object.keys(filas[0]!).sort()).toEqual([...HISTORIAL_DEL_CLUB.columnas].sort());
    expect(new Set(filas.map((fila) => fila.club_id))).toEqual(new Set([16]));
    expect(new Set(filas.map((fila) => fila.club))).toEqual(new Set(['Ciudad Rodrigo C.F.']));
    expect(filas[0]!.total).toBe(filas.length);

    const temporadas = temporadasDelClub(filas);
    expect(temporadas.map((t) => t.temporada)).toContain('2026-27');
    expect(temporadas.length).toBeGreaterThanOrEqual(10);

    const actual = temporadas.find((t) => t.temporada === '2026-27')!;
    expect(actual.resumen.equipos).toBe(14);
    expect(actual.resumen.categorias).toBeGreaterThanOrEqual(6);
    expect(actual.enJuego).toBe(true);
    expect(actual.equipos.some((equipo) => equipo.letra === 'B')).toBe(true);
    expect(actual.equipos.some((equipo) => (equipo.equipo ?? '').includes('"B"'))).toBe(true);
    // Todos los equipos de la temporada son distintos y tienen etiqueta.
    expect(new Set(actual.equipos.map((equipo) => equipo.equipo_id)).size).toBe(14);
    const etiquetas = actual.equipos.map(etiquetaDeEquipoDeClub);
    expect(etiquetas.every((etiqueta) => etiqueta.length > 0)).toBe(true);
    expect(new Set(etiquetas).size).toBe(14);

    const resumen = resumenDeClubEnHistorial(filas);
    expect(resumen.temporadas).toBe(temporadas.length);
    expect(resumen.equipos).toBe(filasDeEquiposDelClub(filas).length);
    expect(resumen.ultimaTemporada).toBe('2026-27');
    expect(resumen.mejorPuesto?.posicion).toBeGreaterThan(0);
  });

  it('un club sin equipos publicados devuelve una fila con el club y los equipos a null, no 404', async () => {
    // Club real de CyL que no tiene ninguna inscripción publicada.
    const filas = await consulta<FilaHistorialClub>(HISTORIAL_DEL_CLUB.sql, [52183, 1200]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.club).toBeTruthy();
    expect(filas[0]!.equipo_id).toBeNull();
    expect(filas[0]!.temporada).toBeNull();
    expect(filasDeEquiposDelClub(filas)).toEqual([]);
    expect(temporadasDelClub(filas)).toEqual([]);
    expect(resumenDeClubEnHistorial(filas).equipos).toBe(0);
  });

  it('un club de otra federación no se publica: la consulta no devuelve filas', async () => {
    // 39611 es la AURRERA GASTEIZ FUTSAL (Euskadi): con la publicación limitada a CyL, para esta web
    // no existe (404 de verdad), aunque el canónico tenga su ficha.
    expect(await consulta(HISTORIAL_DEL_CLUB.sql, [39611, 1200])).toHaveLength(0);
  });

  it('un club que no existe no devuelve filas', async () => {
    expect(await consulta(HISTORIAL_DEL_CLUB.sql, [999999998, 1200])).toHaveLength(0);
  });

  it('las consultas respetan su presupuesto declarado (medido en caliente, mediana de tres)', async () => {
    const medir = async (sql: string, parametros: readonly unknown[], presupuesto: number, etiqueta: string) => {
      await consulta(sql, parametros); // calentar la caché de PostgreSQL y del driver
      const tiempos: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const inicio = performance.now();
        await consulta(sql, parametros);
        tiempos.push(performance.now() - inicio);
      }
      tiempos.sort((a, b) => a - b);
      const mediana = tiempos[1]!;
      expect(mediana, `${etiqueta}: mediana ${mediana.toFixed(1)} ms`).toBeLessThan(presupuesto);
      return mediana;
    };
    await medir(HISTORIAL_DEL_EQUIPO.sql, [2526], HISTORIAL_DEL_EQUIPO.presupuestoMs, 'historial del equipo 2526');
    await medir(HISTORIAL_DEL_CLUB.sql, [16, 1200], HISTORIAL_DEL_CLUB.presupuestoMs, 'historial del club 16');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Las páginas: render, 404 real y textos que no se enseñan
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const TEXTO_PROHIBIDO = /can[óo]nico|\bsql\b|n\+1|endpoint|\btoken\b|cach[ée]|migraci[óo]n|reconstruid|se calcula|se obtiene de|consulta interna|servidor/i;

describe('las páginas del historial', () => {
  it('el id que no existe responde 404 de verdad en las dos rutas', async () => {
    for (const pagina of [PaginaHistorialEquipo, PaginaHistorialClub]) {
      await expect((pagina as (p: { params: Promise<{ id: string }> }) => Promise<unknown>)({ params: Promise.resolve({ id: '999999998' }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
    for (const pagina of [PaginaHistorialEquipo, PaginaHistorialClub]) {
      await expect((pagina as (p: { params: Promise<{ id: string }> }) => Promise<unknown>)({ params: Promise.resolve({ id: 'abc' }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
  });

  it.skipIf(!hayCanonico)('el historial del equipo 2526 se pinta con sus temporadas, puestos y enlaces sin textos internos', async () => {
    const html = render(await PaginaHistorialEquipo({ params: Promise.resolve({ id: '2526' }) }));
    expect(html).toContain('C. y D. Leonesa');
    expect(html).toContain('2025-26');
    expect(html).toContain('2026-27');
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('En juego');
    expect(html).toContain('/explorar/equipo/2526');
    expect(html).toContain('/explorar/equipo/17614');
    expect(html).toContain('/explorar/competicion/797');
    expect(html).toContain('/explorar/competicion/797/jornada/30');
    expect(html).toContain('/explorar/acta/16940');
    expect(html).toMatch(/puesto|posici[óo]n/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('el historial del club 16 se pinta con los equipos de cada temporada y sus dos enlaces', async () => {
    const html = render(await PaginaHistorialClub({ params: Promise.resolve({ id: '16' }) }));
    expect(html).toContain('Ciudad Rodrigo C.F.');
    expect(html).toContain('2026-27');
    expect(html).toContain('/explorar/equipo/8905');
    expect(html).toContain('/explorar/equipo/20488/historial');
    expect(html).toContain('/explorar/equipo/20541/historial');
    expect(html).toMatch(/equipos/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('un club sin equipos enseña el club y lo dice, en vez de una página rota o un cero', async () => {
    const html = render(await PaginaHistorialClub({ params: Promise.resolve({ id: '52183' }) }));
    expect(html).toContain('C.D. COLEGIOS DIOCESANOS B');
    expect(html).toMatch(/sin equipos|no hay equipos/i);
    // Sin equipos publicados no hay un cero que parezca una medición: se dice «sin datos».
    expect(html).toContain('Sin datos');
    expect(html).not.toMatch(/>0</);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });
});
