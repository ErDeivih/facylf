import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CLASIFICACION_DE_LA_PANTALLA, GRUPO_POR_ID,
  type FilaClasificacionPantalla, type FilaPortadaGrupo,
} from '../src/consultas/competiciones';
import {
  CONSULTAS_LIGA, DISCIPLINA_Y_CANTERA_DEL_GRUPO, PARAMETROS_LIGA, type FilaEquipoDeLiga,
} from '../src/consultas/liga';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '../src/consultas/partidos';
import {
  EVENTOS_DEL_GRUPO, type EventosDelGrupo, type FilaEventosDelGrupo,
} from '../src/consultas/estadisticas';
import {
  cifraOTexto, clasificacionResumida, disciplinaOrdenada, equiposConCantera, equiposSinCantera,
  equiposSinMinutos, hayCantera, hayDisciplina, porcentajeDeCantera, resultadosRecientes, tramosDeLiga,
} from '../src/lib/liga';
import {
  ESTADO_DE_PUBLICIDAD, HUECOS_PUBLICITARIOS, REGLAS_DE_PUBLICIDAD, REQUISITOS_PARA_ANUNCIOS,
} from '../src/lib/publicidad';
import PaginaLiga from '../src/app/explorar/liga/[id]/page';
import PaginaPublicidad from '../src/app/explorar/publicidad/page';

/**
 * Página de liga y página de publicidad: lo que ve el usuario, con datos reales de CyL.
 *
 * Liga: la referencia es el grupo **797** (`Liga Nacional Juvenil · Primera - III`, 2025-26), completo:
 * 16 equipos, 240 partidos, actas con goles y tarjetas, y minutos de cantera reales (el Burgos «B»
 * dio 3.351 minutos a seis futbolistas de equipos inferiores). El **3769** es la misma liga en 2026-27
 * y va por la jornada 4. El **75252** tiene calendario y ningún resultado: sirve para los estados
 * «sin datos».
 *
 * Publicidad: no hay ninguna campaña ni espacio contratado; la página lo dice y no se inventa
 * patrocinadores. Los siete huecos son los de la migración 0033.
 *
 * Se defienden: desconocido ≠ 0, la temporada en curso no se presenta como terminada, los textos
 * internos no aparecen y las rutas inexistentes dan 404 de verdad.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

const render = (elemento: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(elemento);

const TEXTO_PROHIBIDO = /can[óo]nico|\bsql\b|n\+1|endpoint|\btoken\b|cach[ée]|migraci[óo]n|reconstruid|se calcula|se obtiene de|consulta interna|servidor/i;

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Filas fabricadas para las reglas puras
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function partido(parcial: Partial<FilaPartidoCanonico> = {}): FilaPartidoCanonico {
  return {
    match_id: 1, jornada: 1, orden: 1, fecha: '2026-09-01', fecha_prevista: null, hora: null,
    local_id: 1, visitante_id: 2, local: 'Local', visitante: 'Visitante',
    local_codigo: null, visitante_codigo: null, local_club_id: null, visitante_club_id: null,
    local_tiene_escudo: null, visitante_tiene_escudo: null, local_nombre_corto: null,
    visitante_nombre_corto: null, goles_local: 2, goles_visitante: 1, campo: null, arbitro: null,
    calidad_acta: null, estado: 'played', ...parcial,
  };
}

function equipoDeLiga(parcial: Partial<FilaEquipoDeLiga> = {}): FilaEquipoDeLiga {
  return {
    equipo_id: 1, equipo: 'Equipo', jugadores: 20, minutos: 1000, amarillas: 10, rojas: 1,
    partidos_sancion: 2, partidos_con_acta: 10, minutos_inferiores: 100, jugadores_inferiores: 2,
    ...parcial,
  };
}

function filaClasificacion(parcial: Partial<FilaClasificacionPantalla> = {}): FilaClasificacionPantalla {
  return {
    posicion: 1, equipo_id: 1, equipo: 'Equipo', puntos: 10, jugados: 5, ganados: 3, empatados: 1,
    perdidos: 1, goles_favor: 0, goles_contra: 0, goles_favor_reconstruida: 12, goles_contra_reconstruida: 4,
    origen: 'oficial', jornada: 5, club_id: 1, tiene_escudo: false, equipo_corto: null, ...parcial,
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Contrato estático de la consulta nueva
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('contrato estático de la consulta de liga', () => {
  it('declara nombre, descripción, presupuesto, plan, columnas y parámetros', () => {
    for (const consulta of CONSULTAS_LIGA) {
      expect(consulta.nombre.length).toBeGreaterThan(0);
      expect(consulta.descripcion.length).toBeGreaterThan(20);
      expect(consulta.presupuestoMs).toBeGreaterThan(0);
      expect(consulta.plan).toBe('indexado');
      expect(consulta.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_LIGA[consulta.nombre], `${consulta.nombre} sin parámetros`).toBeDefined();
    }
  });

  it('usa parámetros numerados, LIMIT y no interpola valores', () => {
    for (const consulta of CONSULTAS_LIGA) {
      expect(consulta.sql).toContain('$1');
      expect(consulta.sql.toLowerCase()).toContain('limit');
      expect(consulta.sql).not.toContain('${');
      expect(/(['"`])\s*\+\s*\w/.test(consulta.sql)).toBe(false);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Reglas puras
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('resultados recientes', () => {
  it('toma la última jornada CON resultado, no la última del calendario', () => {
    const recientes = resultadosRecientes([
      partido({ match_id: 1, jornada: 1, orden: 1 }),
      partido({ match_id: 2, jornada: 2, orden: 1, goles_local: null, goles_visitante: null }),
      partido({ match_id: 3, jornada: 1, orden: 2, goles_local: 0, goles_visitante: 0 }),
    ]);
    expect(recientes.jornada).toBe(1);
    expect(recientes.partidos.map((p) => Number(p.match_id))).toEqual([1, 3]);
  });

  it('sin ningún resultado no inventa una jornada', () => {
    expect(resultadosRecientes([partido({ goles_local: null, goles_visitante: null })])).toEqual({ jornada: null, partidos: [] });
    expect(resultadosRecientes([])).toEqual({ jornada: null, partidos: [] });
  });

  it('ordena por el orden publicado y respeta el límite', () => {
    const recientes = resultadosRecientes([
      partido({ match_id: 1, jornada: 3, orden: 2 }),
      partido({ match_id: 2, jornada: 3, orden: 1 }),
      partido({ match_id: 3, jornada: 3, orden: 3 }),
    ], 2);
    expect(recientes.partidos.map((p) => Number(p.match_id))).toEqual([2, 1]);
  });
});

describe('minutos de cantera', () => {
  it('el porcentaje sale de los minutos publicados; sin minutos no hay porcentaje', () => {
    expect(porcentajeDeCantera({ minutos: 29609, minutos_inferiores: 3351 })).toBe(11.3);
    expect(porcentajeDeCantera({ minutos: 3936, minutos_inferiores: 58 })).toBe(1.5);
    expect(porcentajeDeCantera({ minutos: null, minutos_inferiores: 0 })).toBeNull();
    expect(porcentajeDeCantera({ minutos: 0, minutos_inferiores: 0 })).toBeNull();
    expect(porcentajeDeCantera({ minutos: 1000, minutos_inferiores: null })).toBeNull();
  });

  it('ordena de más a menos cantera y separa los equipos sin minutos de los que tienen cero', () => {
    const filas = [
      equipoDeLiga({ equipo_id: 1, equipo: 'Con mucha', minutos: 1000, minutos_inferiores: 200, jugadores_inferiores: 4 }),
      equipoDeLiga({ equipo_id: 2, equipo: 'Sin minutos', minutos: null, minutos_inferiores: null, jugadores_inferiores: null }),
      equipoDeLiga({ equipo_id: 3, equipo: 'Cero cantera', minutos: 1000, minutos_inferiores: 0, jugadores_inferiores: 0 }),
      equipoDeLiga({ equipo_id: 4, equipo: 'Algo', minutos: 1000, minutos_inferiores: 50, jugadores_inferiores: 1 }),
    ];
    expect(equiposConCantera(filas).map((e) => e.fila.equipo)).toEqual(['Con mucha', 'Algo']);
    expect(equiposSinCantera(filas)).toBe(1);
    expect(equiposSinMinutos(filas)).toBe(1);
    expect(hayCantera(filas)).toBe(true);
    expect(hayCantera([filas[1]!, filas[2]!])).toBe(false);
  });
});

describe('disciplina', () => {
  it('ordena por amarillas y deja al final los equipos sin resumen', () => {
    const orden = disciplinaOrdenada([
      equipoDeLiga({ equipo: 'Sin datos', amarillas: null, rojas: null, partidos_sancion: null, partidos_con_acta: 0 }),
      equipoDeLiga({ equipo: 'Pocas', amarillas: 3, rojas: 0, partidos_sancion: 0 }),
      equipoDeLiga({ equipo: 'Muchas', amarillas: 9, rojas: 2, partidos_sancion: 4 }),
    ]).map((fila) => fila.equipo);
    expect(orden).toEqual(['Muchas', 'Pocas', 'Sin datos']);
  });

  it('sin actas no hay disciplina que enseñar y una cifra nula es un guion, no un cero', () => {
    const conActas = [equipoDeLiga({ partidos_con_acta: 10, amarillas: 3 })];
    const sinActas = [equipoDeLiga({ partidos_con_acta: 0, amarillas: null })];
    expect(hayDisciplina(conActas)).toBe(true);
    expect(hayDisciplina(sinActas)).toBe(false);
    expect(cifraOTexto(null)).toBe('—');
    expect(cifraOTexto(0)).toBe('0');
    expect(cifraOTexto(12345)).toBe('12.345');
  });
});

describe('clasificación resumida', () => {
  it('usa los goles de la tabla si la federación los publica', () => {
    const { filas, usaReconstruccion } = clasificacionResumida([
      filaClasificacion({ equipo_corto: 'Local', goles_favor: 10, goles_contra: 5,
        goles_favor_reconstruida: null, goles_contra_reconstruida: null }),
    ]);
    expect(usaReconstruccion).toBe(false);
    expect(filas[0]).toMatchObject({ nombre: 'Local', goles: '10:5', puntos: 10, jugados: 5 });
  });

  it('si la tabla oficial trae los goles a cero, usa los calculados con los resultados', () => {
    const { filas, usaReconstruccion } = clasificacionResumida([
      filaClasificacion({ goles_favor: 0, goles_contra: 0, goles_favor_reconstruida: 12, goles_contra_reconstruida: 4 }),
    ]);
    expect(usaReconstruccion).toBe(true);
    expect(filas[0]!.goles).toBe('12:4');
  });

  it('sin goles de ninguna de las dos formas deja un guion', () => {
    const { filas } = clasificacionResumida([
      filaClasificacion({ goles_favor: 0, goles_contra: 0, goles_favor_reconstruida: null, goles_contra_reconstruida: null }),
    ]);
    expect(filas[0]!.goles).toBe('—');
  });
});

describe('cuándo se marcan los goles', () => {
  it('incluye los seis tramos, el tiempo añadido y los goles sin minuto, sin perder ninguno', () => {
    const tramos = tramosDeLiga([
      { orden: 0, goles: 2 },
      { orden: 5, goles: 3 },
      { orden: 6, goles: 4 },
      { orden: 99, goles: 1 },
    ]);
    expect(tramos.map((tramo) => tramo.etiqueta)).toEqual(["0-15'", "15-30'", "30-45'", "45-60'", "60-75'", "75-90'", "90+'", 'Sin minuto']);
    expect(tramos.reduce((suma, tramo) => suma + tramo.goles, 0)).toBe(10);
    // Un tramo sin goles es un cero real, no un hueco: los seis están siempre.
    expect(tramos.filter((tramo) => tramo.orden < 99)).toHaveLength(7);
  });
});

describe('los datos de publicidad', () => {
  it('los siete huecos del sistema existen y están apagados', () => {
    expect(HUECOS_PUBLICITARIOS).toHaveLength(7);
    expect(new Set(HUECOS_PUBLICITARIOS.map((h) => h.codigo)).size).toBe(7);
    for (const hueco of HUECOS_PUBLICITARIOS) {
      expect(hueco.estado).toBe('apagado');
      expect(hueco.nombre.length).toBeGreaterThan(0);
      expect(hueco.paginas.length).toBeGreaterThan(0);
    }
    expect(HUECOS_PUBLICITARIOS.map((h) => h.codigo)).toEqual(expect.arrayContaining([
      'competicion-lateral', 'competicion-entre-jornadas', 'acta-pie', 'movil-ancla',
    ]));
  });

  it('hoy no hay campañas ni espacios contratados, y las reglas no se inventan', () => {
    expect(ESTADO_DE_PUBLICIDAD.encendida).toBe(false);
    expect(ESTADO_DE_PUBLICIDAD.campanas).toBe(0);
    expect(ESTADO_DE_PUBLICIDAD.espaciosContratados).toBe(0);
    expect(REGLAS_DE_PUBLICIDAD.length).toBeGreaterThan(3);
    expect(REQUISITOS_PARA_ANUNCIOS.length).toBeGreaterThan(3);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Contrato contra el canónico real
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('contrato contra el canónico real', () => {
  it('la liga 797 es un grupo real de CyL con 16 equipos y 240 partidos', async () => {
    const [portada] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [797]);
    expect(portada).toBeDefined();
    expect(Number(portada!.grupo_id)).toBe(797);
    expect(portada!.federacion).toBe('castilla-leon');
    expect(portada!.edicion).toBe('Liga Nacional Juvenil');
    expect(portada!.temporada).toBe('2025-26');
    expect(portada!.grupo_codigo).toBe('22911129');

    const partidos = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '22911129', 1000]);
    expect(partidos).toHaveLength(240);
    expect(partidos.every((partido) => partido.goles_local !== null && partido.goles_visitante !== null)).toBe(true);

    const recientes = resultadosRecientes(partidos);
    expect(recientes.jornada).toBe(30);
    expect(recientes.partidos.length).toBeGreaterThan(0);
    expect(recientes.partidos.every((partido) => partido.calidad_acta !== null)).toBe(true);
  });

  it('los goles por tramo de la liga suman los goles publicados en las actas, con el tiempo añadido', async () => {
    const [eventos] = await consulta<FilaEventosDelGrupo>(EVENTOS_DEL_GRUPO.sql, [797]);
    const datos: EventosDelGrupo = eventos?.datos ?? { tramos: [], tarjetas: [] };
    const tramos = tramosDeLiga(datos.tramos);
    const total = tramos.reduce((suma, tramo) => suma + tramo.goles, 0);
    expect(total).toBe(743);
    // 39 de esos goles son del tiempo añadido: no se esconden en el último cuarto.
    expect(tramos.find((tramo) => tramo.orden === 6)?.goles).toBe(39);
    expect(datos.tramos.every((tramo) => tramo.orden >= 0 && tramo.orden <= 99)).toBe(true);
  });

  it('la cantera del Burgos «B» tiene 3.351 minutos de seis futbolistas y su disciplina es real', async () => {
    const filas = await consulta<FilaEquipoDeLiga>(DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, [797]);
    expect(filas).toHaveLength(16);
    expect(Object.keys(filas[0]!).sort()).toEqual([...DISCIPLINA_Y_CANTERA_DEL_GRUPO.columnas].sort());
    const burgos = filas.find((fila) => fila.equipo === 'Burgos C.F. S.A.D. "B"')!;
    expect(burgos.minutos_inferiores).toBe(3351);
    expect(burgos.jugadores_inferiores).toBe(6);
    expect(burgos.minutos).toBe(29609);
    expect(burgos.amarillas).toBe(70);
    expect(burgos.rojas).toBe(4);
    expect(burgos.partidos_sancion).toBe(10);
    expect(burgos.partidos_con_acta).toBe(30);
    expect(porcentajeDeCantera(burgos)).toBe(11.3);
    expect(equiposConCantera(filas).length).toBeGreaterThan(0);
    expect(hayDisciplina(filas)).toBe(true);
  });

  it('la liga 3769 (2026-27) va por la jornada 4 y su cantera es pequeña pero existe', async () => {
    const filas = await consulta<FilaEquipoDeLiga>(DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, [3769]);
    expect(filas).toHaveLength(16);
    const leonesa = filas.find((fila) => fila.equipo === 'C. y D. Leonesa S.A.D. "B"')!;
    expect(leonesa.minutos_inferiores).toBe(58);
    expect(leonesa.jugadores_inferiores).toBe(3);
    expect(porcentajeDeCantera(leonesa)).toBe(1.5);

    const partidos = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 1000]);
    expect(partidos.length).toBeGreaterThan(0);
    expect(resultadosRecientes(partidos).jornada).toBe(4);
  });

  it('la liga 75252 tiene calendario y ningún resultado: no se inventa ni un 0-0', async () => {
    const partidos = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24219270', 1000]);
    expect(partidos.length).toBeGreaterThan(0);
    expect(partidos.every((partido) => partido.goles_local === null && partido.goles_visitante === null)).toBe(true);
    expect(resultadosRecientes(partidos)).toEqual({ jornada: null, partidos: [] });
  });

  it('un grupo que no existe no devuelve nada en ninguna consulta', async () => {
    expect(await consulta(GRUPO_POR_ID.sql, [999999998])).toHaveLength(0);
    expect(await consulta(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '999999998', 1000])).toHaveLength(0);
    expect(await consulta(DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, [999999998])).toHaveLength(0);
  });

  it('la consulta de disciplina y cantera respeta su presupuesto (mediana de tres, en caliente)', async () => {
    await consulta(DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, [797]);
    const tiempos: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const inicio = performance.now();
      await consulta(DISCIPLINA_Y_CANTERA_DEL_GRUPO.sql, [797]);
      tiempos.push(performance.now() - inicio);
    }
    tiempos.sort((a, b) => a - b);
    const mediana = tiempos[1]!;
    expect(mediana, `mediana ${mediana.toFixed(1)} ms`).toBeLessThan(DISCIPLINA_Y_CANTERA_DEL_GRUPO.presupuestoMs);
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Render de las páginas
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('la página de liga', () => {
  it('el id que no existe o no es un número responde 404 de verdad', async () => {
    for (const id of ['999999998', 'abc', '0']) {
      await expect((PaginaLiga as (p: { params: Promise<{ id: string }> }) => Promise<unknown>)({ params: Promise.resolve({ id }) }))
        .rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
    }
  });

  it.skipIf(!hayCanonico)('la liga 797 se pinta con sus secciones, cantera y enlaces', async () => {
    const html = render(await PaginaLiga({ params: Promise.resolve({ id: '797' }) }));
    expect(html).toContain('Liga Nacional Juvenil');
    expect(html).toContain('Primera - III');
    expect(html).toContain('Resultados recientes');
    expect(html).toContain('Cuándo se marcan los goles');
    expect(html).toMatch(/90\+/);
    expect(html).toContain('Minutos para la cantera');
    expect(html).toContain('Disciplina por equipo');
    expect(html).toContain('Clasificación');
    expect(html).toContain('Burgos');
    expect(html).toContain('/explorar/competicion/797');
    expect(html).toContain('/explorar/competicion/797/jornada/30');
    expect(html).toContain('/explorar/acta/');
    expect(html).toContain('/explorar/equipo/');
    expect(html).toMatch(/partidos|jornadas/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('la liga 3769 se pinta con la jornada actual y sin prometer que ha terminado', async () => {
    const html = render(await PaginaLiga({ params: Promise.resolve({ id: '3769' }) }));
    expect(html).toContain('2026-27');
    expect(html).toContain('/explorar/competicion/3769');
    expect(html).toMatch(/jornada 4/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });

  it.skipIf(!hayCanonico)('una liga con calendario y sin resultados enseña sus estados «sin datos»', async () => {
    const html = render(await PaginaLiga({ params: Promise.resolve({ id: '75252' }) }));
    expect(html).toContain('1ª División Regional de Juveniles de Fútbol Sala');
    expect(html).toContain('Sin resultados publicados');
    expect(html).toContain('Sin goles publicados');
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });
});

describe('la página de publicidad', () => {
  it('se pinta con sus siete huecos, sin publicidad y sin campañas inventadas', () => {
    const html = render(createElement(PaginaPublicidad));
    expect(html).toContain('Publicidad');
    expect(html).toContain('Sin publicidad');
    expect(html).toContain('Sin espacios contratados');
    expect(html).toContain('Dónde van los huecos');
    expect(html).toContain('Lateral · competición');
    expect(html).toContain('Ancla móvil');
    expect(html).toContain('Pie del acta');
    // Nada de campañas de ejemplo del prototipo ni controles de administración.
    expect(html).not.toContain('Valdecastro');
    expect(html).not.toContain('Nueva campaña');
    expect(html).not.toContain('Encender');
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(TEXTO_PROHIBIDO);
  });
});
