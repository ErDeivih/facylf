/**
 * Fichas de jugador, equipo y club: lo que ve el usuario, con datos reales de Castilla y León.
 *
 * La referencia son tres entidades REALES del canónico, no inventadas:
 *  · jugador **19057** (`ROYUELA DE ROZAS, JOAQUIN`): 4 temporadas y 5 equipos en CyL, de 2023-24 a
 *    2026-27. Sirve para la trayectoria, los totales y los últimos partidos.
 *  · equipo **2526** (`C. y D. Leonesa S.A.D. "B"`, Liga Nacional Juvenil 2025-26, grupo 797): 30
 *    partidos, 26 jugadores en actas y 67 goles con minuto publicado.
 *  · club **16** (`Ciudad Rodrigo C.F.`): 15 temporadas, 117 inscripciones y escudo guardado.
 *
 * Se defienden cinco cosas, y son las que el proyecto lleva toda la vida defendiendo:
 *
 * 1. **Desconocido ≠ 0.** Una cifra que la fuente no publicó llega `null` y la ficha dice «sin datos»;
 *    nunca se convierte en un cero que parezca un hecho.
 * 2. **Nada de textos internos** (DOCTRINA-CALIDAD §8): ni «canónico», ni SQL, ni «reconstruido», ni
 *    cómo se calcula nada.
 * 3. **Nombres sí, fotos no** (§9): publica el nombre también del menor y ninguna imagen de persona.
 * 4. **404 de verdad** para un id que no existe, no un 200 con cuerpo de 404.
 * 5. **Sin N+1**: cada pantalla usa un puñado fijo de consultas con `LIMIT`, y los escudos y el club de
 *    cada fila viajan en la misma consulta.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import type { FilaClub, FilaEquipo, FilaEquipoDeClub, FilaJugadorDePlantilla, FilaPartidoDeEquipo, FilaPersona, FilaTemporadaDePersona } from '../src/consultas/entidades';
import {
  CONSULTAS_FICHAS, ESCUDO_DEL_CLUB, GOLES_POR_TRAMO, PARAMETROS_FICHAS, PARTIDOS_DE_PERSONA,
} from '../src/consultas/fichas';
import type { FilaPartidoDePersona, FilaTramoGoles } from '../src/consultas/fichas';
import {
  evolucionDelClub, fechaDeValor, golesCadaMinutos, golesDelEquipo, inicialesDeNombre, minutosPorTemporada,
  porcentajeDeMinutos, rachaDeResultados, resumenDeEquipo, temporadaActual, totalesDeCarrera, tramosCompletos,
} from '../src/lib/fichas';
import { CabeceraClub, CabeceraEquipo, CabeceraJugador } from '../src/componentes/fichas/Cabeceras';
import {
  GolesPorTramo, PlantillaDelEquipo, ResumenDelEquipo, UltimosResultados,
} from '../src/componentes/fichas/Equipo';
import {
  IdentidadDelJugador, MinutosPorTemporada, TablaTrayectoria, TotalesJugador, UltimosPartidosJugador,
} from '../src/componentes/fichas/Jugador';
import { EquiposDeLaTemporada, EvolucionDelClub, ResumenDelClub } from '../src/componentes/fichas/Club';
import PaginaJugador from '../src/app/explorar/jugador/[id]/page';
import PaginaEquipo from '../src/app/explorar/equipo/[id]/page';
import PaginaClub from '../src/app/explorar/club/[id]/page';

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

const render = (elemento: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(elemento);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Datos de referencia de las pruebas (reales en las de contrato; filas fabricadas en las de render)
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const JUGADOR_19057: FilaPersona = {
  persona_id: 19057,
  nombre_mostrado: 'ROYUELA DE ROZAS, JOAQUIN',
  identidad_nominal: false,
  es_menor: false,
  codigos: '12345678',
  decisiones_identidad: 0,
  total: 1,
};

const TRAYECTORIA: FilaTemporadaDePersona[] = [
  {
    temporada: '2026-27', temporada_orden: 44, equipo_id: 17613, club_id: 1495,
    club: 'C.D.I. de la Amistad', nombre_en_fuente: 'C.D.I. de la Amistad',
    edicion: 'Liga Nacional Juvenil', edicion_categoria: 'juvenil', edicion_ambito: 'nacional',
    grupo: 'Primera - III', federacion: 'castilla-leon', federacion_nombre: 'Castilla y León',
    partidos_con_aparicion: 4, convocatorias: 4, partidos_demostrados: 4, titularidades: 4, suplencias: 0,
    minutos_exactos: 332, minutos_estimados: 332, minutos_fiables: true, goles: 0, goles_penalti: 0,
    propias_puerta: 0, amarillas: 1, rojas: 0, partidos_elegibles: 4, partidos_cubiertos: 4, total: 5,
  },
  {
    temporada: '2025-26', temporada_orden: 3, equipo_id: 2533, club_id: 1495,
    club: 'C.D.I. de la Amistad Deltacinco', nombre_en_fuente: 'C.D.I. de la Amistad Deltacinco',
    edicion: 'Liga Nacional Juvenil', edicion_categoria: 'juvenil', edicion_ambito: 'nacional',
    grupo: 'Primera - III', federacion: 'castilla-leon', federacion_nombre: 'Castilla y León',
    partidos_con_aparicion: 29, convocatorias: 29, partidos_demostrados: 29, titularidades: 27, suplencias: 2,
    minutos_exactos: 2435, minutos_estimados: 2435, minutos_fiables: true, goles: 1, goles_penalti: 0,
    propias_puerta: 0, amarillas: 2, rojas: 0, partidos_elegibles: 30, partidos_cubiertos: 30, total: 5,
  },
  {
    temporada: '2024-25', temporada_orden: 1, equipo_id: 106731, club_id: 1451,
    club: 'C.D. Palencia Cristo Atlético', nombre_en_fuente: 'C.D. Palencia Cristo Atlético',
    edicion: 'Play Off de Ascenso a Liga Nacional Juvenil', edicion_categoria: 'juvenil', edicion_ambito: 'ascenso',
    grupo: 'Grupo Único', federacion: 'castilla-leon', federacion_nombre: 'Castilla y León',
    partidos_con_aparicion: 2, convocatorias: 2, partidos_demostrados: 2, titularidades: 1, suplencias: 1,
    // Sin minutos exactos: la acta no permite calcularlos. Se suma «lo seguro» y se marca con ≥.
    minutos_exactos: 83, minutos_estimados: null, minutos_fiables: false, goles: 0, goles_penalti: 0,
    propias_puerta: 0, amarillas: 0, rojas: 0, partidos_elegibles: 2, partidos_cubiertos: 1, total: 5,
  },
];

const PARTIDOS_JUGADOR: FilaPartidoDePersona[] = [
  {
    partido_id: 2000587, jornada_numero: 4, fecha: '2026-10-03', temporada: '2026-27',
    equipo_id: 17613, equipo: 'C.D.I. de la Amistad', club_id: 1495, grupo_id: 3769,
    edicion: 'Liga Nacional Juvenil', rival_id: 17610, rival: 'U.D. Sur', condicion: 'fuera',
    convocatoria: 'starter', goles_propios: 1, goles_rival: 2, resultado: 'perdido',
    goles: 0, goles_penalti: 0, amarillas: 1, rojas: 0, total: 6,
  },
  {
    partido_id: 2000582, jornada_numero: 3, fecha: '2026-09-26', temporada: '2026-27',
    equipo_id: 17613, equipo: 'C.D.I. de la Amistad', club_id: 1495, grupo_id: 3769,
    edicion: 'Liga Nacional Juvenil', rival_id: 17617, rival: 'C.D. Parquesol', condicion: 'casa',
    convocatoria: 'starter', goles_propios: 1, goles_rival: 2, resultado: 'perdido',
    goles: 0, goles_penalti: 0, amarillas: 0, rojas: 0, total: 6,
  },
  {
    partido_id: 94048, jornada_numero: 2, fecha: '2026-09-19', temporada: '2026-27',
    equipo_id: 17613, equipo: 'C.D.I. de la Amistad', club_id: 1495, grupo_id: 3769,
    edicion: 'Liga Nacional Juvenil', rival_id: 17619, rival: 'C.D. Isoba', condicion: 'fuera',
    convocatoria: 'starter', goles_propios: 3, goles_rival: 1, resultado: 'ganado',
    goles: 0, goles_penalti: 0, amarillas: 0, rojas: 0, total: 6,
  },
];

const EQUIPO_2526: FilaEquipo = {
  equipo_id: 2526, nombre_en_fuente: 'C. y D. Leonesa S.A.D. "B"', club_id: 1516,
  club: 'C. y D. Leonesa S.A.D.', provincia_club: 'León', federacion: 'castilla-leon',
  federacion_nombre: 'Castilla y León', temporada: '2025-26', edicion_id: 1,
  edicion: 'Liga Nacional Juvenil', edicion_categoria: 'juvenil', edicion_ambito: 'nacional',
  edicion_modalidad: 'futbol11', edicion_genero: 'masculina', edicion_estado: 'publicada',
  grupo_id: 797, grupo: 'Primera - III', jornadas_previstas: 30, categoria_team_season: 'juvenil',
  posicion: 3, puntos: 61, jugados: 30, ganados: 19, empatados: 4, perdidos: 7,
  goles_favor_reconstruidos: 67, goles_contra_reconstruidos: 29,
  partidos_elegibles: 30, partidos_cubiertos: 30,
  partidos_conocidos: 30, partidos_con_resultado: 30, complete_through_matchday: 30,
  visibility_state: 'completa', calculado_en: '2026-05-20 10:00:00+00',
};

const PARTIDOS_EQUIPO: FilaPartidoDeEquipo[] = [
  {
    partido_id: 16000, jornada_numero: 26, jornada_id: 900, fecha: '2026-04-04', fecha_prevista: null,
    estado: 'played', condicion: 'casa', rival_id: 2530, rival: 'Rival 1',
    goles_propios: 2, goles_rival: 0, resultado: 'ganado', campo: 'Campo Municipal', calidad_acta: 'correct', total: 30,
  },
  {
    partido_id: 16001, jornada_numero: 27, jornada_id: 901, fecha: '2026-04-11', fecha_prevista: null,
    estado: 'played', condicion: 'fuera', rival_id: 2531, rival: 'Rival 2',
    goles_propios: 0, goles_rival: 1, resultado: 'perdido', campo: 'Campo Ajeno', calidad_acta: 'correct', total: 30,
  },
  {
    partido_id: 16002, jornada_numero: 28, jornada_id: 902, fecha: '2026-04-18', fecha_prevista: null,
    estado: 'played', condicion: 'casa', rival_id: 2532, rival: 'Rival 3',
    goles_propios: 1, goles_rival: 1, resultado: 'empatado', campo: 'Campo Municipal', calidad_acta: 'correct', total: 30,
  },
  {
    partido_id: 16003, jornada_numero: 29, jornada_id: 903, fecha: '2026-04-25', fecha_prevista: null,
    estado: 'played', condicion: 'fuera', rival_id: 2533, rival: 'Rival 4',
    goles_propios: 3, goles_rival: 2, resultado: 'ganado', campo: 'Campo Ajeno', calidad_acta: 'review', total: 30,
  },
  {
    partido_id: 16004, jornada_numero: 30, jornada_id: 904, fecha: null, fecha_prevista: '2026-05-10',
    estado: 'scheduled', condicion: 'casa', rival_id: 2534, rival: 'Rival 5',
    goles_propios: null, goles_rival: null, resultado: 'sin_resultado', campo: 'Campo Municipal', calidad_acta: null, total: 30,
  },
];

const PLANTILLA: FilaJugadorDePlantilla[] = [
  {
    persona_id: 19057, nombre_mostrado: 'ROYUELA DE ROZAS, JOAQUIN', identidad_nominal: false, es_menor: false,
    dorsales: '9', portero: false, partidos_con_aparicion: 4, convocatorias: 4, partidos_demostrados: 4,
    titularidades: 4, suplencias: 0, minutos_exactos: 332, minutos_estimados: 332, minutos_fiables: true,
    goles: 0, goles_penalti: 0, propias_puerta: 0, amarillas: 1, rojas: 0, partidos_elegibles: 4,
    partidos_cubiertos: 4, total: 26,
  },
  {
    persona_id: 19554, nombre_mostrado: 'BLANCO RAFAEL, ANTONIO GABRIEL', identidad_nominal: false, es_menor: false,
    dorsales: '1', portero: true, partidos_con_aparicion: 4, convocatorias: 4, partidos_demostrados: 4,
    titularidades: 4, suplencias: 0, minutos_exactos: 360, minutos_estimados: 360, minutos_fiables: true,
    goles: 0, goles_penalti: 0, propias_puerta: 0, amarillas: 0, rojas: 0, partidos_elegibles: 4,
    partidos_cubiertos: 4, total: 26,
  },
];

const TRAMOS: FilaTramoGoles[] = [
  { tramo: '0-15', favor: 12, contra: 2 },
  { tramo: '16-30', favor: 10, contra: 5 },
  { tramo: '31-45', favor: 14, contra: 5 },
  { tramo: '46-60', favor: 10, contra: 8 },
  { tramo: '61-75', favor: 11, contra: 5 },
  { tramo: '76-90', favor: 10, contra: 4 },
];

const CLUB_16: FilaClub = {
  club_id: 16, nombre_canonico: 'Ciudad Rodrigo C.F.', municipio: 'Ciudad Rodrigo', provincia: 'Salamanca',
  federacion: 'castilla-leon', federacion_nombre: 'Castilla y León',
  aliases: 'Ciudad Rodrigo C.F. · C. D. Ciudad Rodrigo',
};

const EQUIPOS_CLUB: FilaEquipoDeClub[] = [
  {
    equipo_id: 8873, temporada: '2026-27', temporada_orden: 44, edicion_id: 1, edicion: '1ª División Provincial de Juveniles',
    edicion_codigo: 'X1', edicion_categoria: 'juvenil', edicion_ambito: 'provincial', edicion_modalidad: 'futbol11',
    edicion_genero: 'masculina', edicion_provincia: 'Salamanca', edicion_estado: 'publicada',
    grupo_id: 75250, grupo: 'Primera - Salamanca', grupo_codigo: 'G1', jornadas_previstas: 30,
    nombre_en_fuente: 'Ciudad Rodrigo C.F.', categoria_team_season: 'juvenil', posicion: 12, puntos: 0,
    jugados: 0, ganados: 0, empatados: 0, perdidos: 0, clasificacion_origen: 'oficial',
    goles_favor_reconstruidos: 0, goles_contra_reconstruidos: 0, partidos_conocidos: 6,
    partidos_con_resultado: 0, complete_through_matchday: null, visibility_state: 'oculta',
    calculado_en: null, total: 117,
  },
  {
    equipo_id: 8905, temporada: '2026-27', temporada_orden: 44, edicion_id: 2, edicion: '1ª División Regional de Aficionados',
    edicion_codigo: 'X2', edicion_categoria: 'aficionados', edicion_ambito: 'regional', edicion_modalidad: 'futbol11',
    edicion_genero: 'masculina', edicion_provincia: 'Salamanca', edicion_estado: 'publicada',
    grupo_id: 2941, grupo: 'Primera - B', grupo_codigo: 'G2', jornadas_previstas: 34,
    nombre_en_fuente: 'Ciudad Rodrigo C.F.', categoria_team_season: 'aficionados', posicion: 9, puntos: 3,
    jugados: 1, ganados: 1, empatados: 0, perdidos: 0, clasificacion_origen: 'oficial',
    goles_favor_reconstruidos: 2, goles_contra_reconstruidos: 1, partidos_conocidos: 1,
    partidos_con_resultado: 1, complete_through_matchday: null, visibility_state: 'parcial_privada',
    calculado_en: null, total: 117,
  },
  {
    equipo_id: 2489, temporada: '2025-26', temporada_orden: 3, edicion_id: 3, edicion: '1ª División Provincial de Juveniles',
    edicion_codigo: 'X3', edicion_categoria: 'juvenil', edicion_ambito: 'provincial', edicion_modalidad: 'futbol11',
    edicion_genero: 'masculina', edicion_provincia: 'Salamanca', edicion_estado: 'publicada',
    grupo_id: 790, grupo: 'Primera - Salamanca', grupo_codigo: 'G3', jornadas_previstas: 30,
    nombre_en_fuente: 'Ciudad Rodrigo C.F.', categoria_team_season: 'juvenil', posicion: 7, puntos: 44,
    jugados: 30, ganados: 14, empatados: 2, perdidos: 14, clasificacion_origen: 'oficial',
    goles_favor_reconstruidos: 59, goles_contra_reconstruidos: 42,
    partidos_conocidos: 30, partidos_con_resultado: 30, complete_through_matchday: 30,
    visibility_state: 'completa', calculado_en: null, total: 117,
  },
];

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Funciones puras: lo que la ficha decide sin base de datos
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('las cuentas de la ficha se hacen una vez y no en el JSX', () => {
  it('las iniciales del avatar salen del nombre, sin inventar', () => {
    expect(inicialesDeNombre('ROYUELA DE ROZAS, JOAQUIN')).toBe('RR');
    expect(inicialesDeNombre('Martín Ezquerra Valcárcel')).toBe('ME');
    expect(inicialesDeNombre('Pelé')).toBe('P');
    expect(inicialesDeNombre('')).toBe('·');
  });

  it('los totales suman la trayectoria y marcan si los minutos son exactos', () => {
    const totales = totalesDeCarrera(TRAYECTORIA);
    expect(totales.temporadas).toBe(3);
    expect(totales.equipos).toBe(3);
    expect(totales.partidos).toBe(35);
    expect(totales.goles).toBe(1);
    expect(totales.minutos).toBe(332 + 2435 + 83);
    // Una temporada sin minutos exactos hace que el total sea «lo seguro, no el total».
    expect(totales.minutosFiables).toBe(false);
    expect(totales.amarillas).toBe(3);
    expect(totales.rojas).toBe(0);
  });

  it('sin minutos publicados el total no es 0: es null', () => {
    const totales = totalesDeCarrera(TRAYECTORIA.map((f) => ({
      ...f, minutos_exactos: null, minutos_estimados: null, minutos_fiables: null,
    })));
    expect(totales.minutos).toBeNull();
    expect(totales.minutosFiables).toBe(false);
  });

  it('el porcentaje de minutos necesita el denominador: sin partidos elegibles es null', () => {
    expect(porcentajeDeMinutos(1002, 12)).toBe(93);
    expect(porcentajeDeMinutos(1002, null)).toBeNull();
    expect(porcentajeDeMinutos(null, 12)).toBeNull();
    expect(porcentajeDeMinutos(0, 12)).toBe(0);
  });

  it('los minutos por gol sólo se enseñan cuando hay goles y minutos exactos', () => {
    expect(golesCadaMinutos(11, 1002)).toBe(91);
    expect(golesCadaMinutos(0, 1002)).toBeNull();
    expect(golesCadaMinutos(1, null)).toBeNull();
  });

  it('la racha usa los últimos resultados jugados y no convierte un partido sin acta en derrota', () => {
    const partidos = [
      { resultado: 'ganado' }, { resultado: 'empatado' }, { resultado: 'sin_resultado' },
      { resultado: 'perdido' }, { resultado: 'ganado' }, { resultado: 'sin_resultado' },
    ];
    expect(rachaDeResultados(partidos)).toEqual(['G', 'E', 'P', 'G']);
    expect(rachaDeResultados(partidos, 3)).toEqual(['E', 'P', 'G']);
    expect(rachaDeResultados([{ resultado: 'sin_resultado' }])).toEqual([]);
  });

  it('el resumen del equipo separa casa y fuera y no inventa goles sin marcador', () => {
    const resumen = resumenDeEquipo(PARTIDOS_EQUIPO);
    expect(resumen.jugados).toBe(4);
    expect(resumen.sinResultado).toBe(1);
    // Goles: sólo de los partidos con marcador; el partido sin resultado no suma 0-0.
    const goles = golesDelEquipo(PARTIDOS_EQUIPO);
    expect(goles).toEqual({ jugados: 4, favor: 6, contra: 4 });
    expect(resumen.casa).toEqual({ ganados: 1, empatados: 1, perdidos: 0 });
    expect(resumen.fuera).toEqual({ ganados: 1, empatados: 0, perdidos: 1 });
    expect(resumen.racha).toEqual(['G', 'P', 'E', 'G']);
  });

  it('un equipo sin ningún resultado no tiene goles: null, no 0:0', () => {
    const goles = golesDelEquipo([{ resultado: 'sin_resultado' }]);
    expect(goles).toEqual({ jugados: 0, favor: null, contra: null });
  });

  it('los tramos de goles se completan a seis sólo si hay actas con minuto', () => {
    const completos = tramosCompletos(TRAMOS);
    expect(completos).toHaveLength(6);
    expect(completos![0]).toEqual({ tramo: '0-15', favor: 12, contra: 2 });
    expect(completos!.reduce((t, x) => t + x.favor, 0)).toBe(67);
    expect(tramosCompletos([])).toBeNull();
    // Si el acta sólo trae tres tramos, los otros tres son 0 goles conocidos, no huecos.
    expect(tramosCompletos([{ tramo: '0-15', favor: 1, contra: 0 }]))
      .toEqual(expect.arrayContaining([{ tramo: '76-90', favor: 0, contra: 0 }]));
  });

  it('las fechas llegan como Date o como texto y la ficha las normaliza', () => {
    expect(fechaDeValor(new Date('2026-10-03T18:30:00Z'))).toBe('2026-10-03');
    expect(fechaDeValor('2026-10-03')).toBe('2026-10-03');
    expect(fechaDeValor(null)).toBeNull();
    expect(fechaDeValor('no-es-fecha')).toBeNull();
  });
});

describe('la evolución del club se calcula con una sola lista de inscripciones', () => {
  it('la temporada actual es la más reciente y sólo se enseñan sus equipos', () => {
    expect(temporadaActual(EQUIPOS_CLUB)).toBe('2026-27');
    const actuales = EQUIPOS_CLUB.filter((e) => e.temporada === '2026-27');
    expect(actuales).toHaveLength(2);
  });

  it('la evolución agrupa por línea de equipo y compara posiciones entre temporadas', () => {
    const evolucion = evolucionDelClub(EQUIPOS_CLUB, 6);
    expect(evolucion.temporadas).toEqual(['2026-27', '2025-26']);
    const juveniles = evolucion.filas.find((f) => f.clave.includes('juvenil'));
    expect(juveniles).toBeDefined();
    expect(juveniles!.etiqueta).toMatch(/Juvenil/);
    // 2026-27: 12º; 2025-26: 7º. Baja cinco puestos.
    expect(juveniles!.celdas[0]).toMatchObject({ posicion: 12, movimiento: 'baja' });
    expect(juveniles!.celdas[1]).toMatchObject({ posicion: 7, movimiento: null });
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Consultas: contrato estático y contra el canónico real
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('contrato estático de las consultas de las fichas', () => {
  it('todas llevan LIMIT, parámetros numerados y ninguna plantilla interpolada', () => {
    for (const c of CONSULTAS_FICHAS) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
      expect(c.sql, `${c.nombre} interpola`).not.toContain('${');
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_FICHAS[c.nombre], `${c.nombre} sin parámetros`).toBeDefined();
    }
  });

  it('ninguna consulta pide el club ni el escudo dentro de un bucle', () => {
    // El club y el escudo de cada fila viajan en la consulta que ya trae la fila: los últimos partidos
    // llevan `club_id` y los equipos del club llevan su `equipo_id` y su competición.
    expect(PARTIDOS_DE_PERSONA.columnas).toContain('club_id');
    expect(PARTIDOS_DE_PERSONA.columnas).toContain('equipo_id');
    expect(GOLES_POR_TRAMO.columnas).toEqual(['tramo', 'favor', 'contra']);
    expect(ESCUDO_DEL_CLUB.columnas).toEqual(['club_id', 'tiene_escudo']);
  });
});

describe.skipIf(!hayCanonico)('las consultas de las fichas contra el canónico real', () => {
  it('los últimos partidos de un jugador real traen contexto, resultado y tarjetas', async () => {
    const filas = await consulta<FilaPartidoDePersona>(PARTIDOS_DE_PERSONA.sql, [19057, 10]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(String(fila.equipo).length).toBeGreaterThan(0);
      expect(String(fila.rival).length).toBeGreaterThan(0);
      expect(Number(fila.equipo_id)).toBeGreaterThan(0);
      expect(Number(fila.club_id)).toBeGreaterThan(0);
      expect(['casa', 'fuera']).toContain(fila.condicion);
      expect(['ganado', 'empatado', 'perdido', 'sin_resultado']).toContain(fila.resultado);
      expect(Number(fila.amarillas)).toBeGreaterThanOrEqual(0);
    }
    // Llegan ordenados de la fecha más reciente a la más antigua.
    const fechas = filas.map((f) => String(f.fecha ?? ''));
    expect([...fechas].sort().reverse()).toEqual(fechas);
  });

  it('los goles por tramo del equipo real suman el marcador de la temporada', async () => {
    const filas = await consulta<FilaTramoGoles>(GOLES_POR_TRAMO.sql, [2526]);
    const completos = tramosCompletos(filas);
    expect(completos).not.toBeNull();
    expect(completos!.reduce((t, x) => t + x.favor, 0)).toBe(67);
    expect(completos!.reduce((t, x) => t + x.contra, 0)).toBe(29);
  });

  it('el club 16 tiene escudo guardado y el 999999999 no existe', async () => {
    const [conEscudo] = await consulta<{ club_id: number; tiene_escudo: boolean }>(ESCUDO_DEL_CLUB.sql, [16]);
    expect(conEscudo!.tiene_escudo).toBe(true);
    const sinClub = await consulta(ESCUDO_DEL_CLUB.sql, [999999999]);
    expect(sinClub).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Componentes: lo que se ve
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('la cabecera del jugador', () => {
  const federaciones = [...new Set(TRAYECTORIA.map((f) => f.federacion_nombre))];
  const renderJugador = () => render(createElement(CabeceraJugador, {
    jugador: JUGADOR_19057,
    contexto: {
      equipoActual: { equipo_id: 17613, nombre: 'C.D.I. de la Amistad', edicion: 'Liga Nacional Juvenil', temporada: '2026-27' },
      federaciones,
      temporadas: 3,
    },
  }));

  it('publica el nombre y el contexto sin ninguna foto', () => {
    const html = renderJugador();
    expect(html).toContain('ROYUELA DE ROZAS, JOAQUIN');
    expect(html).toContain('C.D.I. de la Amistad');
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('Castilla y León');
    // §9: nombres sí; fotos de personas, no.
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).toContain('RR');
  });

  it('sin equipo actual lo dice en vez de dejar un hueco', () => {
    const html = render(createElement(CabeceraJugador, {
      jugador: JUGADOR_19057,
      contexto: { equipoActual: null, federaciones, temporadas: 0 },
    }));
    expect(html).toMatch(/sin equipo/i);
  });
});

describe('los totales y la trayectoria del jugador', () => {
  const totales = totalesDeCarrera(TRAYECTORIA);

  it('enseña partidos, goles, minutos, titularidades y tarjetas', () => {
    const html = render(createElement(TotalesJugador, { totales }));
    expect(html).toContain('35');
    expect(html).toContain('2850');
    // Minutos no exactos: la cifra se marca como «lo seguro», no como el total.
    expect(html).toContain('≥');
    expect(html).toContain('Titular');
    expect(html).toContain('Disciplina');
  });

  it('sin minutos publicados dice «sin datos» y no un cero', () => {
    const html = render(createElement(TotalesJugador, {
      totales: { ...totales, minutos: null, minutosFiables: false },
    }));
    expect(html).toMatch(/sin datos/i);
    expect(html).not.toMatch(/>0 min/);
  });

  it('la tabla temporada a temporada enlaza equipo y competición', () => {
    const html = render(createElement(TablaTrayectoria, { filas: TRAYECTORIA }));
    expect(html).toContain('/explorar/equipo/17613');
    expect(html).toContain('/explorar/equipo/2533');
    expect(html).toContain('2026-27');
    expect(html).toContain('2025-26');
    expect(html).toContain('Castilla y León');
  });

  it('el gráfico de minutos por temporada usa barras con el total escrito', () => {
    const filas = minutosPorTemporada(TRAYECTORIA);
    expect(filas).toHaveLength(3);
    const html = render(createElement(MinutosPorTemporada, { filas }));
    expect(html).toContain('Minutos por temporada');
    expect(html).toContain('2435');
    expect(html).toContain('role="img"');
  });
});

describe('los últimos partidos del jugador', () => {
  it('enseña rival, resultado, condición, goles y tarjetas, y enlaza la jornada', () => {
    const html = render(createElement(UltimosPartidosJugador, { filas: PARTIDOS_JUGADOR }));
    expect(html).toContain('U.D. Sur');
    expect(html).toContain('C.D. Parquesol');
    expect(html).toContain('1-2');
    expect(html).toContain('Titular');
    expect(html).toContain('/explorar/competicion/3769/jornada/4');
  });

  it('sin partidos no pinta una tabla vacía: lo dice', () => {
    const html = render(createElement(UltimosPartidosJugador, { filas: [] }));
    expect(html).not.toContain('<table');
    expect(html).toMatch(/sin partidos/i);
  });

  it('la identidad nominal se avisa y la confirmada se dice con su código', () => {
    const confirmada = render(createElement(IdentidadDelJugador, { jugador: JUGADOR_19057 }));
    expect(confirmada).toContain('12345678');
    const nominal = render(createElement(IdentidadDelJugador, {
      jugador: { ...JUGADOR_19057, identidad_nominal: true, codigos: null },
    }));
    expect(nominal).toMatch(/sin código federativo/i);
    expect(nominal).not.toContain('identidad confirmada');
  });
});

describe('el equipo', () => {
  const resumen = resumenDeEquipo(PARTIDOS_EQUIPO);

  it('la cabecera enseña equipo, club, competición y escudo de su club', () => {
    const html = render(createElement(CabeceraEquipo, { equipo: EQUIPO_2526, tieneEscudo: true }));
    expect(html).toContain('Leonesa');
    expect(html).toContain('/explorar/club/1516');
    expect(html).toContain('/explorar/competicion/797');
    expect(html).toContain('/api/escudo/club/1516');
    expect(html).toContain('Castilla y León');
  });

  it('el resumen separa posición, racha, casa/fuera y goles', () => {
    const html = render(createElement(ResumenDelEquipo, { equipo: EQUIPO_2526, resumen }));
    expect(html).toContain('Posición');
    expect(html).toContain('Racha');
    expect(html).toContain('Casa');
    expect(html).toContain('Fuera');
    expect(html).toContain('Goles');
  });

  it('los goles por tramo se pintan como barras espejo con los dos lados', () => {
    const html = render(createElement(GolesPorTramo, { tramos: tramosCompletos(TRAMOS) }));
    expect(html).toContain('0-15');
    expect(html).toContain('76-90');
    expect(html).toContain('a favor');
    expect(html).toContain('en contra');
    // Sin actas con minuto no se inventan barras.
    const sinDatos = render(createElement(GolesPorTramo, { tramos: null }));
    expect(sinDatos).toMatch(/sin datos|no hay actas/i);
  });

  it('la plantilla enlaza cada jugador y ordena por minutos', () => {
    const html = render(createElement(PlantillaDelEquipo, { filas: PLANTILLA, partidosElegibles: 4 }));
    expect(html).toContain('/explorar/jugador/19057');
    expect(html).toContain('BLANCO RAFAEL, ANTONIO GABRIEL');
    expect(html).toContain('POR');
  });

  it('los últimos resultados enlazan jornada y muestran el marcador orientado', () => {
    const html = render(createElement(UltimosResultados, { partidos: PARTIDOS_EQUIPO.slice(-3), grupoId: 797 }));
    expect(html).toContain('/explorar/competicion/797/jornada/28');
    expect(html).toContain('Rival');
  });
});

describe('el club', () => {
  it('la cabecera enseña nombre, municipio, federación y escudo', () => {
    const html = render(createElement(CabeceraClub, { club: CLUB_16, tieneEscudo: true }));
    expect(html).toContain('Ciudad Rodrigo C.F.');
    expect(html).toContain('Ciudad Rodrigo (Salamanca)');
    expect(html).toContain('/api/escudo/club/16');
    expect(html).toContain('Castilla y León');
  });

  it('los equipos de la temporada enlazan su ficha y su clasificación', () => {
    const html = render(createElement(EquiposDeLaTemporada, {
      filas: EQUIPOS_CLUB.filter((e) => e.temporada === '2026-27'), temporada: '2026-27',
    }));
    expect(html).toContain('/explorar/equipo/8873');
    expect(html).toContain('/explorar/equipo/8905');
    expect(html).toContain('Juvenil');
    expect(html).toContain('Aficionados');
    expect(html).toContain('2026-27');
  });

  it('la evolución del club enseña una columna por temporada y la posición de cada equipo', () => {
    const html = render(createElement(EvolucionDelClub, { evolucion: evolucionDelClub(EQUIPOS_CLUB, 6) }));
    expect(html).toContain('2026-27');
    expect(html).toContain('2025-26');
    expect(html).toContain('12º');
    expect(html).toContain('7º');
  });

  it('el resumen no inventa palmarés: cuenta temporadas y equipos reales', () => {
    const html = render(createElement(ResumenDelClub, { club: CLUB_16, equipos: EQUIPOS_CLUB }));
    expect(html).toContain('Temporadas');
    expect(html).toContain('2');
    expect(html).not.toMatch(/título|trofeo|palmarés/i);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Páginas: id canónico, 404 real y textos que no se enseñan
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

const TEXTO_PROHIBIDO = /can[óo]nico|\bsql\b|n\+1|endpoint|\btoken\b|cach[ée]|migraci[óo]n|reconstruid|se calcula|se obtiene de|consulta interna|servidor/i;

describe('las páginas de las tres fichas', () => {
  it('el id que no existe responde 404 de verdad en las tres rutas', async () => {
    for (const pagina of [PaginaJugador, PaginaEquipo, PaginaClub]) {
      await expect(pagina({ params: Promise.resolve({ id: '999999999' }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
    for (const pagina of [PaginaJugador, PaginaEquipo, PaginaClub]) {
      await expect(pagina({ params: Promise.resolve({ id: 'abc' }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
  });

  it.skipIf(!hayCanonico)('la ficha del jugador real se pinta sin textos internos', async () => {
    const html = render(await PaginaJugador({ params: Promise.resolve({ id: '19057' }) }));
    expect(html).toContain('ROYUELA DE ROZAS, JOAQUIN');
    expect(html).toContain('Temporada a temporada');
    expect(html).toMatch(/Últimos partidos/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
    expect(html).not.toContain('<img');
  });

  it.skipIf(!hayCanonico)('la ficha del equipo real se pinta sin textos internos', async () => {
    const html = render(await PaginaEquipo({ params: Promise.resolve({ id: '2526' }) }));
    expect(html).toContain('Leonesa');
    expect(html).toContain('Plantilla');
    expect(html).toContain('/explorar/competicion/797');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('la ficha del club real se pinta sin textos internos', async () => {
    const html = render(await PaginaClub({ params: Promise.resolve({ id: '16' }) }));
    expect(html).toContain('Ciudad Rodrigo C.F.');
    expect(html).toContain('Equipos');
    expect(html).toContain('/explorar/equipo/');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('un id de otro tipo no se cuela: jugador inexistente, equipo inexistente y club inexistente', async () => {
    for (const [pagina, id] of [[PaginaJugador, '999999998'], [PaginaEquipo, '999999998'], [PaginaClub, '999999998']] as const) {
      await expect((pagina as (p: { params: Promise<{ id: string }> }) => Promise<unknown>)({ params: Promise.resolve({ id }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
  });
});

