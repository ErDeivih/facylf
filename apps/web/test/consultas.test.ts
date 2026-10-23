import { describe, expect, it, afterAll } from 'vitest';
import { CanonicoNoDisponible, cierraCanonico, consulta, consultaEnUnaFoto, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  COBERTURA_POR_FEDERACION, COBERTURA_POR_GRUPO, CONSULTAS_COBERTURA, GRUPOS_DEL_CANONICO, PARAMETROS_POR_DEFECTO, RESUMEN_CANONICO,
} from '../src/consultas/cobertura';
import {
  CONSULTAS_CATALOGO, FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, LISTADO_DE_GRUPOS, PARAMETROS_CATALOGO, RECUENTOS_DEL_CANONICO,
} from '../src/consultas/catalogo';
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
    const filas = await consulta(RESUMEN_CANONICO.sql, PARAMETROS_POR_DEFECTO[RESUMEN_CANONICO.nombre],
      { presupuestoMs: RESUMEN_CANONICO.presupuestoMs });
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

/**
 * El catálogo: las federaciones, el listado de grupos y los recuentos de la portada.
 *
 * Estas consultas son las que llevaron la portada, `/federaciones` y `/competiciones` de las colas
 * SQLite al canónico. Lo que se defiende aquí, además del contrato de siempre:
 *
 * - que un grupo **sin punto de control** venga con `null` en toda su cobertura y no con ceros (es la
 *   diferencia entre «no lo sé» y «no hay nada»);
 * - que la paginación no repita ni pierda filas: `total` cuenta lo que cumple los filtros y el orden es
 *   estable;
 * - que una federación sin nada importado traiga `null` en sus sumas, no `0`.
 */
describe('contrato estático de las consultas del catálogo', () => {
  it('todas llevan LIMIT y ningún valor interpolado', () => {
    for (const c of CONSULTAS_CATALOGO) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
      expect(c.sql, `${c.nombre} interpola una plantilla`).not.toContain('${');
      expect(/(['"`])\s*\+\s*\w/.test(c.sql), `${c.nombre} concatena texto con algo`).toBe(false);
    }
  });

  it('el listado filtra por parámetros numerados, del primero al último, y no le sobra ninguno', () => {
    // 13 parámetros: federación, temporada, temporada mínima, ámbitos, modalidad, género, categoría,
    // provincia, nivel, búsqueda, con datos, límite y desplazamiento.
    for (let n = 1; n <= 13; n += 1) {
      expect(LISTADO_DE_GRUPOS.sql, `falta $${n}`).toContain(`$${n}`);
    }
    expect(LISTADO_DE_GRUPOS.sql, 'hay un parámetro de más').not.toContain('$14');
    expect(PARAMETROS_CATALOGO[LISTADO_DE_GRUPOS.nombre]).toHaveLength(13);
  });

  it('cada consulta declara nombre, descripción, presupuesto, plan, columnas y parámetros', () => {
    for (const c of CONSULTAS_CATALOGO) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(['indexado', 'agregado']).toContain(c.plan);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_CATALOGO[c.nombre], `${c.nombre} sin parámetros declarados`).toBeDefined();
    }
  });
});

describe.skipIf(!hayCanonico)('contrato del catálogo contra el canónico', () => {
  const sinFiltros = (limite: number, desplazamiento = 0) =>
    [null, null, null, null, null, null, null, null, null, '', false, limite, desplazamiento] as const;

  it('el listado devuelve exactamente las columnas prometidas y un renglón por grupo', async () => {
    const filas = await consulta(LISTADO_DE_GRUPOS.sql, sinFiltros(80));
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...LISTADO_DE_GRUPOS.columnas].sort());
      expect(String(fila.federacion).length).toBeGreaterThan(0);
      expect(String(fila.grupo_codigo).length).toBeGreaterThan(0);
      expect(String(fila.edicion_codigo).length).toBeGreaterThan(0);
      expect(String(fila.temporada)).toMatch(/^\d{4}-\d{2}$/);
      expect(Number(fila.inscripciones)).toBeGreaterThanOrEqual(0);
      // Un renglón por grupo: la clave (federación, grupo) no se repite dentro de la página.
      if (fila.jornadas_previstas !== null) expect(fila.jornadas_previstas).toBeGreaterThan(0);
    }
    const claves = filas.map((f) => `${f.federacion}|${f.grupo_codigo}`);
    expect(new Set(claves).size, 'el mismo grupo dos veces en una página').toBe(claves.length);
  });

  it('la cobertura del listado respeta las invariantes del dato y el estado de visibilidad', async () => {
    const filas = await consulta(LISTADO_DE_GRUPOS.sql, sinFiltros(80));
    for (const fila of filas) {
      const conocidos = fila.partidos_conocidos === null ? null : Number(fila.partidos_conocidos);
      const conResultado = fila.partidos_con_resultado === null ? null : Number(fila.partidos_con_resultado);
      if (conocidos !== null && conResultado !== null) {
        expect(conResultado, `${fila.grupo_codigo}: más resultados que partidos`).toBeLessThanOrEqual(conocidos);
      }
      if (fila.visibility_state !== null) expect(ESTADOS_VISIBILIDAD).toContain(fila.visibility_state);
    }
  });

  it('un grupo sin punto de control no enseña ceros: toda su cobertura es nula', async () => {
    const filas = await consulta(LISTADO_DE_GRUPOS.sql, sinFiltros(500));
    for (const fila of filas) {
      if (fila.visibility_state !== null) continue;
      // Sin fila en `ops.coverage_checkpoint` no hay medición: ni partidos, ni actas, ni fecha. Si aquí
      // apareciera un 0, la web lo pintaría como «no hay partidos» y estaría mintiendo.
      expect(fila.partidos_conocidos, `${fila.grupo_codigo} sin punto de control con partidos`).toBeNull();
      expect(fila.partidos_con_resultado).toBeNull();
      expect(fila.actas_disponibles).toBeNull();
      expect(fila.actas_parseadas).toBeNull();
      expect(fila.complete_through_matchday).toBeNull();
      expect(fila.calculado_en).toBeNull();
    }
  });

  it('el filtro de federación devuelve sólo esa federación y el de conDatos sólo grupos con partidos', async () => {
    const todas = await consulta(LISTADO_DE_GRUPOS.sql, sinFiltros(80));
    const codigo = String(todas[0]!.federacion);
    const filtradas = await consulta(LISTADO_DE_GRUPOS.sql,
      [codigo, null, null, null, null, null, null, null, null, '', false, 80, 0]);
    expect(filtradas.length).toBeGreaterThan(0);
    expect(new Set(filtradas.map((f) => f.federacion))).toEqual(new Set([codigo]));

    const conDatos = await consulta(LISTADO_DE_GRUPOS.sql,
      [null, null, null, null, null, null, null, null, null, '', true, 80, 0]);
    for (const fila of conDatos) {
      expect(Number(fila.partidos_conocidos), `${fila.grupo_codigo} sin partidos en el filtro conDatos`)
        .toBeGreaterThan(0);
    }
  });

  it('los filtros de vocabulario y el texto de búsqueda acotan de verdad', async () => {
    const ambitos = await consulta(LISTADO_DE_GRUPOS.sql,
      [null, null, null, ['nacional', 'regional', 'ascenso'], null, null, null, null, null, '', false, 80, 0]);
    for (const fila of ambitos) {
      expect(['nacional', 'regional', 'ascenso']).toContain(fila.ambito);
    }

    const categoria = await consulta(LISTADO_DE_GRUPOS.sql,
      [null, null, null, null, null, null, 'juvenil', null, null, '', false, 80, 0]);
    for (const fila of categoria) expect(fila.categoria).toBe('juvenil');

    const buscados = await consulta(LISTADO_DE_GRUPOS.sql,
      [null, null, null, null, null, null, null, null, null, 'salamanca', false, 80, 0]);
    const sinAcentos = (v: string) => v.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const fila of buscados) {
      expect(sinAcentos(`${fila.edicion} ${fila.grupo} ${fila.temporada}`)).toContain('salamanca');
    }
  });

  it('la paginación cuenta lo que cumple los filtros y no repite ni pierde filas', async () => {
    // Las dos páginas se piden EN LA MISMA FOTO del canónico: con dos consultas sueltas, el importador
    // escribiendo hace que el `total` cambie de una a otra y la prueba falla sin que la paginación tenga
    // nada que ver (§3.18 de la guía).
    const [primera, segunda] = await consultaEnUnaFoto([
      { sql: LISTADO_DE_GRUPOS.sql, parametros: sinFiltros(2, 0) },
      { sql: LISTADO_DE_GRUPOS.sql, parametros: sinFiltros(2, 2) },
    ]);
    expect(primera.length).toBeLessThanOrEqual(2);
    // `total` es lo que cumple los filtros, no lo que se devuelve: es lo que usan los enlaces de página.
    expect(Number(primera[0]!.total)).toBeGreaterThanOrEqual(primera.length);
    expect(segunda[0]!.total, 'el total cambia entre páginas').toBe(primera[0]!.total);
    const claves = [...primera, ...segunda].map((f) => `${f.federacion}|${f.grupo_codigo}`);
    expect(new Set(claves).size, 'la página 2 repite filas de la 1').toBe(claves.length);
  });

  it('las federaciones salen todas las declaradas, sin duplicados y con sus invariantes', async () => {
    const filas = await consulta(FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    // El canónico declara las territoriales (y hoy, además, las federaciones de pruebas del entorno).
    expect(filas.length).toBeGreaterThanOrEqual(19);
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(filas.length);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...FEDERACIONES_DEL_CANONICO.columnas].sort());
      expect(String(fila.codigo).length).toBeGreaterThan(0);
      expect(String(fila.nombre).length).toBeGreaterThan(0);
      expect(['pnfg', 'isquad', 'fcf', 'ninguno']).toContain(fila.adaptador);
      // Cada grupo o tiene punto de control medido, o cuenta como «sin cobertura»: no se pierde ninguno.
      expect(Number(fila.grupos_completos) + Number(fila.grupos_parciales) + Number(fila.grupos_sin_cobertura))
        .toBe(Number(fila.grupos));
      expect(Number(fila.grupos_medidos)).toBeLessThanOrEqual(Number(fila.grupos));
      if (Number(fila.grupos_medidos) === 0) {
        // Aquí está la diferencia entre «no hay nada» y «no lo sé»: sin punto de control, las sumas son
        // nulas. Un 0 se leería como «esta federación no tiene partidos» y no es lo que se sabe.
        expect(fila.partidos_conocidos, `${fila.codigo} sin medición pero con partidos`).toBeNull();
        expect(fila.calculado_en).toBeNull();
      }
      if (fila.partidos_conocidos !== null && fila.partidos_con_resultado !== null) {
        expect(Number(fila.partidos_con_resultado)).toBeLessThanOrEqual(Number(fila.partidos_conocidos));
      }
    }
  });

  it('los recuentos de la portada traen una sola fila, sus columnas y ninguna suma inventada', async () => {
    const filas = await consulta(RECUENTOS_DEL_CANONICO.sql, PARAMETROS_CATALOGO[RECUENTOS_DEL_CANONICO.nombre]);
    expect(filas).toHaveLength(1);
    const r = filas[0]!;
    expect(Object.keys(r).sort()).toEqual([...RECUENTOS_DEL_CANONICO.columnas].sort());
    expect(Number(r.federaciones_con_datos)).toBeLessThanOrEqual(Number(r.federaciones));
    expect(Number(r.grupos_medidos)).toBeLessThanOrEqual(Number(r.grupos));
    expect(Number(r.grupos_completos)).toBeLessThanOrEqual(Number(r.grupos_medidos));
    expect(Number(r.jornadas_publicadas)).toBeGreaterThanOrEqual(0);
    if (r.partidos_conocidos !== null && r.partidos_con_resultado !== null) {
      expect(Number(r.partidos_con_resultado)).toBeLessThanOrEqual(Number(r.partidos_conocidos));
    }
    if (Number(r.grupos_medidos) === 0) {
      // Sin ningún punto de control no hay medida: las sumas son nulas y la portada enseña «sin medir»
      // en vez de un 0 % que parecería una medida real.
      expect(r.partidos_conocidos).toBeNull();
      expect(r.jornadas_esperadas).toBeNull();
      expect(r.calculado_en).toBeNull();
    } else {
      // Con medición, la procedencia tiene que existir: un número de cobertura sin fecha no se enseña.
      expect(String(r.calculado_en).length).toBeGreaterThan(0);
    }
  });

  it('las facetas sólo ofrecen valores que existen, y las temporadas tienen forma de etiqueta', async () => {
    const filas = await consulta(FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(1000);
    const dimensiones = new Set(['temporada', 'ambito', 'categoria', 'modalidad', 'genero', 'provincia']);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...FACETAS_DEL_CATALOGO.columnas].sort());
      expect(dimensiones).toContain(fila.dimension);
      expect(String(fila.valor).length).toBeGreaterThan(0);
      if (fila.dimension === 'temporada') {
        expect(String(fila.valor)).toMatch(/^\d{4}-\d{2}$/);
        expect(fila.orden).not.toBeNull();
      } else {
        expect(fila.orden).toBeNull();
      }
    }
  });
});
