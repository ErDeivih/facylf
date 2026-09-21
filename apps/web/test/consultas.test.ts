import { describe, expect, it, afterAll } from 'vitest';
import { CanonicoNoDisponible, cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  COBERTURA_POR_FEDERACION, COBERTURA_POR_GRUPO, CONSULTAS_COBERTURA, GRUPOS_DEL_CANONICO, PARAMETROS_POR_DEFECTO, RESUMEN_CANONICO,
} from '../src/consultas/cobertura';
import { indexaGrupos } from '../src/lib/canonico-grupos';
import { CLASIFICACION_DEL_GRUPO, CONSULTAS_PARTIDOS, GOLES_DE_PARTIDOS, GRUPO_DEL_CANONICO, PARAMETROS_PARTIDOS, PARTIDOS_DE_GRUPO } from '../src/consultas/partidos';
import { ESTADOS_VISIBILIDAD } from '../src/consultas/contratos';

/**
 * Prueba de contrato de las consultas del canónico (CALIDAD-PRUEBAS.md).
 *
 * Lo que se defiende aquí no es que PostgreSQL funcione: es que una consulta no pueda cambiar de
 * forma sin que alguien se entere, y que no devuelva un número plausible y falso. Un `null`
 * convertido en `0` es exactamente el fallo que estas pruebas buscan.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

describe('contrato estático de las consultas', () => {
  it('todas llevan LIMIT: ninguna consulta web puede devolver una tabla entera', () => {
    for (const c of CONSULTAS_COBERTURA) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
    }
  });

  it('ningún valor se interpola en el SQL: ni plantillas ni concatenación', () => {
    for (const c of CONSULTAS_COBERTURA) {
      expect(c.sql, `${c.nombre} interpola una plantilla`).not.toContain('${');
      // Concatenar `'...' + valor` es la otra forma de colar un valor dentro del texto de la consulta.
      expect(/(['"`])\s*\+\s*\w/.test(c.sql), `${c.nombre} concatena texto con algo`).toBe(false);
    }
  });

  it('toda consulta con filtro variable usa parámetros numerados', () => {
    const conFiltro = CONSULTAS_COBERTURA.filter((c) => c.sql.includes('$1'));
    expect(conFiltro.map((c) => c.nombre).sort()).toEqual(['cobertura-por-grupo']);
    expect(COBERTURA_POR_GRUPO.sql).toContain('$2');
  });

  it('cada consulta declara nombre, descripción, presupuesto y columnas', () => {
    for (const c of CONSULTAS_COBERTURA) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_POR_DEFECTO[c.nombre], `${c.nombre} sin parámetros por defecto`).toBeDefined();
    }
  });
});

describe.skipIf(!hayCanonico)('contrato contra el canónico real', () => {
  it('el resumen devuelve exactamente las columnas prometidas y una sola fila', async () => {
    const filas = await consulta(RESUMEN_CANONICO.sql, PARAMETROS_POR_DEFECTO[RESUMEN_CANONICO.nombre]);
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0]!).sort()).toEqual([...RESUMEN_CANONICO.columnas].sort());
    for (const clave of ['federaciones', 'grupos', 'partidos', 'participaciones', 'personas']) {
      expect(Number(filas[0]![clave]), `${clave} no es un número`).toBeGreaterThanOrEqual(0);
    }
  });

  it('la cobertura por federación promete sus columnas y reparte todos los grupos sin perder ninguno', async () => {
    const filas = await consulta(COBERTURA_POR_FEDERACION.sql, []);
    expect(filas.length).toBeLessThanOrEqual(100);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...COBERTURA_POR_FEDERACION.columnas].sort());
      // Cada grupo o tiene punto de control (completo o parcial), o cuenta como «sin cobertura».
      expect(Number(fila.grupos_completos) + Number(fila.grupos_parciales) + Number(fila.grupos_sin_cobertura))
        .toBe(Number(fila.grupos));
    }
  });

  it('la cobertura por grupo respeta las invariantes del dato: no hay más resultados que partidos', async () => {
    const filas = await consulta(COBERTURA_POR_GRUPO.sql, PARAMETROS_POR_DEFECTO[COBERTURA_POR_GRUPO.nombre]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...COBERTURA_POR_GRUPO.columnas].sort());
      const conocidos = Number(fila.partidos_conocidos ?? 0);
      const conResultado = Number(fila.partidos_con_resultado ?? 0);
      expect(conResultado, `${fila.grupo_codigo}: más resultados que partidos`).toBeLessThanOrEqual(conocidos);
      if (fila.complete_through_matchday !== null) {
        expect(fila.complete_through_matchday).toBeGreaterThan(0);
        // No puede estar completo hasta una jornada que no ha llegado.
        expect(fila.complete_through_matchday)
          .toBeLessThanOrEqual(Number(fila.jornadas_previstas ?? fila.complete_through_matchday));
      }
      if (fila.visibility_state !== null) {
        expect(ESTADOS_VISIBILIDAD).toContain(fila.visibility_state);
      }
    }
  });

  it('un grupo con visibilidad «completa» tiene todos sus resultados y todas sus actas parseadas', async () => {
    const filas = await consulta(COBERTURA_POR_GRUPO.sql, [null, 200]);
    for (const fila of filas.filter((f) => f.visibility_state === 'completa')) {
      expect(Number(fila.partidos_con_resultado), `${fila.grupo_codigo}: completa sin todos los resultados`)
        .toBe(Number(fila.partidos_conocidos));
      expect(Number(fila.actas_parseadas), `${fila.grupo_codigo}: completa con actas sin parsear`)
        .toBe(Number(fila.actas_disponibles));
    }
  });

  it('un grupo a medias NO dice «completa»: la página no puede prometer más de lo que hay', async () => {
    const filas = await consulta(COBERTURA_POR_GRUPO.sql, [null, 200]);
    for (const fila of filas) {
      if (fila.visibility_state !== 'completa') continue;
      const previstas = fila.jornadas_previstas;
      if (previstas === null) continue;
      // Estar «completa» con la temporada a medias sólo es legítimo si se han jugado todas las
      // jornadas previstas; si no, la cobertura está mal calculada.
      const todosLosPartidos = Number(fila.partidos_conocidos);
      const conResultado = Number(fila.partidos_con_resultado);
      expect(conResultado === todosLosPartidos).toBe(true);
    }
  });

  it('filtrar por federación devuelve sólo esa federación', async () => {
    const todas = await consulta(COBERTURA_POR_GRUPO.sql, [null, 200]);
    const codigo = String(todas[0]!.federacion);
    const filtradas = await consulta(COBERTURA_POR_GRUPO.sql, [codigo, 200]);
    expect(filtradas.length).toBeGreaterThan(0);
    expect(new Set(filtradas.map((f) => f.federacion))).toEqual(new Set([codigo]));
  });

  it('el límite se respeta de verdad', async () => {
    const filas = await consulta(COBERTURA_POR_GRUPO.sql, [null, 1]);
    expect(filas.length).toBeLessThanOrEqual(1);
  });
});

describe.skipIf(hayCanonico)('sin canónico disponible', () => {
  it('la web dice por qué no puede leer, en vez de enseñar datos vacíos como si fueran buenos', async () => {
    expect(motivo).not.toBeNull();
    await expect(consulta(RESUMEN_CANONICO.sql, [])).rejects.toBeInstanceOf(CanonicoNoDisponible);
  });
});

/**
 * El puente entre el catálogo y el canónico: qué grupos están importados, para poder marcarlos y
 * enlazarlos desde las páginas que navegan las colas.
 */
describe('grupos en el canónico', () => {
  it('indexa por federación y grupo, sin mezclar federaciones con el mismo código de grupo', () => {
    const mapa = indexaGrupos([
      { federacion: 'castilla-leon', grupo_codigo: '9001', visibility_state: 'completa', complete_through_matchday: 34, partidos_conocidos: 306, partidos_con_resultado: 306, calculado_en: null },
      { federacion: 'canarias', grupo_codigo: '9001', visibility_state: 'oculta', complete_through_matchday: null, partidos_conocidos: 0, partidos_con_resultado: 0, calculado_en: null },
    ]);
    expect(mapa.size).toBe(2);
    expect(mapa.get('castilla-leon|9001')?.visibility_state).toBe('completa');
    // Mismo código de grupo en dos federaciones distintas: son dos grupos distintos.
    expect(mapa.get('canarias|9001')?.visibility_state).toBe('oculta');
    expect(mapa.get('galicia|9001')).toBeUndefined();
  });

  it('la consulta respeta la promesa de columnas y lleva LIMIT', async () => {
    expect(GRUPOS_DEL_CANONICO.sql.toLowerCase()).toContain('limit');
    if (!hayCanonico) return;
    const filas = await consulta(GRUPOS_DEL_CANONICO.sql, []);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...GRUPOS_DEL_CANONICO.columnas].sort());
      expect(String(fila.federacion).length).toBeGreaterThan(0);
      expect(String(fila.grupo_codigo).length).toBeGreaterThan(0);
      if (fila.visibility_state !== null) expect(ESTADOS_VISIBILIDAD).toContain(fila.visibility_state);
    }
  });
});

/**
 * El detalle de un grupo: la pantalla que enseña resultados y goleadores. Aquí se defiende que un
 * marcador ausente siga siendo `null` (y no un 0-0), que un penalti no se confunda con un gol normal
 * y que quien sólo se conoce por su nombre venga marcado.
 */
describe('contrato estático de las consultas de partidos', () => {
  it('todas llevan LIMIT y ningún valor interpolado', () => {
    for (const c of CONSULTAS_PARTIDOS) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
      expect(c.sql, `${c.nombre} interpola`).not.toContain('${');
    }
  });
});

describe.skipIf(!hayCanonico)('contrato de las consultas de partidos contra el canónico', () => {
  const [FED, GRUPO] = ['castilla-leon', '11379752'] as const;

  it('la cabecera del grupo devuelve una fila con lo que promete', async () => {
    const [cabecera] = await consulta(GRUPO_DEL_CANONICO.sql, [FED, GRUPO]);
    expect(cabecera).toBeDefined();
    expect(Object.keys(cabecera!).sort()).toEqual([...GRUPO_DEL_CANONICO.columnas].sort());
    expect(cabecera!.federacion).toBe(FED);
    expect(cabecera!.grupo_codigo).toBe(GRUPO);
  });

  it('los partidos respetan el orden de jornada y no inventan marcadores', async () => {
    const filas = await consulta(PARTIDOS_DE_GRUPO.sql, [FED, GRUPO, PARAMETROS_PARTIDOS['partidos-de-grupo']![2]]);
    expect(filas.length).toBeGreaterThan(300);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...PARTIDOS_DE_GRUPO.columnas].sort());
      expect(fila.local.length).toBeGreaterThan(0);
      expect(fila.visitante.length).toBeGreaterThan(0);
      // Un marcador ausente es `null`, nunca 0. Y si hay uno, los dos lados son números.
      if (fila.goles_local === null || fila.goles_visitante === null) {
        expect(fila.goles_local === null && fila.goles_visitante === null).toBe(true);
      } else {
        expect(Number.isInteger(fila.goles_local) && Number.isInteger(fila.goles_visitante)).toBe(true);
      }
    }
    const jornadas = filas.map((f) => f.jornada);
    expect([...jornadas].sort((a, b) => a - b)).toEqual(jornadas);
  });

  it('los goles traen autoría, minuto y la marca de identidad nominal', async () => {
    const filas = await consulta(GOLES_DE_PARTIDOS.sql, [FED, GRUPO, PARAMETROS_PARTIDOS['goles-de-partidos']![2]]);
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...GOLES_DE_PARTIDOS.columnas].sort());
      expect(fila.autor.length).toBeGreaterThan(0);
      expect(['normal', 'penalti', 'propia_puerta', null]).toContain(fila.subtipo);
      expect(typeof fila.identidad_nominal).toBe('boolean');
    }
  });

  it('los goles suman lo mismo que el marcador en los partidos completos', async () => {
    const partidos = await consulta(PARTIDOS_DE_GRUPO.sql, [FED, GRUPO, 400]);
    const goles = await consulta(GOLES_DE_PARTIDOS.sql, [FED, GRUPO, 4000]);
    const porPartido = new Map<number, number>();
    for (const gol of goles) {
      // La propia puerta cuenta para el rival, pero suma al total del partido igual.
      porPartido.set(gol.match_id, (porPartido.get(gol.match_id) ?? 0) + 1);
    }
    let cuadran = 0;
    let discrepan = 0;
    for (const partido of partidos) {
      if (partido.goles_local === null || partido.goles_visitante === null) continue;
      const desdeMarcador = partido.goles_local + partido.goles_visitante;
      const desdeEventos = porPartido.get(partido.match_id) ?? 0;
      if (desdeMarcador === desdeEventos) cuadran += 1;
      else discrepan += 1;
    }
    // Las diferencias existen y están registradas como incidencia en `core.match_report`, pero no
    // pueden ser la norma: si lo fueran, la página de goleadores estaría contando otra cosa.
    expect(cuadran).toBeGreaterThan(discrepan * 10);
  });

  it('un grupo que no está importado devuelve cero filas, no una fila vacía', async () => {
    const filas = await consulta(GRUPO_DEL_CANONICO.sql, ['castilla-leon', 'no-existe-999']);
    expect(filas).toHaveLength(0);
  });

  it('la clasificación cuadra consigo misma y dice de dónde sale', async () => {
    const filas = await consulta<{ posicion: number; origen: string; jugados: number; ganados: number; empatados: number; perdidos: number; puntos: number; goles_favor: number; goles_contra: number }>(
      CLASIFICACION_DEL_GRUPO.sql, [FED, GRUPO]);
    expect(filas.length).toBeGreaterThan(10);
    // Pueden convivir las dos tablas —la oficial y la reconstruida— y la web enseña una sola. Aquí se
    // comprueba que cada una cuadra consigo misma, que es lo que delata una suma mal hecha.
    const porOrigen = new Map<string, typeof filas>();
    for (const fila of filas) {
      expect(['oficial', 'reconstruida']).toContain(fila.origen);
      expect(fila.ganados + fila.empatados + fila.perdidos).toBe(fila.jugados);
      expect(fila.puntos).toBe(fila.ganados * 3 + fila.empatados);
      expect(fila.goles_favor).toBeGreaterThanOrEqual(0);
      expect(fila.goles_contra).toBeGreaterThanOrEqual(0);
      porOrigen.set(fila.origen, [...(porOrigen.get(fila.origen) ?? []), fila]);
    }
    for (const [origen, tabla] of porOrigen) {
      const posiciones = tabla.map((f) => f.posicion);
      expect(posiciones[0], `${origen} no empieza en 1`).toBe(1);
      expect([...posiciones].sort((a, b) => a - b), `${origen} con posiciones desordenadas`).toEqual(posiciones);
      // Todos los equipos de una tabla de grupo han jugado los mismos partidos... salvo cuando el
      // calendario de la fuente asigna mal algún partido, que es justo lo que la oficial destapa.
    }
  });
});
