import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CLASIFICACION_DE_LA_PANTALLA, CONSULTAS_COMPETICIONES, EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID,
  GRUPOS_DE_LA_EDICION, PARAMETROS_COMPETICIONES,
} from '../src/consultas/competiciones';
import { PARTIDOS_DE_GRUPO } from '../src/consultas/partidos';
import type { FilaPartidoCanonico } from '../src/consultas/partidos';
import type { FilaClasificacionPantalla } from '../src/consultas/competiciones';
import { RANKING_GOLEADORES } from '../src/consultas/paneles';
import type { FilaRanking } from '../src/consultas/paneles';
import { ZONAS_DEL_GRUPO } from '../src/consultas/paneles';
import { RACHAS_DEL_GRUPO } from '../src/consultas/analisis';
import { Escudo } from '../src/componentes/Escudo';
import { Clasificacion } from '../src/componentes/competicion/Clasificacion';
import { EsqueletoContenido } from '../src/componentes/competicion/EsqueletoContenido';
import { Goleadores } from '../src/componentes/competicion/Goleadores';
import { Jornada } from '../src/componentes/competicion/Jornada';
import { nombreVisible } from '../src/lib/menores';
import {
  colorDeEquipo, formaDe, formaHasta, golesDeLaFila, marcadorDePartido, publicaGoles, siglas, subtituloCompeticion,
  temporadasPublicables, tituloDeCompeticion, zonaDe,
} from '../src/lib/pantalla-competicion';

/**
 * Contrato de la pantalla 2 del prototipo: competición, clasificación y jornada.
 *
 * La referencia real es el grupo 797 del canónico: «Liga Nacional Juvenil» de juveniles de Castilla y
 * León, temporada 2025-26, 16 equipos y 30 jornadas con la clasificación oficial publicada. No se
 * inventan datos: si el grupo no estuviera importado, estas pruebas lo dicen en vez de pasar en falso.
 *
 * Lo que se defiende:
 *  · la pantalla no puede prometer columnas que la consulta no dé;
 *  · el nombre de un menor de edad no se publica (invariante de `CLAUDE.md`);
 *  · el desconocido sigue siendo desconocido: la clasificación trae su origen y los `null` no se
 *    convierten en ceros.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** El grupo real de referencia de Castilla y León para esta pantalla. */
const GRUPO_CYL = 797;
const FEDERACION = 'castilla-leon';
const GRUPO_CODIGO = '22911129';

afterAll(async () => {
  await cierraCanonico();
});

describe('contrato estático de las consultas de la pantalla de competición', () => {
  it('todas llevan LIMIT: ninguna página puede pedir una tabla entera', () => {
    for (const c of CONSULTAS_COMPETICIONES) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
    }
  });

  it('ningún valor se interpola en el SQL: todo va por parámetros numerados', () => {
    for (const c of CONSULTAS_COMPETICIONES) {
      expect(c.sql, `${c.nombre} interpola una plantilla`).not.toContain('${');
    }
  });

  it('cada consulta declara nombre, descripción, presupuesto, plan y columnas', () => {
    for (const c of CONSULTAS_COMPETICIONES) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(c.plan).toBe('indexado');
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_COMPETICIONES[c.nombre], `${c.nombre} sin parámetros de ejemplo`).toBeDefined();
    }
  });

  it('las columnas declaradas son las que la página necesita para no inventar nada', () => {
    expect(GRUPO_POR_ID.columnas).toContain('jornadas_previstas');
    expect(GRUPO_POR_ID.columnas).toContain('visibility_state');
    expect(GRUPO_POR_ID.columnas).toContain('origen_clasificacion');
    expect(CLASIFICACION_DE_LA_PANTALLA.columnas).toContain('origen');
    expect(CLASIFICACION_DE_LA_PANTALLA.columnas).toContain('goles_favor_reconstruida');
    expect(ZONAS_DEL_GRUPO.columnas).toContain('descensos');
    expect(RACHAS_DEL_GRUPO.columnas).toContain('ultimos5');
    expect(RANKING_GOLEADORES.columnas).toContain('es_menor');
  });
});

describe('la regla de los menores, que la página no puede saltarse', () => {
  it('un menor de edad nunca enseña su nombre: se enseña la etiqueta', () => {
    expect(nombreVisible(true, 'FALAGAN CASADO, ALVARO')).toBe('Jugador menor de edad');
  });

  it('un adulto conserva su nombre tal como lo publica la federación', () => {
    expect(nombreVisible(false, 'CARPINTERO ALLEGUE, IKER')).toBe('CARPINTERO ALLEGUE, IKER');
  });

  it('sin nombre no se inventa uno', () => {
    expect(nombreVisible(false, null)).toBe('Nombre no publicado');
  });
});

describe.skipIf(!hayCanonico)('la pantalla 2 contra el canónico real (Castilla y León)', () => {
  it('la cabecera del grupo 797 es la de un grupo real de CyL, con sus jornadas previstas', async () => {
    const filas = await consulta<Record<string, unknown>>(GRUPO_POR_ID.sql, [GRUPO_CYL]);
    expect(filas).toHaveLength(1);
    const g = filas[0]!;
    expect(g.federacion).toBe(FEDERACION);
    expect(g.categoria).toBe('juvenil');
    expect(Number(g.grupo_id)).toBe(GRUPO_CYL);
    expect(Number(g.jornadas_previstas)).toBe(30);
    expect(['oculta', 'parcial_privada', 'verificada_hasta_jornada', 'completa']).toContain(g.visibility_state);
    expect(['oficial', 'reconstruida', null]).toContain(g.origen_clasificacion);
  });

  it('la clasificación es la del grupo: una fila por equipo, posiciones sin huecos y de dónde sale', async () => {
    const filas = await consulta<Record<string, unknown>>(CLASIFICACION_DE_LA_PANTALLA.sql, [GRUPO_CYL]);
    expect(filas.length).toBeGreaterThanOrEqual(12);
    const posiciones = filas.map((f) => Number(f.posicion));
    expect(new Set(posiciones).size).toBe(filas.length);
    expect(Math.min(...posiciones)).toBe(1);
    for (const f of filas) {
      expect(['oficial', 'reconstruida']).toContain(f.origen);
      // Los recuentos que la federación publica no son negativos; los goles sí pueden ser null.
      expect(Number(f.puntos)).toBeGreaterThanOrEqual(0);
      expect(Number(f.jugados)).toBeGreaterThanOrEqual(0);
    }
    // Y los puntos no pueden subir al bajar en la tabla: la tabla es la oficial, no una inventada.
    const puntos = filas.map((f) => Number(f.puntos));
    expect(puntos).toEqual([...puntos].sort((a, b) => b - a));
  });

  it('las zonas de la pantalla existen para el grupo y traen su origen, no una suposición', async () => {
    const filas = await consulta<Record<string, unknown>>(ZONAS_DEL_GRUPO.sql, [GRUPO_CYL]);
    expect(filas).toHaveLength(1);
    const z = filas[0]!;
    expect(['reglamento', 'aprendida']).toContain(z.origen);
    for (const campo of ['ascensos', 'promocion', 'descensos', 'promocion_permanencia']) {
      expect(Number(z[campo]), campo).toBeGreaterThanOrEqual(0);
    }
  });

  it('la forma de cada equipo son los últimos cinco resultados y sólo pueden ser G, E o P', async () => {
    const filas = await consulta<Record<string, unknown>>(RACHAS_DEL_GRUPO.sql, [GRUPO_CYL]);
    expect(filas.length).toBeGreaterThanOrEqual(12);
    for (const f of filas) {
      expect(String(f.ultimos5)).toMatch(/^[GEP]{0,5}$/);
      expect(Number(f.jugados)).toBeGreaterThanOrEqual(String(f.ultimos5).length);
    }
  });

  it('los goleadores del grupo son datos del grupo, ordenados por goles y con la marca de menor', async () => {
    const filas = await consulta<Record<string, unknown>>(RANKING_GOLEADORES.sql,
      [FEDERACION, '2025-26', 'juvenil', null, GRUPO_CYL, 1, 10]);
    expect(filas.length).toBeGreaterThan(0);
    const goles = filas.map((f) => Number(f.goles));
    expect(goles).toEqual([...goles].sort((a, b) => b - a));
    for (const f of filas) {
      expect(f).toHaveProperty('es_menor');
      expect(String(f.nombre).length, 'un goleador sin nombre').toBeGreaterThan(0);
    }
    // Ningún gol es de otro grupo: la pantalla no mezcla competiciones.
    expect(new Set(filas.map((f) => String(f.grupo))).size).toBe(1);
  });

  it('los desplegables salen de la base: hermanos de la edición y temporadas de la misma competición', async () => {
    const grupo = (await consulta<Record<string, unknown>>(GRUPO_POR_ID.sql, [GRUPO_CYL]))[0]!;
    const hermanos = await consulta<Record<string, unknown>>(GRUPOS_DE_LA_EDICION.sql, [grupo.edicion_id]);
    expect(hermanos.length).toBeGreaterThanOrEqual(1);
    expect(hermanos.map((h) => Number(h.grupo_id))).toContain(GRUPO_CYL);

    const temporadas = await consulta<Record<string, unknown>>(EDICIONES_DE_LA_COMPETICION.sql, [GRUPO_CYL]);
    expect(temporadas.length).toBeGreaterThanOrEqual(1);
    expect(temporadas.map((t) => String(t.temporada))).toContain('2025-26');
    for (const t of temporadas) {
      expect(t.edicion_id).toBeTruthy();
      expect(String(t.temporada)).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});

/**
 * Las reglas de presentación de la pantalla, en funciones puras y probadas aparte del render:
 * las siglas del escudo, las franjas de zona y el reparto de la forma.
 */
describe('presentación de la pantalla de competición', () => {
  it('las siglas del escudo salen del nombre publicado, sin inventar', () => {
    expect(siglas('Liga Nacional Juvenil')).toBe('LN');
    expect(siglas('1ª División Regional de Juveniles')).toBe('1D');
    expect(siglas('Primera - III')).toBe('PI');
    expect(siglas('')).toBe('?');
  });

  it('las zonas se reparten desde arriba y desde abajo, y no se pisan', () => {
    const zonas = { ascensos: 1, promocion: 1, descensos: 2, promocion_permanencia: 1, origen: 'aprendida', confianza: 0.9, temporadas: 11 };
    expect(zonaDe(1, 16, zonas)).toBe('asciende');
    expect(zonaDe(2, 16, zonas)).toBe('fase-ascenso');
    expect(zonaDe(3, 16, zonas)).toBeNull();
    expect(zonaDe(13, 16, zonas)).toBeNull();
    expect(zonaDe(14, 16, zonas)).toBe('permanencia');
    expect(zonaDe(15, 16, zonas)).toBe('desciende');
    expect(zonaDe(16, 16, zonas)).toBe('desciende');
  });

  it('sin zonas fijadas no se pinta ninguna franja: no se supone una', () => {
    expect(zonaDe(1, 16, null)).toBeNull();
    expect(zonaDe(16, 16, null)).toBeNull();
    expect(zonaDe(1, 16, { ascensos: 0, promocion: 0, descensos: 0, promocion_permanencia: 0, origen: 'aprendida', confianza: null, temporadas: null })).toBeNull();
  });

  it('la forma del DATO se parsea como G, E o P y descarta lo que no entiende (la letra visible es V-E-D)', () => {
    expect(formaDe('GEEPG')).toEqual(['G', 'E', 'E', 'P', 'G']);
    expect(formaDe('')).toEqual([]);
    expect(formaDe('XYZ')).toEqual([]);
    expect(formaDe('GEPGX')).toEqual(['G', 'E', 'P', 'G']);
  });
});

/**
 * Honestidad del dato de goles: la tabla oficial de CyL NO publica goles (los guarda a cero) y la
 * reconstruida sí. Esto es lo que evita que la pantalla enseñe «0:0» en las 16 filas.
 */
describe('los goles que se enseñan', () => {
  const cero = { goles_favor: 0, goles_contra: 0, goles_favor_reconstruida: 67, goles_contra_reconstruida: 29 };
  const conGoles = { ...cero, goles_favor: 67, goles_contra: 29 };

  it('una tabla oficial toda a cero NO publica goles', () => {
    expect(publicaGoles([cero, { ...cero }], 'oficial')).toBe(false);
  });

  it('si la oficial trae goles, se usan los suyos', () => {
    expect(publicaGoles([conGoles], 'oficial')).toBe(true);
    expect(golesDeLaFila(conGoles, false)).toBe('67:29');
  });

  it('si no los publica, se usan los reconstruidos y la página lo dice', () => {
    expect(golesDeLaFila(cero, true)).toBe('67:29');
  });

  it('sin reconstrucción no se enseña un cero: se enseña un guion', () => {
    expect(golesDeLaFila({ ...cero, goles_favor_reconstruida: null, goles_contra_reconstruida: null }, true)).toBe('—');
  });

  it('una tabla reconstruida siempre publica goles', () => {
    expect(publicaGoles([cero], 'reconstruida')).toBe(true);
  });
});

/**
 * ── LA RECONSTRUCCIÓN TIENE QUE SER DE LA MISMA JORNADA ──────────────────────────────────────────────
 *
 * Fallo real medido en el canónico el 04/11/2026: en el grupo 3769 la tabla OFICIAL es de la jornada 2
 * (PJ=2) y la consulta cogía los goles reconstruidos de la jornada 4 (PJ=4), así que pintaba 14:2 en un
 * equipo que sólo había jugado dos partidos. No es un detalle estético: mezcla dos fotos y publica goles
 * que esa tabla todavía no cuenta.
 */
describe.skipIf(!hayCanonico)('los goles reconstruidos son de la misma jornada que la tabla oficial', () => {
  const GRUPO_EN_CURSO = 3769;

  it('el grupo 3769 pinta los goles de la reconstrucción de su jornada (2), no los de la última (4)', async () => {
    const filas = await consulta<Record<string, unknown>>(CLASIFICACION_DE_LA_PANTALLA.sql, [GRUPO_EN_CURSO]);
    expect(filas).toHaveLength(16);
    for (const f of filas) {
      expect(f.origen, 'la tabla que enseña la pantalla').toBe('oficial');
      expect(Number(f.jornada), 'la foto oficial es de la jornada 2').toBe(2);
      expect(Number(f.jugados)).toBe(2);
    }

    // La reconstrucción de la MISMA foto es la única válida.
    const mismaJornada = await consulta<Record<string, unknown>>(`
      select te.id as equipo_id, sr.goles_favor, sr.goles_contra
        from core.standing_snapshot sr
        join core.team_entry te on te.id = sr.team_entry_id
       where sr.phase_group_id = $1
         and sr.origen = 'reconstruida'
         and sr.matchday_id = (select max(st.matchday_id) from core.standing_snapshot st
                                where st.phase_group_id = $1 and st.origen = 'oficial')`, [GRUPO_EN_CURSO]);
    expect(mismaJornada).toHaveLength(16);
    const porEquipo = new Map(mismaJornada.map((r) => [Number(r.equipo_id), r]));
    for (const f of filas) {
      const reconstruida = porEquipo.get(Number(f.equipo_id));
      expect(reconstruida, `equipo ${String(f.equipo)}`).toBeDefined();
      expect(Number(f.goles_favor_reconstruida)).toBe(Number(reconstruida!.goles_favor));
      expect(Number(f.goles_contra_reconstruida)).toBe(Number(reconstruida!.goles_contra));
    }

    // Y no es la última reconstrucción del grupo: la de la jornada 4 suma más goles porque cuenta dos
    // jornadas más. Si la consulta volviera a coger la última, esta comprobación lo diría.
    const ultima = await consulta<Record<string, unknown>>(`
      select sum(sr.goles_favor)::int as goles
        from core.standing_snapshot sr
       where sr.phase_group_id = $1 and sr.origen = 'reconstruida'
         and sr.matchday_id = (select max(matchday_id) from core.standing_snapshot
                                where phase_group_id = $1 and origen = 'reconstruida')`, [GRUPO_EN_CURSO]);
    const sumaDeLaTabla = filas.reduce((t, f) => t + Number(f.goles_favor_reconstruida ?? 0), 0);
    const sumaDeLaUltima = Number(ultima[0]!.goles);
    expect(sumaDeLaTabla).toBeGreaterThan(0);
    expect(sumaDeLaTabla).toBeLessThan(sumaDeLaUltima);
  });

  it('sin reconstrucción de esa jornada devuelve null, no los goles de otra jornada', async () => {
    // Grupo 1181 (Euskadi, 2014-15): su tabla oficial no tiene reconstrucción en la misma jornada.
    const filas = await consulta<Record<string, unknown>>(CLASIFICACION_DE_LA_PANTALLA.sql, [1181]);
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f.goles_favor_reconstruida, `equipo ${String(f.equipo)}`).toBeNull();
      expect(f.goles_contra_reconstruida, `equipo ${String(f.equipo)}`).toBeNull();
    }
  });
});

describe.skipIf(!hayCanonico)('la cabecera enseña el nombre corto real de la federación', () => {
  it('Castilla y León tiene nombre corto y no hay que caer al nombre largo', async () => {
    for (const grupo of [797, 3769]) {
      const filas = await consulta<Record<string, unknown>>(GRUPO_POR_ID.sql, [grupo]);
      expect(filas, `grupo ${grupo}`).toHaveLength(1);
      expect(filas[0]!.federacion_corta, `grupo ${grupo}`).toBe('Castilla y León');
      expect(GRUPO_POR_ID.columnas).toContain('federacion_corta');
    }
  });
});

/**
 * Hallazgo C9 del QA: los extremos de la barra salían sólo de `played_at`, así que un grupo con
 * calendario pero sin resultados (75252: 6 partidos el 17/10/2026, ninguno jugado) no enseñaba fechas.
 * La fecha publicada que existe es `fecha_prevista`, y la barra la necesita para orientar la temporada.
 */
describe.skipIf(!hayCanonico)('los extremos de la barra usan también la fecha prevista', () => {
  it('un grupo con calendario y sin resultados enseña sus extremos', async () => {
    const filas = await consulta<Record<string, unknown>>(GRUPO_POR_ID.sql, [75252]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.fecha_inicio).toBe('2026-10-17');
    expect(filas[0]!.fecha_fin).toBe('2026-10-17');
    // Y no son inventadas: las 6 fechas del calendario son esa.
    expect(filas[0]!.equipos).toBeGreaterThan(0);
  });
});

describe.skipIf(!hayCanonico)('la hora de un partido sólo se enseña si la federación la publica', () => {
  it('un partido programado sin hora confirmada deja la hora en null (nunca 00:00)', async () => {
    // Grupo 75250 (CyL, 2026-27): todos sus partidos están programados y ninguno trae hora.
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24219264', 400]);
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f.hora, `partido ${String(f.match_id)}`).toBeNull();
    }
  });

  it('cuando la hora está confirmada, sale del partido con formato HH:MM', async () => {
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 400]);
    expect(filas).toHaveLength(32);
    for (const f of filas) {
      expect(String(f.hora), `partido ${String(f.match_id)}`).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
  });

  it('la consulta promete la columna y la página la usa para no inventar un marcador', () => {
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('hora');
    expect(marcadorDePartido({ goles_local: 2, goles_visitante: 1, hora: null }))
      .toEqual({ texto: '2 - 1', accesible: 'Resultado 2 a 1', jugado: true });
    expect(marcadorDePartido({ goles_local: null, goles_visitante: null, hora: '16:30' }))
      .toEqual({ texto: '16:30', accesible: '16:30. Sin resultado publicado', jugado: false });
    expect(marcadorDePartido({ goles_local: null, goles_visitante: null, hora: null }))
      .toEqual({ texto: '—', accesible: 'Sin resultado publicado', jugado: false });
    // Un marcador incompleto tampoco se completa a cero.
    expect(marcadorDePartido({ goles_local: 1, goles_visitante: null, hora: null }).texto).toBe('—');
  });
});

/**
 * El escudo es un MARCADOR DE POSICIÓN determinista, no la identidad del club: iniciales sobre un color
 * derivado del identificador. Lo que se prueba es que no cambia entre peticiones, que dos equipos no se
 * confunden y que el texto blanco se lee encima (AA, ≥ 4.5).
 */
describe('el escudo de marcador de posición', () => {
  /** Equipos reales del grupo 3769. */
  const EQUIPOS_3769 = Array.from({ length: 16 }, (_, i) => 17607 + i);

  /** Luminancia relativa WCAG de un `oklch(L C H)` sin alfa. */
  function luminancia(color: string): number {
    const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(color);
    expect(m, `color no reconocido: ${color}`).not.toBeNull();
    const l = Number(m![1]);
    const c = Number(m![2]);
    const h = (Number(m![3]) * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;
    const [rl, rm, rs] = [l_ ** 3, m_ ** 3, s_ ** 3];
    const canal = (x: number) => Math.min(1, Math.max(0, x));
    const r = canal(4.0767416621 * rl - 3.3077115913 * rm + 0.2309699292 * rs);
    const g = canal(-1.2684380046 * rl + 2.6097574011 * rm - 0.3413193965 * rs);
    const bl = canal(-0.0041960863 * rl - 0.7034186147 * rm + 1.707614701 * rs);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  }

  /** Contraste con `--texto-fuerte` (tinta-50) en el peor caso. */
  function contraste(color: string): number {
    const blanco = luminancia('oklch(0.98 0.003 250)');
    const y = luminancia(color);
    const [alto, bajo] = y > blanco ? [y, blanco] : [blanco, y];
    return (alto + 0.05) / (bajo + 0.05);
  }

  it('el mismo identificador da siempre el mismo color', () => {
    for (const id of EQUIPOS_3769) expect(colorDeEquipo(id)).toBe(colorDeEquipo(id));
  });

  it('dos equipos distintos no comparten color (los 16 reales del grupo 3769)', () => {
    const colores = new Set(EQUIPOS_3769.map((id) => colorDeEquipo(id)));
    expect(colores.size).toBe(EQUIPOS_3769.length);
  });

  it('el color no es una identidad inventada del club: cada uno se lee con texto blanco (AA)', () => {
    for (const id of EQUIPOS_3769) {
      expect(contraste(colorDeEquipo(id)), `equipo ${id}: ${colorDeEquipo(id)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el escudo es 22×24 fijo, decorativo y con las iniciales del nombre publicado', () => {
    const html = renderToStaticMarkup(createElement(Escudo, { equipoId: 17607, nombre: 'Burgos C.F. S.A.D.' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="22"');
    expect(html).toContain('height="24"');
    expect(html).toContain('BC');
  });
});

/**
 * Estados y pie de la clasificación, renderizados de verdad: lo que ve el usuario no es «una tabla con
 * filas», es una tabla que dice de dónde sale, hasta dónde llega y qué hace cuando no hay goles.
 */
describe('la clasificación renderizada dice la verdad del dato', () => {
  const filaBase: FilaClasificacionPantalla = {
    posicion: 1,
    equipo_id: 17607,
    equipo: 'Burgos C.F. S.A.D.',
    puntos: 6,
    jugados: 2,
    ganados: 2,
    empatados: 0,
    perdidos: 0,
    goles_favor: 0,
    goles_contra: 0,
    goles_favor_reconstruida: 5,
    goles_contra_reconstruida: 1,
    origen: 'oficial',
    jornada: 2,
  };
  const sinZonas = null;
  const sinRachas = new Map<number, string>();

  it('enseña los goles reconstruidos de la misma jornada y lo dice al pie', () => {
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [filaBase],
      rachas: new Map([[17607, 'GG']]),
      zonas: sinZonas,
      equipos: 16,
    }));
    expect(html).toContain('5:1');
    expect(html).not.toContain('0:0');
    expect(html).toMatch(/reconstruid/i);
    expect(html).toMatch(/jornada 2/i);
    // La tabla se desplaza dentro de su caja y las dos primeras columnas quedan fijas.
    expect(html).toContain('data-tabla-scroll');
    expect(html).toContain('scope="col"');
  });

  it('si esa jornada no tiene reconstrucción enseña «—» y lo explica, en vez de un cero', () => {
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [{ ...filaBase, goles_favor_reconstruida: null, goles_contra_reconstruida: null }],
      rachas: sinRachas,
      zonas: sinZonas,
      equipos: 16,
    }));
    expect(html).toContain('—');
    expect(html).not.toContain('0:0');
    expect(html).toMatch(/no hay reconstrucci/i);
  });

  it('si la reconstrucción de esa jornada está a medias, lo dice y no promete una tabla completa', () => {
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [
        filaBase,
        { ...filaBase, posicion: 2, equipo_id: 17608, equipo: 'C.D. Parquesol', goles_favor_reconstruida: null, goles_contra_reconstruida: null },
      ],
      rachas: sinRachas,
      zonas: sinZonas,
      equipos: 16,
    }));
    expect(html).toContain('5:1');
    expect(html).toContain('—');
    expect(html).toMatch(/incompleta/i);
  });

  it('sin clasificación no pinta una tabla vacía: lo dice', () => {
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [],
      rachas: sinRachas,
      zonas: sinZonas,
      equipos: 16,
    }));
    expect(html).not.toContain('<table');
    expect(html).toMatch(/no tiene clasificación publicada/i);
  });

  it('la forma que se pinta se explica al pie: misma jornada que la tabla', () => {
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [filaBase],
      rachas: new Map([[17607, 'GG']]),
      zonas: sinZonas,
      equipos: 16,
    }));
    expect(html).toMatch(/la forma cuenta los partidos hasta la misma jornada/i);
  });
});

/**
 * Decisión de David (04/11/2026): la forma se enseña en **V-E-D** (Victoria/Empate/Derrota).
 * El prototipo mezclaba V-E-D en Inicio y G-E-P en Competición; se unifica a V-E-D.
 *
 * El dato de origen NO cambia: las consultas y el dominio siguen devolviendo `Signo` G/E/P, y la
 * traducción vive en un único sitio (`lib/forma-equipo.ts`). Lo que esta prueba fija es lo que ve el
 * usuario: insignias V/E/D, cabecera V-E-D y títulos con la palabra, nunca la letra del dato.
 */
describe('la forma de la clasificación se pinta en V-E-D', () => {
  const filaForma: FilaClasificacionPantalla = {
    posicion: 1,
    equipo_id: 17607,
    equipo: 'Burgos C.F. S.A.D.',
    puntos: 6,
    jugados: 5,
    ganados: 2,
    empatados: 1,
    perdidos: 2,
    goles_favor: 0,
    goles_contra: 0,
    goles_favor_reconstruida: 5,
    goles_contra_reconstruida: 1,
    origen: 'oficial',
    jornada: 2,
  };

  const render = (rachas: Map<number, string>) => renderToStaticMarkup(createElement(Clasificacion, {
    filas: [filaForma], rachas, zonas: null, equipos: 16,
  }));

  /** Lo que un usuario ve dentro de una insignia de forma, sacado del HTML renderizado. */
  const insignias = (html: string) => [...html.matchAll(
    /<span([^>]*\btitle="(Victoria|Empate|Derrota)"[^>]*)>([^<]*)/g,
  )].map((m) => ({ etiqueta: m[2]!, letra: m[3]!.trim(), atributos: m[1]! }));

  it('las insignias muestran V/E/D y su palabra, nunca la letra del dato', () => {
    // La racha de origen sigue siendo G/E/P: es lo que devuelve la consulta y no se toca.
    const html = render(new Map([[17607, 'GGEPP']]));
    const pintadas = insignias(html);
    expect(pintadas.map(({ etiqueta, letra }) => ({ etiqueta, letra }))).toEqual([
      { etiqueta: 'Victoria', letra: 'V' },
      { etiqueta: 'Victoria', letra: 'V' },
      { etiqueta: 'Empate', letra: 'E' },
      { etiqueta: 'Derrota', letra: 'D' },
      { etiqueta: 'Derrota', letra: 'D' },
    ]);
    // Una insignia por resultado de la forma, ni una más ni una menos.
    expect(pintadas).toHaveLength(5);
    for (const { letra } of pintadas) expect(['V', 'E', 'D']).toContain(letra);
    // Y cada insignia lleva la palabra en el nombre accesible: nunca sólo la letra y el color.
    for (const { etiqueta, atributos } of pintadas) {
      expect(atributos).toContain(`aria-label="${etiqueta}"`);
      expect(atributos).toContain(`title="${etiqueta}"`);
    }
    // Y ninguna letra G/P se pinta como insignia (las palabras Goles/Ganados no son una insignia).
    expect(html).not.toMatch(/>G</);
    expect(html).not.toMatch(/>P</);
    expect(html).not.toMatch(/Ganado|Perdido/);
  });

  it('la cabecera de la columna dice V-E-D, no G-E-P', () => {
    const html = render(new Map([[17607, 'GG']]));
    expect(html).toContain('>V-E-D<');
    expect(html).not.toContain('>G-E-P<');
    // El título de la cabecera dice las palabras, no las siglas del dato.
    expect(html).toContain('title="Victorias-Empates-Derrotas"');
  });

  it('el caption de la tabla nombra las victorias, no los «ganados» del dato', () => {
    const html = render(new Map([[17607, 'GG']]));
    expect(html).toMatch(/victorias-empatadas-derrotas/i);
  });

  it('sin forma no se inventan insignias, y la cabecera sigue en V-E-D', () => {
    const html = render(new Map());
    expect(insignias(html)).toEqual([]);
    expect(html).toContain('>V-E-D<');
  });
});

/**
 * Hallazgo I1 del QA: con un nombre real de 61 caracteres a 400 px la celda del equipo medía 483 px y no
 * había forma de leerlo entero ni de recuperarlo. La celda se acota en móvil y el nombre completo queda
 * en el `title` y en el propio texto del DOM (el recorte es sólo visual, así que un lector de pantalla
 * sigue leyendo el nombre completo).
 */
describe('un nombre largo no rompe la tabla y sigue accesible', () => {
  const NOMBRE_LARGO = 'C.D. Tierra Castellana NEUMÁTICOS ABEL SANZ CIUDAD DE ARÉVALO';

  it('el nombre de 61 caracteres viaja entero en el HTML y en el title de la celda', () => {
    const fila: FilaClasificacionPantalla = {
      posicion: 1, equipo_id: 17607, equipo: NOMBRE_LARGO, puntos: 6, jugados: 2,
      ganados: 2, empatados: 0, perdidos: 0, goles_favor: 0, goles_contra: 0,
      goles_favor_reconstruida: 5, goles_contra_reconstruida: 1, origen: 'oficial', jornada: 2,
    };
    const html = renderToStaticMarkup(createElement(Clasificacion, {
      filas: [fila], rachas: new Map([[17607, 'GG']]), zonas: null, equipos: 16,
    }));
    expect(NOMBRE_LARGO.length).toBeGreaterThanOrEqual(45);
    expect(html).toContain(NOMBRE_LARGO);
    expect(html).toContain(`title="${NOMBRE_LARGO}"`);
  });
});

/** Hallazgo I9: el desplegable no puede ofrecer temporadas que el pie declara no publicadas. */
describe('el desplegable de temporada respeta la ventana publicada', () => {
  const opciones = [
    { temporada: '2026-27', edicion_id: 1, grupo_id: 1, grupos: 1 },
    { temporada: '2023-24', edicion_id: 2, grupo_id: 2, grupos: 1 },
    { temporada: '2013-14', edicion_id: 3, grupo_id: 3, grupos: 1 },
    { temporada: '2015-16', edicion_id: 4, grupo_id: 4, grupos: 1 },
  ];

  it('deja fuera las anteriores a la ventana que anuncia el pie', () => {
    expect(temporadasPublicables(opciones).map((t) => t.temporada)).toEqual(['2026-27', '2023-24']);
  });

  it('admite una ventana mínima explícita sin tocar la consulta', () => {
    expect(temporadasPublicables(opciones, '2025-26').map((t) => t.temporada)).toEqual(['2026-27']);
  });

  it('no cambia el orden que trae la base', () => {
    const desordenadas = [
      { temporada: '2024-25', edicion_id: 5, grupo_id: 5, grupos: 1 },
      { temporada: '2026-27', edicion_id: 1, grupo_id: 1, grupos: 1 },
    ];
    expect(temporadasPublicables(desordenadas).map((t) => t.temporada)).toEqual(['2024-25', '2026-27']);
  });
});

/** Hallazgo C7: la pestaña del navegador tiene que decir qué competición se está mirando. */
describe('el título de la pestaña', () => {
  it('nombra la competición y el grupo, no siempre «facylf»', () => {
    expect(tituloDeCompeticion({ edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III' }))
      .toBe('Liga Nacional Juvenil · Primera - III — facylf');
  });
});

/** Hallazgo I5: el esqueleto tiene que medir lo mismo que el contenido, o la página salta al llegar. */
describe('el esqueleto de carga tiene las dimensiones del contenido', () => {
  it('pinta una fila de clasificación por equipo y ocho en cada tarjeta lateral', () => {
    const html = renderToStaticMarkup(createElement(EsqueletoContenido, { filas: 16 }));
    expect((html.match(/data-esqueleto="clasificacion"/g) ?? []).length).toBe(16);
    expect((html.match(/data-esqueleto="jornada"/g) ?? []).length).toBe(8);
    expect((html.match(/data-esqueleto="goleadores"/g) ?? []).length).toBe(8);
    expect(html).toContain('role="status"');
    // Nunca un spinner: el esqueleto no debe anunciar «cargando» con animación ni desplazar.
    expect(html).not.toContain('<svg');
  });
});

/** Hallazgo I4: los números que se comparan en vertical llevan `tabular-nums`. */
describe('los números de las tarjetas se comparan en vertical', () => {
  const filaGoleador: FilaRanking = {
    posicion: 1, persona_id: 1, grupo_persona_id: 1, nombre: 'NOMBRE ADULTO', es_menor: false,
    equipo_id: 17607, equipo: 'Burgos C.F. S.A.D.', club_id: 1, federacion: 'castilla-leon',
    federacion_nombre: 'Castilla y León', edicion: 'Liga Nacional Juvenil', division: 'liga-nacional',
    grupo: 'Primera - III', goles: 12, goles_penalti: 0, partidos: 20, goles_por_partido: 0.6,
    minutos_por_gol: null, total: 12,
  };

  it('los goles de Goleadores llevan tabular-nums', () => {
    const html = renderToStaticMarkup(createElement(Goleadores, { filas: [filaGoleador] }));
    expect(html).toContain('tabular-nums');
  });

  it('los marcadores de la Jornada llevan tabular-nums', () => {
    const partido: FilaPartidoCanonico = {
      match_id: 1, jornada: 4, orden: 1, fecha: '2026-10-03', hora: null,
      local_id: 17607, visitante_id: 17608, local: 'Burgos C.F. S.A.D.', visitante: 'C.D. Parquesol',
      goles_local: 2, goles_visitante: 1, campo: null, arbitro: null, calidad_acta: null, estado: 'played',
    };
    const html = renderToStaticMarkup(createElement(Jornada, {
      numero: 4, partidos: [partido], hrefAnterior: null, hrefSiguiente: null,
    }));
    expect(html).toContain('tabular-nums');
  });
});

/** El subtítulo de la cabecera no repite la edición ni rellena lo que el vocabulario no sabe. */
describe('el subtítulo de la competición', () => {
  it('no repite «Liga Nacional» si ya está en el nombre de la edición', () => {
    expect(subtituloCompeticion({
      categoria: 'juvenil', modalidad: 'desconocida', ambito: 'nacional',
      division: 'liga-nacional', edicion: 'Liga Nacional Juvenil',
    })).toBe('Juvenil · Nacional');
  });

  it('enseña modalidad y división cuando aportan', () => {
    expect(subtituloCompeticion({
      categoria: 'juvenil', modalidad: 'futbol11', ambito: 'regional',
      division: 'preferente', edicion: 'Liga Juvenil',
    })).toBe('Juvenil · Fútbol 11 · Regional · Preferente');
  });

  it('lo desconocido no se disfraza de dato', () => {
    expect(subtituloCompeticion({
      categoria: 'cadete', modalidad: 'desconocida', ambito: 'desconocido',
      division: 'desconocida', edicion: 'Liga Cadete',
    })).toBe('Cadete');
  });
});

/**
 * ── LA FORMA TIENE QUE SER DE LA MISMA FOTO QUE LA TABLA ─────────────────────────────────────────────
 *
 * Hallazgo I2 del QA: en el grupo 3769 la tabla es la oficial de la jornada 2 (PJ=2) pero la forma venía
 * de `RACHAS_DEL_GRUPO`, que cuenta los 4 partidos jugados del grupo: una fila decía «2 partidos
 * jugados» y enseñaba 4 insignias. La forma se calcula ahora con los partidos del propio grupo, cortados
 * en la jornada de la tabla, del más antiguo al más reciente y como máximo cinco.
 */
describe('la forma se cuenta hasta la jornada de la tabla', () => {
  // Equipo 1 juega una jornada detrás de otra; los demás equipos sólo rellenan el calendario.
  const partidos = [
    { jornada: 1, local_id: 1, visitante_id: 2, goles_local: 2, goles_visitante: 0 }, // G
    { jornada: 2, local_id: 3, visitante_id: 1, goles_local: 3, goles_visitante: 0 }, // P (fuera)
    { jornada: 3, local_id: 1, visitante_id: 4, goles_local: 1, goles_visitante: 1 }, // E
    { jornada: 4, local_id: 5, visitante_id: 1, goles_local: 1, goles_visitante: 2 }, // G (fuera)
    { jornada: 5, local_id: 1, visitante_id: 6, goles_local: 3, goles_visitante: 1 }, // G
    { jornada: 6, local_id: 7, visitante_id: 1, goles_local: 4, goles_visitante: 2 }, // P (fuera)
    { jornada: 7, local_id: 1, visitante_id: 8, goles_local: null, goles_visitante: null }, // sin resultado
  ];

  it('corta en la jornada pedida y la enseña del más antiguo al más reciente', () => {
    expect(formaHasta(partidos, 1, 2)).toEqual(['G', 'P']);
    expect(formaHasta(partidos, 1, 3)).toEqual(['G', 'P', 'E']);
  });

  it('se queda con los cinco últimos de la ventana, no con todos', () => {
    expect(formaHasta(partidos, 1, 6)).toEqual(['P', 'E', 'G', 'G', 'P']);
    expect(formaHasta(partidos, 1, 5)).toEqual(['G', 'P', 'E', 'G', 'G']);
  });

  it('un partido sin resultado no se convierte en empate ni en derrota', () => {
    expect(formaHasta(partidos, 1, 7)).toEqual(['P', 'E', 'G', 'G', 'P']);
  });

  it('un equipo sin partidos en la ventana no tiene forma', () => {
    expect(formaHasta(partidos, 99, 7)).toEqual([]);
    expect(formaHasta(partidos, 1, 0)).toEqual([]);
  });
});

describe.skipIf(!hayCanonico)('la forma que enseña la pantalla no mezcla coberturas (grupo 3769)', () => {
  const GRUPO_EN_CURSO = 3769;

  it('la consulta de partidos trae los dos equipos: sin sus ids no se puede calcular la forma', () => {
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('local_id');
    expect(PARTIDOS_DE_GRUPO.columnas).toContain('visitante_id');
  });

  it('cada fila enseña como mucho tantas insignias como partidos jugados, y min(5, PJ) cuando hay bastantes', async () => {
    const [clasificacion, partidos] = await Promise.all([
      consulta<FilaClasificacionPantalla>(CLASIFICACION_DE_LA_PANTALLA.sql, [GRUPO_EN_CURSO]),
      consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 400]),
    ]);
    expect(clasificacion).toHaveLength(16);
    expect(partidos).toHaveLength(32);
    for (const f of clasificacion) {
      const forma = formaHasta(partidos, f.equipo_id, f.jornada);
      const jugados = f.jugados;
      expect(forma.length, `equipo ${f.equipo}: PJ=${jugados}, forma=${forma.join('')}`)
        .toBeLessThanOrEqual(jugados);
      expect(forma.length, `equipo ${f.equipo}`).toBe(Math.min(5, jugados));
    }
    // La foto de la tabla es la jornada 2: ningún equipo puede tener 4 insignias (eso eran los 4
    // partidos jugados del grupo, el fallo del QA).
    expect(partidos.filter((p) => p.jornada <= 2 && p.goles_local !== null)).toHaveLength(16);
    for (const f of clasificacion) {
      expect(formaHasta(partidos, f.equipo_id, f.jornada).length).toBe(2);
    }
  });
});
