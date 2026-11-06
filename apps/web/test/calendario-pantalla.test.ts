import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { consulta } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CONSULTAS_CALENDARIO, OPCIONES_DEL_CALENDARIO, PARAMETROS_CALENDARIO, PARTIDOS_DEL_CALENDARIO,
  type FilaCalendarioGlobal,
} from '../src/consultas/calendario';
import { GRUPO_POR_ID } from '../src/consultas/competiciones';
import { PARTIDOS_DE_GRUPO } from '../src/consultas/partidos';
import type { FilaPartidoCanonico } from '../src/consultas/partidos';
import { CalendarioDeGrupo } from '../src/componentes/calendario/CalendarioDeGrupo';
import { CalendarioGlobal } from '../src/componentes/calendario/CalendarioGlobal';
import { EsqueletoCalendario, SinPartidos } from '../src/componentes/calendario/EstadosCalendario';
import { FiltrosCalendarioGlobal } from '../src/componentes/calendario/FiltrosCalendarioGlobal';
import { FiltrosCalendarioGrupo } from '../src/componentes/calendario/FiltrosCalendarioGrupo';
import {
  agrupaPorFecha, equiposDelCalendario, etiquetaDeFecha, filtraPartidosDeGrupo, idDeGrupoDeUrl,
  jornadasDelCalendario, leeFiltrosCalendarioGlobal, leeFiltrosCalendarioGrupo, partidoDeGrupoParaCalendario,
  rutaDeActaDePartido, rutaDeCalendario, RUTA_CALENDARIO_GLOBAL, tieneFiltrosDeGrupo, tieneFiltrosGlobales,
  tituloDeCalendarioGrupo, TITULO_DE_CALENDARIO, urlDeCalendarioGlobal, urlDeCalendarioGrupo,
} from '../src/lib/calendario';

/**
 * Contrato del calendario (WALL objetivo 2): el global de todas las competiciones y el de un grupo.
 *
 * La referencia real es el grupo 3769 (Liga Nacional Juvenil 2026-27, 4 jornadas publicadas de 8
 * partidos) y el 75252 (Temporada 2026-27 de fútbol sala, calendario publicado SIN resultados).
 *
 * Lo que se defiende:
 *  · un partido sin marcador se pinta «—», nunca 0-0; sin fecha publicada no se coloca en un día;
 *  · el global no carga dos millones de partidos: pagina con un límite explícito y no promete totales;
 *  · los filtros de la URL no rompen la página: un valor inválido se ignora;
 *  · la interfaz no explica cómo está hecha (§8 de la doctrina) ni enseña detalles técnicos;
 *  · el acta sólo se enlaza cuando hay acta analizada.
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

/** Lo que la interfaz no puede decir: cómo está hecha o de dónde sale el cálculo (§8). */
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

afterAll(async () => {
  await cierraCanonico();
});

/* ── Fixtures con la forma real de las consultas ─────────────────────────────────────────────────── */

const PARTIDO_JUGADO: FilaCalendarioGlobal = {
  partido_id: 94040,
  jornada: 1,
  fecha_jugada: '2026-09-12',
  fecha_prevista: '2026-09-12',
  fecha: '2026-09-12',
  hora: '16:00',
  temporada: '2026-27',
  federacion: 'castilla-leon',
  federacion_nombre: 'Real Federación de Castilla y León de Fútbol',
  federacion_corta: 'Castilla y León',
  edicion: 'Liga Nacional Juvenil',
  grupo: 'Primera - III',
  grupo_id: 3769,
  local_id: 17607,
  local: 'Burgos C.F. S.A.D.',
  local_codigo: '5193',
  visitante_id: 17608,
  visitante: 'C.D. Parquesol',
  visitante_codigo: '8319',
  local_club_id: 77,
  visitante_club_id: 78,
  local_tiene_escudo: true,
  visitante_tiene_escudo: false,
  goles_local: 2,
  goles_visitante: 1,
  campo: 'Campo Municipal de Burgos',
  calidad_acta: 'correct',
  estado: 'played',
};

const PARTIDO_PROGRAMADO: FilaCalendarioGlobal = {
  ...PARTIDO_JUGADO,
  partido_id: 94041,
  jornada: 2,
  fecha_jugada: null,
  fecha_prevista: '2026-09-19',
  fecha: '2026-09-19',
  hora: '18:30',
  local_id: 17609,
  local: 'C.D. Numancia de Soria S.A.D.',
  visitante_id: 17610,
  visitante: 'Real Valladolid C.F. S.A.D. "B"',
  local_club_id: null,
  visitante_club_id: null,
  local_tiene_escudo: null,
  visitante_tiene_escudo: null,
  goles_local: null,
  goles_visitante: null,
  campo: null,
  calidad_acta: null,
  estado: 'scheduled',
};

/** Un partido sin ninguna fecha publicada: no se coloca en un día inventado. */
const PARTIDO_SIN_FECHA: FilaCalendarioGlobal = {
  ...PARTIDO_PROGRAMADO,
  partido_id: 94042,
  jornada: 3,
  fecha_jugada: null,
  fecha_prevista: null,
  fecha: null,
  hora: null,
  local_id: 17611,
  local: 'C.D. Isoba',
  visitante_id: 17612,
  visitante: 'Puente Castro F.C.',
};

function partidoDeGrupo(extra: Partial<FilaPartidoCanonico> & { match_id: number; jornada: number }): FilaPartidoCanonico {
  return {
    orden: extra.match_id,
    fecha: null,
    hora: null,
    local_id: 17607,
    visitante_id: 17608,
    local: 'Burgos C.F. S.A.D.',
    visitante: 'C.D. Parquesol',
    goles_local: null,
    goles_visitante: null,
    campo: null,
    arbitro: null,
    calidad_acta: null,
    estado: null,
    ...extra,
  };
}

const PARTIDOS_GRUPO: FilaPartidoCanonico[] = [
  partidoDeGrupo({
    match_id: 1, jornada: 1, orden: 1, fecha: '2026-09-12', hora: '16:00',
    local: 'Burgos C.F. S.A.D.', visitante: 'C.D. Parquesol', goles_local: 2, goles_visitante: 1,
    campo: 'Campo Municipal de Burgos', calidad_acta: 'correct',
  }),
  partidoDeGrupo({
    match_id: 2, jornada: 1, orden: 2, fecha: '2026-09-13',
    local_id: 17609, visitante_id: 17610, local: 'C.D. Numancia', visitante: 'Real Valladolid',
    goles_local: 1, goles_visitante: 0,
  }),
  partidoDeGrupo({
    match_id: 3, jornada: 2, orden: 1, fecha_prevista: '2026-09-19', hora: '18:30',
    local_id: 17608, visitante_id: 17609,
    local: 'C.D. Parquesol', visitante: 'C.D. Numancia',
  }),
  // Sin fecha jugada ni prevista: no se inventa el día.
  partidoDeGrupo({
    match_id: 4, jornada: 2, orden: 2, local_id: 17611, visitante_id: 17612,
    local: 'C.F. Palencia', visitante: 'S.D. Ponferradina',
  }),
];

/* ── Contrato estático de las consultas ──────────────────────────────────────────────────────────── */

describe('contrato estático de las consultas del calendario', () => {
  it('todas llevan LIMIT: ninguna página puede pedir el canónico entero', () => {
    for (const c of CONSULTAS_CALENDARIO) {
      expect(c.sql.toLowerCase(), `${c.nombre} sin LIMIT`).toContain('limit');
    }
  });

  it('ningún valor se interpola en el SQL: todo va por parámetros numerados', () => {
    for (const c of CONSULTAS_CALENDARIO) {
      expect(c.sql, `${c.nombre} interpola una plantilla`).not.toContain('${');
    }
  });

  it('cada consulta declara nombre, descripción, presupuesto, plan y columnas', () => {
    for (const c of CONSULTAS_CALENDARIO) {
      expect(c.nombre.length).toBeGreaterThan(0);
      expect(c.descripcion.length).toBeGreaterThan(20);
      expect(c.presupuestoMs).toBeGreaterThan(0);
      expect(['indexado', 'agregado']).toContain(c.plan);
      expect(c.columnas.length).toBeGreaterThan(0);
      expect(PARAMETROS_CALENDARIO[c.nombre], `${c.nombre} sin parámetros de ejemplo`).toBeDefined();
    }
  });

  it('la consulta del calendario promete los campos que la pantalla pinta', () => {
    for (const columna of ['partido_id', 'jornada', 'fecha', 'hora', 'edicion', 'grupo', 'grupo_id',
      'local_id', 'local', 'visitante_id', 'visitante', 'local_club_id', 'local_tiene_escudo',
      'goles_local', 'goles_visitante', 'calidad_acta']) {
      expect(PARTIDOS_DEL_CALENDARIO.columnas, `falta ${columna}`).toContain(columna);
    }
    expect(OPCIONES_DEL_CALENDARIO.columnas).toEqual(['federaciones', 'temporadas']);
  });
});

/* ── Filtros de la URL ───────────────────────────────────────────────────────────────────────────── */

describe('los filtros del calendario salen de la URL y no rompen la página', () => {
  it('lee los filtros válidos del calendario global', () => {
    expect(leeFiltrosCalendarioGlobal({
      fed: 'castilla-leon', temp: '2026-27', j: '4',
      desde: '2026-09-01', hasta: '2026-09-30', q: '  Burgos  ', p: '120',
    })).toEqual({
      federacion: 'castilla-leon', temporada: '2026-27', jornada: 4,
      desde: '2026-09-01', hasta: '2026-09-30', texto: 'Burgos', desplazamiento: 120,
    });
  });

  it('un parámetro inválido se ignora en vez de romper la página', () => {
    const filtros = leeFiltrosCalendarioGlobal({
      fed: 'DROP TABLE', temp: '2026', j: 'abc', desde: '2026-02-31', hasta: 'mañana', q: '   ',
    });
    expect(filtros).toEqual({
      federacion: null, temporada: null, jornada: null, desde: null, hasta: null, texto: null, desplazamiento: 0,
    });
  });

  it('la paginación se normaliza al tamaño de página y no admite negativos', () => {
    expect(leeFiltrosCalendarioGlobal({ p: '130' }).desplazamiento).toBe(120);
    expect(leeFiltrosCalendarioGlobal({ p: '-60' }).desplazamiento).toBe(0);
    expect(leeFiltrosCalendarioGlobal({ p: '99999999' }).desplazamiento).toBe(0);
  });

  it('los filtros del grupo tienen sus propios valores y su estado por defecto', () => {
    expect(leeFiltrosCalendarioGrupo({ j: '2', equipo: '17607', estado: 'sin-resultado' }))
      .toEqual({ jornada: 2, equipo: 17607, estado: 'sin-resultado' });
    expect(leeFiltrosCalendarioGrupo({ j: 'x', equipo: 'y', estado: 'otro' }))
      .toEqual({ jornada: null, equipo: null, estado: 'todos' });
  });

  it('sabe si hay filtros activos', () => {
    const vacio = leeFiltrosCalendarioGlobal({});
    expect(tieneFiltrosGlobales(vacio)).toBe(false);
    // La temporada es la ventana base de la pantalla, no un filtro que se «quita».
    expect(tieneFiltrosGlobales({ ...vacio, temporada: '2026-27' })).toBe(false);
    expect(tieneFiltrosGlobales({ ...vacio, texto: 'burgos' })).toBe(true);
    expect(tieneFiltrosDeGrupo({ jornada: null, equipo: null, estado: 'todos' })).toBe(false);
    expect(tieneFiltrosDeGrupo({ jornada: 2, equipo: null, estado: 'todos' })).toBe(true);
  });
});

describe('las URLs del calendario conservan los filtros y no escriben los valores por defecto', () => {
  it('el global limpio es la ruta sin parámetros', () => {
    expect(urlDeCalendarioGlobal(leeFiltrosCalendarioGlobal({}))).toBe(RUTA_CALENDARIO_GLOBAL);
  });

  it('los filtros se conservan y se codifican', () => {
    const url = urlDeCalendarioGlobal(leeFiltrosCalendarioGlobal({
      fed: 'castilla-leon', temp: '2026-27', j: '4', desde: '2026-09-01', hasta: '2026-09-30',
      q: 'Burgos', p: '60',
    }));
    const u = new URL(url, 'http://local');
    expect(u.pathname).toBe('/explorar/calendario');
    expect(u.searchParams.get('fed')).toBe('castilla-leon');
    expect(u.searchParams.get('temp')).toBe('2026-27');
    expect(u.searchParams.get('j')).toBe('4');
    expect(u.searchParams.get('desde')).toBe('2026-09-01');
    expect(u.searchParams.get('hasta')).toBe('2026-09-30');
    expect(u.searchParams.get('q')).toBe('Burgos');
    expect(u.searchParams.get('p')).toBe('60');
  });

  it('cambiar un filtro no pierde los demás', () => {
    const filtros = leeFiltrosCalendarioGlobal({ fed: 'castilla-leon', j: '2', p: '120' });
    const u = new URL(urlDeCalendarioGlobal(filtros, { desplazamiento: 0 }), 'http://local');
    expect(u.searchParams.get('fed')).toBe('castilla-leon');
    expect(u.searchParams.get('j')).toBe('2');
    expect(u.searchParams.get('p')).toBeNull();
  });

  it('las URLs del grupo llevan su grupo y limpian lo que se quita', () => {
    expect(urlDeCalendarioGrupo(3769, { jornada: null, equipo: null, estado: 'todos' }))
      .toBe('/explorar/competicion/3769/calendario');
    const u = new URL(urlDeCalendarioGrupo(3769, { jornada: 2, equipo: 17607, estado: 'con-resultado' }), 'http://local');
    expect(u.pathname).toBe('/explorar/competicion/3769/calendario');
    expect(u.searchParams.get('j')).toBe('2');
    expect(u.searchParams.get('equipo')).toBe('17607');
    expect(u.searchParams.get('estado')).toBe('con-resultado');
    const limpia = new URL(urlDeCalendarioGrupo(3769, { jornada: 2, equipo: 17607, estado: 'con-resultado' },
      { jornada: null, equipo: null, estado: 'todos' }), 'http://local');
    expect(limpia.search).toBe('');
  });
});

/* ── Reglas puras de la lista ────────────────────────────────────────────────────────────────────── */

describe('el reparto por fechas del calendario global', () => {
  it('agrupa por fecha descendente y deja los partidos sin fecha para el final', () => {
    const grupos = agrupaPorFecha([PARTIDO_JUGADO, PARTIDO_PROGRAMADO, PARTIDO_SIN_FECHA]);
    expect(grupos.map((g) => g.fecha)).toEqual(['2026-09-19', '2026-09-12', null]);
    expect(grupos[0]!.partidos.map((p) => p.partido_id)).toEqual([94041]);
    expect(grupos[2]!.partidos.map((p) => p.partido_id)).toEqual([94042]);
  });

  it('no reordena los partidos dentro de una misma fecha', () => {
    const segundo = { ...PARTIDO_JUGADO, partido_id: 11 };
    const tercero = { ...PARTIDO_JUGADO, partido_id: 12 };
    const grupos = agrupaPorFecha([PARTIDO_JUGADO, segundo, tercero]);
    expect(grupos[0]!.partidos.map((p) => p.partido_id)).toEqual([94040, 11, 12]);
  });

  it('la etiqueta de la fecha se escribe en castellano y sin año', () => {
    expect(etiquetaDeFecha('2026-09-12')).toBe('sáb, 12 sept');
    expect(etiquetaDeFecha('2026-10-04')).toBe('dom, 4 oct');
    expect(etiquetaDeFecha(null)).toBeNull();
    expect(etiquetaDeFecha('2026-02-31')).toBeNull();
  });
});

describe('los filtros del calendario de un grupo', () => {
  it('filtra por jornada', () => {
    expect(filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: 2, equipo: null, estado: 'todos' })
      .map((p) => p.match_id)).toEqual([3, 4]);
  });

  it('filtra por equipo, sea local o visitante', () => {
    const comoLocal = filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: null, equipo: 17607, estado: 'todos' });
    expect(comoLocal.map((p) => p.match_id)).toEqual([1]);
    const comoVisitante = filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: null, equipo: 17610, estado: 'todos' });
    expect(comoVisitante.map((p) => p.match_id)).toEqual([2]);
  });

  it('filtra por estado y un partido sin marcador no es «con resultado»', () => {
    expect(filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: null, equipo: null, estado: 'con-resultado' })
      .map((p) => p.match_id)).toEqual([1, 2]);
    expect(filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: null, equipo: null, estado: 'sin-resultado' })
      .map((p) => p.match_id)).toEqual([3, 4]);
  });

  it('los filtros se combinan y pueden no dejar nada', () => {
    expect(filtraPartidosDeGrupo(PARTIDOS_GRUPO, { jornada: 1, equipo: 17611, estado: 'todos' })).toEqual([]);
  });
});

describe('las jornadas y los equipos del calendario del grupo', () => {
  it('reparte por jornada, sin inventar las que no tienen partidos', () => {
    const jornadas = jornadasDelCalendario(PARTIDOS_GRUPO);
    expect(jornadas.map((j) => j.numero)).toEqual([1, 2]);
    expect(jornadas[0]).toMatchObject({ total: 2, jugados: 2, desde: '2026-09-12', hasta: '2026-09-13' });
    expect(jornadas[1]).toMatchObject({ total: 2, jugados: 0, desde: '2026-09-19', hasta: '2026-09-19' });
  });

  it('la fecha del partido prefiere la jugada y cae a la prevista publicada', () => {
    const [primera, segunda] = jornadasDelCalendario(PARTIDOS_GRUPO);
    expect(primera!.partidos[0]!.fecha).toBe('2026-09-12');
    expect(segunda!.partidos[0]!.fecha).toBe('2026-09-19');
    expect(segunda!.partidos[1]!.fecha).toBeNull();
  });

  it('adapta los campos del partido del grupo a la fila del calendario', () => {
    const fila = partidoDeGrupoParaCalendario(PARTIDOS_GRUPO[0]!);
    expect(fila).toMatchObject({
      partido_id: 1, jornada: 1, local_id: 17607, visitante_id: 17608,
      goles_local: 2, goles_visitante: 1, calidad_acta: 'correct',
    });
  });

  it('los equipos del filtro son los que aparecen, una vez y ordenados', () => {
    const equipos = equiposDelCalendario(PARTIDOS_GRUPO);
    expect(equipos.map((e) => e.id).sort()).toEqual([17607, 17608, 17609, 17610, 17611, 17612].sort());
    expect(equipos.map((e) => e.nombre)).toEqual([...equipos.map((e) => e.nombre)].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('un id que llega como texto (bigint del driver) se compara como número', () => {
    // `core.team_entry.id` es bigint y el driver de PostgreSQL lo entrega como texto; sin normalizar,
    // el filtro por equipo no encontraría nada. Se comprueba con la forma real de la fila.
    const conTexto = [{
      ...PARTIDOS_GRUPO[0]!,
      local_id: '17607' as unknown as number,
      visitante_id: '17608' as unknown as number,
    }];
    expect(filtraPartidosDeGrupo(conTexto, { jornada: null, equipo: 17607, estado: 'todos' })).toHaveLength(1);
    expect(partidoDeGrupoParaCalendario(conTexto[0]!).local_id).toBe(17607);
    expect(partidoDeGrupoParaCalendario(conTexto[0]!).visitante_id).toBe(17608);
    expect(equiposDelCalendario(conTexto).map((e) => e.id).sort()).toEqual([17607, 17608]);
  });
});

describe('rutas, títulos y validación del id de la URL', () => {
  it('un id de grupo sólo vale si es un entero positivo', () => {
    expect(idDeGrupoDeUrl('3769')).toBe(3769);
    for (const crudo of ['0', '-1', '4.5', 'abc', '', undefined]) {
      expect(idDeGrupoDeUrl(crudo), `«${String(crudo)}» no es un grupo`).toBeNull();
    }
  });

  it('las rutas del calendario son las que enlazan las pantallas', () => {
    expect(rutaDeCalendario(3769)).toBe('/explorar/competicion/3769/calendario');
    expect(RUTA_CALENDARIO_GLOBAL).toBe('/explorar/calendario');
    // El calendario enlaza el acta que ya existe (WALL objetivo 1): misma ruta que `lib/acta.ts`.
    expect(rutaDeActaDePartido(94040)).toBe('/explorar/acta/94040');
  });

  it('la pestaña del navegador dice qué competición y qué grupo', () => {
    expect(tituloDeCalendarioGrupo({ edicion: 'Liga Nacional Juvenil', grupo: 'Primera - III' }))
      .toBe('Calendario · Liga Nacional Juvenil · Primera - III — Fondo Popular');
    expect(TITULO_DE_CALENDARIO).toBe('Calendario — Fondo Popular');
  });
});

/* ── Contrato contra el canónico ────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('el calendario global contra el canónico real', () => {
  it('devuelve como mucho una página y exactamente las columnas prometidas', async () => {
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      PARAMETROS_CALENDARIO['partidos-del-calendario']);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(61);
    for (const fila of filas) {
      expect(Object.keys(fila).sort()).toEqual([...PARTIDOS_DEL_CALENDARIO.columnas].sort());
      expect(fila.federacion).toBe('castilla-leon');
      expect(fila.temporada).toBe('2026-27');
      // Los ids se usan como números (color del escudo, filtros, claves): bigint del driver no vale.
      expect(typeof fila.partido_id).toBe('number');
      expect(typeof fila.local_id).toBe('number');
      expect(typeof fila.grupo_id).toBe('number');
      // Un marcador a medias no existe: o hay resultado de los dos o no hay ninguno.
      expect(fila.goles_local === null).toBe(fila.goles_visitante === null);
    }
  });

  it('la fecha que enseña es la jugada y, si no, la prevista: no se inventa ninguna', async () => {
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      PARAMETROS_CALENDARIO['partidos-del-calendario']);
    for (const fila of filas) {
      const esperada = fila.fecha_jugada ?? fila.fecha_prevista ?? null;
      expect(fila.fecha, `partido ${String(fila.partido_id)}`).toBe(esperada);
    }
    // Y la lista llega ordenada de más reciente a más antigua, con las fechas vacías al final.
    const fechas = filas.map((f) => (f.fecha === null ? '' : String(f.fecha)));
    expect(fechas).toEqual([...fechas].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
  });

  it('los filtros de federación, temporada, jornada, fechas y texto acotan de verdad', async () => {
    const porJornada = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      ['castilla-leon', '2026-27', 1, null, null, '', 21, 0]);
    expect(porJornada.length).toBeGreaterThan(0);
    for (const fila of porJornada) expect(fila.jornada).toBe(1);

    const porFechas = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      ['castilla-leon', '2026-27', null, '2026-09-01', '2026-09-30', '', 61, 0]);
    expect(porFechas.length).toBeGreaterThan(0);
    for (const fila of porFechas) {
      expect(String(fila.fecha) >= '2026-09-01').toBe(true);
      expect(String(fila.fecha) <= '2026-09-30').toBe(true);
    }

    const porTexto = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      ['castilla-leon', '2026-27', null, null, null, 'burgos', 21, 0]);
    expect(porTexto.length).toBeGreaterThan(0);
    /*
     * La búsqueda resuelve el GRUPO (el partido entra si su grupo tiene un equipo o un nombre que
     * coincide), que es lo que la hace rápida. Se comprueba contra la definición: todos los grupos que
     * devuelve tienen algún equipo o un nombre con la búsqueda.
     */
    const gruposConLaBusqueda = await consulta<Record<string, unknown>>(`
      select distinct g.id as grupo_id
        from core.phase_group g
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id
        join core.season s on s.id = e.season_id
        left join core.team_entry te on te.phase_group_id = g.id
       where f.codigo = 'castilla-leon' and s.etiqueta = '2026-27'
         and (core.normaliza_nombre(e.nombre_publicado || ' ' || g.nombre || ' ' || f.nombre)
                like '%' || core.normaliza_nombre('burgos') || '%'
              or te.nombre_en_fuente_norm like '%burgos%')`, []);
    const gruposValidos = new Set(gruposConLaBusqueda.map((fila) => Number(fila.grupo_id)));
    expect(gruposValidos.size).toBeGreaterThan(0);
    for (const fila of porTexto) {
      expect(gruposValidos.has(Number(fila.grupo_id)), `grupo ${String(fila.grupo_id)} no casa con la búsqueda`).toBe(true);
    }
    // Y la búsqueda enseña partidos de equipos cuyo nombre contiene el texto.
    const menciona = porTexto.some((fila) =>
      `${String(fila.local)} ${String(fila.visitante)}`.toLocaleLowerCase('es').includes('burgos'));
    expect(menciona).toBe(true);
  });

  it('sin resultados devuelve cero filas, no una fila vacía ni un partido inventado', async () => {
    const filas = await consulta<Record<string, unknown>>(PARTIDOS_DEL_CALENDARIO.sql,
      ['castilla-leon', '2026-27', null, null, null, 'zzzz-no-existe-en-el-canonico', 21, 0]);
    expect(filas).toEqual([]);
  });

  it('el calendario de 75252 enseña su calendario sin resultados y con fecha publicada', async () => {
    const filas = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24219270', 1000]);
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.goles_local === null && f.goles_visitante === null)).toBe(true);
    const jornadas = jornadasDelCalendario(filas);
    expect(jornadas.length).toBeGreaterThan(0);
    for (const jornada of jornadas) {
      expect(jornada.jugados).toBe(0);
      // La fecha existe porque está publicada en el calendario, aunque no se haya jugado.
      expect(jornada.desde).not.toBeNull();
      expect(jornada.partidos.every((p) => p.fecha !== null)).toBe(true);
    }
  });

  it('las opciones de los filtros son las del canónico y respetan la ventana publicada', async () => {
    const filas = await consulta<Record<string, unknown>>(OPCIONES_DEL_CALENDARIO.sql,
      PARAMETROS_CALENDARIO['opciones-del-calendario']);
    expect(filas).toHaveLength(1);
    const federaciones = filas[0]!.federaciones as Array<{ codigo: string; nombre: string; nombre_corto: string | null }>;
    const temporadas = filas[0]!.temporadas as Array<{ etiqueta: string; orden: number }>;
    expect(federaciones.map((f) => f.codigo)).toContain('castilla-leon');
    const cyl = federaciones.find((f) => f.codigo === 'castilla-leon');
    expect(cyl?.nombre_corto, 'el filtro debe ofrecer el nombre corto').toBe('Castilla y León');
    expect(temporadas.map((t) => t.etiqueta)).toContain('2026-27');
    for (const temporada of temporadas) expect(temporada.etiqueta >= '2023-24').toBe(true);
    const etiquetas = temporadas.map((t) => t.etiqueta);
    expect(etiquetas).toEqual([...etiquetas].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
  });

  it('un grupo inexistente no devuelve portada: la página puede dar un 404 de verdad', async () => {
    for (const id of [0, 999999999]) {
      const filas = await consulta<Record<string, unknown>>(GRUPO_POR_ID.sql, [id]);
      expect(filas, `grupo ${id}`).toEqual([]);
    }
  });

  it('el grupo 3769 tiene las 4 jornadas publicadas con sus 8 partidos cada una', async () => {
    const filas = await consulta<FilaPartidoCanonico>(PARTIDOS_DE_GRUPO.sql, ['castilla-leon', '24218935', 1000]);
    expect(filas).toHaveLength(32);
    const jornadas = jornadasDelCalendario(filas);
    expect(jornadas.map((j) => j.numero)).toEqual([1, 2, 3, 4]);
    for (const jornada of jornadas) {
      expect(jornada.total).toBe(8);
      expect(jornada.jugados).toBe(8);
    }
    // Todos sus partidos tienen acta analizada: el enlace de acta puede salir en los 32.
    expect(filas.every((f) => f.calidad_acta !== null)).toBe(true);
  });
});

/* ── Render ─────────────────────────────────────────────────────────────────────────────────────── */

describe('la lista global se pinta por fechas, con su contexto y sin inventar marcadores', () => {
  const render = (extra: Partial<Parameters<typeof CalendarioGlobal>[0]> = {}) => renderToStaticMarkup(
    createElement(CalendarioGlobal, {
      partidos: [PARTIDO_JUGADO, PARTIDO_PROGRAMADO, PARTIDO_SIN_FECHA],
      desde: 1,
      hasta: 3,
      hayMas: false,
      urlAnterior: null,
      urlSiguiente: null,
      hrefCompeticion: (p) => (p.grupo_id ? `/explorar/competicion/${p.grupo_id}` : null),
      hrefJornada: (p) => (p.grupo_id && p.jornada !== null ? `/explorar/competicion/${p.grupo_id}/jornada/${p.jornada}` : null),
      hrefActa: (p) => (p.calidad_acta !== null ? rutaDeActaDePartido(p.partido_id) : null),
      ...extra,
    }),
  );

  it('agrupa por fecha en castellano y deja los partidos sin fecha al final', () => {
    const html = render();
    expect(html).toContain('sáb, 12 sept');
    expect(html).toContain('sáb, 19 sept');
    expect(html).toContain('Sin fecha publicada');
    expect(html).toContain('<h2');
  });

  it('enseña los equipos, el marcador y el contexto de la competición', () => {
    const html = render();
    expect(html).toContain('Burgos C.F. S.A.D.');
    expect(html).toContain('C.D. Parquesol');
    expect(html).toContain('2 - 1');
    expect(html).toContain('Castilla y León');
    expect(html).toContain('Liga Nacional Juvenil · Primera - III');
    expect(html).toContain('href="/explorar/competicion/3769"');
    expect(html).toContain('href="/explorar/competicion/3769/jornada/1"');
    expect(html).toContain('16:00');
    expect(html).toContain('Campo Municipal de Burgos');
  });

  it('un partido sin resultado se pinta «—», nunca 0-0, y sin hora no se inventa una', () => {
    const html = render();
    expect(html).toContain('—');
    expect(html).toContain('Sin resultado publicado');
    expect(html).not.toContain('0 - 0');
    expect(html).not.toContain('00:00');
    // El programado sí tiene hora publicada; el que no tiene ninguna fecha no pinta la línea vacía.
    expect(html).toContain('18:30');
  });

  it('el acta sólo se enlaza cuando hay acta analizada', () => {
    const html = render();
    expect(html).toContain('href="/explorar/acta/94040"');
    expect(html).not.toContain('href="/explorar/acta/94041"');
  });

  it('usa el escudo real cuando el club lo tiene y el marcador determinista cuando no', () => {
    const html = render();
    expect(html).toContain('data-escudo="real"');
    expect(html).toContain('/api/escudo/club/77');
    expect(html).not.toContain('/api/escudo/club/78');
    expect(html).toContain('data-escudo="determinista"');
  });

  it('los números se comparan en vertical y la lista no es una tabla', () => {
    const html = render();
    expect(html).toContain('tabular-nums');
    expect(html).not.toContain('<table');
    sinTextoProhibido(html);
  });

  it('la paginación enlaza la siguiente página y apaga la anterior en la primera', () => {
    const primera = render({ urlSiguiente: '/explorar/calendario?p=60', hayMas: true });
    expect(primera).toContain('href="/explorar/calendario?p=60"');
    expect(primera).toContain('aria-disabled="true"');
    expect(primera).toContain('hay más partidos');

    const segunda = render({ urlAnterior: '/explorar/calendario', urlSiguiente: null, desde: 61, hasta: 62, hayMas: false });
    expect(segunda).toContain('href="/explorar/calendario"');
    expect(segunda).not.toContain('hay más partidos');
  });
});

describe('el calendario del grupo se pinta por jornadas', () => {
  const jornadas = jornadasDelCalendario(PARTIDOS_GRUPO);
  const render = (extra: Partial<Parameters<typeof CalendarioDeGrupo>[0]> = {}) => renderToStaticMarkup(
    createElement(CalendarioDeGrupo, {
      jornadas,
      hrefJornada: (numero: number) => `/explorar/competicion/3769/jornada/${numero}`,
      hrefActa: (p) => (p.calidad_acta !== null ? rutaDeActaDePartido(p.partido_id) : null),
      ...extra,
    }),
  );

  it('cada jornada lleva su número, sus fechas y sus partidos jugados', () => {
    const html = render();
    expect(html).toContain('Jornada 1');
    expect(html).toContain('Jornada 2');
    expect(html).toContain('12–13 sept');
    expect(html).toContain('19 sept');
    expect(html).toContain('2/2');
    expect(html).toContain('0/2');
    expect(html).toContain('<h3');
  });

  it('enlaza al detalle de la jornada que ya existe', () => {
    const html = render();
    expect(html).toContain('href="/explorar/competicion/3769/jornada/1"');
    expect(html).toContain('href="/explorar/competicion/3769/jornada/2"');
  });

  it('un partido sin marcador no se pinta como 0-0 y el acta sólo sale si existe', () => {
    const html = render();
    expect(html).toContain('—');
    expect(html).toContain('Sin resultado publicado');
    expect(html).not.toContain('0 - 0');
    expect(html).toContain('href="/explorar/acta/1"');
    expect(html).not.toContain('href="/explorar/acta/3"');
  });

  it('no explica cómo se calcula nada ni enseña datos internos', () => {
    sinTextoProhibido(render());
  });
});

describe('los filtros renderizados son formularios GET sin estado oculto', () => {
  it('el filtro del grupo lleva su acción, sus opciones y su botón', () => {
    const html = renderToStaticMarkup(createElement(FiltrosCalendarioGrupo, {
      grupoId: 3769,
      filtros: { jornada: 2, equipo: null, estado: 'con-resultado' },
      jornadas: [1, 2, 3, 4],
      equipos: [{ id: 17607, nombre: 'Burgos C.F. S.A.D.' }],
    }));
    expect(html).toContain('action="/explorar/competicion/3769/calendario"');
    expect(html).toContain('method="get"');
    for (const etiqueta of ['Jornada', 'Equipo', 'Estado', 'Filtrar']) expect(html).toContain(etiqueta);
    expect(html).toMatch(/<option value="2"[^>]*selected/);
    expect(html).toContain('Quitar');
    sinTextoProhibido(html);
  });

  it('el filtro global ofrece federación, temporada, fechas y búsqueda', () => {
    const html = renderToStaticMarkup(createElement(FiltrosCalendarioGlobal, {
      filtros: leeFiltrosCalendarioGlobal({ fed: 'castilla-leon', temp: '2026-27' }),
      opciones: {
        federaciones: [{ codigo: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', nombre_corto: 'Castilla y León' }],
        temporadas: [{ etiqueta: '2026-27', orden: 2026 }, { etiqueta: '2025-26', orden: 2025 }],
      },
      temporada: '2026-27',
      temporadaPorDefecto: '2026-27',
    }));
    expect(html).toContain('action="/explorar/calendario"');
    for (const etiqueta of ['Federación', 'Temporada', 'Jornada', 'Desde', 'Hasta', 'Equipo o competición']) {
      expect(html).toContain(etiqueta);
    }
    expect(html).toContain('Castilla y León');
    expect(html).toMatch(/<option value="2026-27"[^>]*selected/);
    sinTextoProhibido(html);
  });

  it('sin filtros no se ofrece «Quitar»: no hay nada que quitar', () => {
    const html = renderToStaticMarkup(createElement(FiltrosCalendarioGrupo, {
      grupoId: 3769,
      filtros: { jornada: null, equipo: null, estado: 'todos' },
      jornadas: [1, 2],
      equipos: [],
    }));
    expect(html).not.toContain('Quitar');
  });
});

describe('estados del calendario', () => {
  it('sin partidos lo dice en una frase, con la salida si había filtros', () => {
    const html = renderToStaticMarkup(createElement(SinPartidos, null, 'No hay partidos con estos filtros.'));
    expect(html).toContain('No hay partidos con estos filtros.');
    sinTextoProhibido(html);
  });

  it('el esqueleto anuncia la carga, tiene filas y no es un spinner', () => {
    const html = renderToStaticMarkup(createElement(EsqueletoCalendario, { filas: 6 }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect((html.match(/data-esqueleto="partido"/g) ?? []).length).toBe(6);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('animate-spin');
  });
});
