import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CLASIFICACION_DE_LA_PANTALLA, CONSULTAS_COMPETICIONES, EDICIONES_DE_LA_COMPETICION, GRUPO_POR_ID,
  GRUPOS_DE_LA_EDICION, PARAMETROS_COMPETICIONES,
} from '../src/consultas/competiciones';
import { RANKING_GOLEADORES } from '../src/consultas/paneles';
import { ZONAS_DEL_GRUPO } from '../src/consultas/paneles';
import { RACHAS_DEL_GRUPO } from '../src/consultas/analisis';
import { nombreVisible } from '../src/lib/menores';
import { formaDe, golesDeLaFila, publicaGoles, siglas, zonaDe } from '../src/lib/pantalla-competicion';

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

  it('la forma se pinta como insignias y nunca con letras que no sean G, E o P', () => {
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
