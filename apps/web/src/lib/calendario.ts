/**
 * Reglas del calendario (WALL objetivo 2): los filtros de la URL, el reparto por fechas y los enlaces.
 *
 * Son funciones puras para probarlas sin consultar ni renderizar. Las reglas de producto que aplican:
 *  · un parámetro inválido no rompe la página: se ignora y se enseña la vista sin ese filtro;
 *  · un partido sin fecha publicada no se coloca en una fecha inventada; va en su propio grupo;
 *  · el orden de la lista es el de la base (fecha descendente) y no se reordena en el cliente.
 */

import type { FilaPartidoCanonico } from '@/consultas/partidos';

/** Cuántos partidos caben en una página del calendario global. */
export const TAMANO_PAGINA_CALENDARIO = 60;

/**
 * Lo mínimo que necesita una fila de partido del calendario. El calendario global lo cumple con su
 * consulta; el del grupo adapta las filas de `PARTIDOS_DE_GRUPO` con `partidoDeGrupoParaCalendario`.
 */
export type PartidoEnCalendario = {
  partido_id: number;
  jornada: number | null;
  fecha: string | null;
  hora: string | null;
  local_id: number;
  local: string;
  visitante_id: number;
  visitante: string;
  local_club_id?: number | null;
  visitante_club_id?: number | null;
  local_tiene_escudo?: boolean | null;
  visitante_tiene_escudo?: boolean | null;
  goles_local: number | null;
  goles_visitante: number | null;
  campo: string | null;
  calidad_acta: string | null;
  /* Contexto opcional: sólo lo lleva el calendario global, que mezcla competiciones. */
  federacion_corta?: string | null;
  federacion_nombre?: string;
  edicion?: string;
  grupo?: string;
  grupo_id?: number;
};

/** Adapta un partido del grupo (consulta de grupo) a la fila común del calendario. */
export function partidoDeGrupoParaCalendario(p: FilaPartidoCanonico): PartidoEnCalendario {
  return {
    partido_id: Number(p.match_id),
    jornada: Number(p.jornada),
    fecha: fechaDePartidoDeGrupo(p),
    hora: p.hora,
    // Los ids de `core.team_entry` son bigint y el driver los entrega como texto: se normalizan aquí
    // para que el filtro por equipo y el color del escudo trabajen con números.
    local_id: Number(p.local_id),
    local: p.local,
    visitante_id: Number(p.visitante_id),
    visitante: p.visitante,
    local_club_id: p.local_club_id ?? null,
    visitante_club_id: p.visitante_club_id ?? null,
    local_tiene_escudo: p.local_tiene_escudo ?? null,
    visitante_tiene_escudo: p.visitante_tiene_escudo ?? null,
    goles_local: p.goles_local,
    goles_visitante: p.goles_visitante,
    campo: p.campo,
    calidad_acta: p.calidad_acta,
  };
}

/** La fecha que se enseña de un partido del grupo: la jugada y, si no, la prevista publicada. */
function fechaDePartidoDeGrupo(p: FilaPartidoCanonico): string | null {
  const jugada = (p.fecha ?? '').slice(0, 10);
  if (jugada !== '') return jugada;
  const prevista = (p.fecha_prevista ?? '').slice(0, 10);
  return prevista !== '' ? prevista : null;
}

/** Lo que la URL del calendario global puede pedir. Todo es opcional salvo la paginación. */
export type FiltrosCalendarioGlobal = {
  federacion: string | null;
  temporada: string | null;
  jornada: number | null;
  desde: string | null;
  hasta: string | null;
  texto: string | null;
  desplazamiento: number;
};

/** Lo que la URL del calendario de un grupo puede pedir. */
export type FiltrosCalendarioGrupo = {
  jornada: number | null;
  equipo: number | null;
  estado: 'todos' | 'con-resultado' | 'sin-resultado';
};

type Parametros = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro de búsqueda; los repetidos no se interpretan. */
function uno(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '');
}

/** Un texto de filtro: recortado, acotado y vacío → `null`. No se busca por una palabra de 1 MB. */
export function textoDeFiltro(valor: string | string[] | undefined): string | null {
  const limpio = uno(valor).trim().slice(0, 80);
  return limpio === '' ? null : limpio;
}

/** Un entero positivo de filtro; cualquier otra cosa es «sin filtro». */
export function enteroDeFiltro(valor: string | string[] | undefined, maximo = 10_000): number | null {
  const crudo = uno(valor).trim();
  if (!/^\d{1,6}$/.test(crudo)) return null;
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 && n <= maximo ? n : null;
}

/** Una fecha `AAAA-MM-DD` real; una fecha imposible (2026-02-31) o con otro formato es «sin filtro». */
export function fechaDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(crudo)) return null;
  const fecha = new Date(`${crudo}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toISOString().slice(0, 10) === crudo ? crudo : null;
}

/** Código de federación: minúsculas, letras, dígitos y guiones. Lo demás no es un código. */
export function federacionDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(crudo) ? crudo : null;
}

/** Etiqueta de temporada `AAAA-AA`; lo demás no es una temporada. */
export function temporadaDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim();
  return /^\d{4}-\d{2}$/.test(crudo) ? crudo : null;
}

/** Desplazamiento de paginación: múltiplo de la página, nunca negativo y acotado. */
export function desplazamientoDeFiltro(valor: string | string[] | undefined, tamano = TAMANO_PAGINA_CALENDARIO): number {
  const n = enteroDeFiltro(valor, 1_000_000);
  if (n === null) return 0;
  return Math.floor(n / tamano) * tamano;
}

/** Lee los filtros del calendario global de los `searchParams` de Next. */
export function leeFiltrosCalendarioGlobal(parametros: Parametros): FiltrosCalendarioGlobal {
  return {
    federacion: federacionDeFiltro(parametros.fed),
    temporada: temporadaDeFiltro(parametros.temp),
    jornada: enteroDeFiltro(parametros.j, 500),
    desde: fechaDeFiltro(parametros.desde),
    hasta: fechaDeFiltro(parametros.hasta),
    texto: textoDeFiltro(parametros.q),
    desplazamiento: desplazamientoDeFiltro(parametros.p),
  };
}

/** Lee los filtros del calendario de un grupo de los `searchParams` de Next. */
export function leeFiltrosCalendarioGrupo(parametros: Parametros): FiltrosCalendarioGrupo {
  const estadoCrudo = uno(parametros.estado).trim();
  return {
    jornada: enteroDeFiltro(parametros.j, 500),
    equipo: enteroDeFiltro(parametros.equipo, 1_000_000_000),
    estado: estadoCrudo === 'con-resultado' || estadoCrudo === 'sin-resultado' ? estadoCrudo : 'todos',
  };
}

/**
 * ¿Hay algún filtro activo en el calendario global? La temporada no cuenta: es la ventana base de la
 * pantalla (siempre hay una) y no se «quita» como un filtro.
 */
export function tieneFiltrosGlobales(f: FiltrosCalendarioGlobal): boolean {
  return Boolean(f.federacion || f.jornada !== null || f.desde || f.hasta || f.texto);
}

/** ¿Hay algún filtro activo en el calendario de un grupo? */
export function tieneFiltrosDeGrupo(f: FiltrosCalendarioGrupo): boolean {
  return f.jornada !== null || f.equipo !== null || f.estado !== 'todos';
}

/**
 * La URL del calendario global con los filtros puestos y los cambios pedidos. Los valores por defecto
 * (sin filtro, primera página) no se escriben: una URL limpia es la que se puede compartir.
 */
export function urlDeCalendarioGlobal(
  filtros: FiltrosCalendarioGlobal,
  cambios: Partial<FiltrosCalendarioGlobal> = {},
): string {
  const f = { ...filtros, ...cambios };
  const q = new URLSearchParams();
  if (f.federacion) q.set('fed', f.federacion);
  if (f.temporada) q.set('temp', f.temporada);
  if (f.jornada !== null) q.set('j', String(f.jornada));
  if (f.desde) q.set('desde', f.desde);
  if (f.hasta) q.set('hasta', f.hasta);
  if (f.texto) q.set('q', f.texto);
  if (f.desplazamiento > 0) q.set('p', String(f.desplazamiento));
  const cadena = q.toString();
  return cadena === '' ? '/explorar/calendario' : `/explorar/calendario?${cadena}`;
}

/** La URL del calendario de un grupo con los filtros puestos y los cambios pedidos. */
export function urlDeCalendarioGrupo(
  grupoId: number,
  filtros: FiltrosCalendarioGrupo,
  cambios: Partial<FiltrosCalendarioGrupo> = {},
): string {
  const f = { ...filtros, ...cambios };
  const q = new URLSearchParams();
  if (f.jornada !== null) q.set('j', String(f.jornada));
  if (f.equipo !== null) q.set('equipo', String(f.equipo));
  if (f.estado !== 'todos') q.set('estado', f.estado);
  const cadena = q.toString();
  const base = `/explorar/competicion/${grupoId}/calendario`;
  return cadena === '' ? base : `${base}?${cadena}`;
}

/** Un grupo de la lista global: una fecha y los partidos publicados en ella. */
export type GrupoDeFecha<T extends { fecha: string | null } = PartidoEnCalendario> = {
  fecha: string | null;
  partidos: T[];
};

/** Una jornada del calendario de un grupo, con sus partidos ya adaptados a la fila común. */
export type JornadaDelCalendario = {
  numero: number;
  desde: string | null;
  hasta: string | null;
  jugados: number;
  total: number;
  partidos: PartidoEnCalendario[];
};

/**
 * Reparte los partidos del grupo en jornadas, de la primera a la última, y adapta cada partido a la
 * fila del calendario. Una jornada sin partidos no se inventa: sólo existen las que tienen alguno.
 */
export function jornadasDelCalendario(partidos: readonly FilaPartidoCanonico[]): JornadaDelCalendario[] {
  const porNumero = new Map<number, JornadaDelCalendario>();
  for (const p of partidos) {
    const numero = Number(p.jornada);
    if (!Number.isInteger(numero) || numero <= 0) continue;
    const fila = porNumero.get(numero)
      ?? { numero, desde: null, hasta: null, jugados: 0, total: 0, partidos: [] };
    fila.total += 1;
    if (p.goles_local !== null && p.goles_visitante !== null) fila.jugados += 1;
    const fecha = fechaDePartidoDeGrupo(p);
    if (fecha !== null) {
      if (fila.desde === null || fecha < fila.desde) fila.desde = fecha;
      if (fila.hasta === null || fecha > fila.hasta) fila.hasta = fecha;
    }
    fila.partidos.push(partidoDeGrupoParaCalendario(p));
    porNumero.set(numero, fila);
  }
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero);
}

/**
 * Los equipos que aparecen de verdad en los partidos del grupo, ordenados por nombre. Es lo que ofrece
 * el filtro de equipo; no una lista de todos los equipos de la competición.
 */
export function equiposDelCalendario(
  partidos: readonly FilaPartidoCanonico[],
): Array<{ id: number; nombre: string }> {
  const porId = new Map<number, string>();
  for (const p of partidos) {
    const localId = Number(p.local_id);
    const visitanteId = Number(p.visitante_id);
    if (!porId.has(localId)) porId.set(localId, p.local);
    if (!porId.has(visitanteId)) porId.set(visitanteId, p.visitante);
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Agrupa los partidos por fecha conservando el orden que trae la consulta (fecha descendente) y deja
 * los que no tienen fecha publicada para el final, en su propio grupo.
 */
export function agrupaPorFecha<T extends { fecha: string | null }>(partidos: readonly T[]): GrupoDeFecha<T>[] {
  const porFecha = new Map<string, T[]>();
  const sinFecha: T[] = [];
  for (const partido of partidos) {
    const fecha = partido.fecha;
    if (fecha === null) {
      sinFecha.push(partido);
      continue;
    }
    const lista = porFecha.get(fecha);
    if (lista) lista.push(partido);
    else porFecha.set(fecha, [partido]);
  }
  const grupos: GrupoDeFecha<T>[] = [...porFecha.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([fecha, lista]) => ({ fecha, partidos: lista }));
  if (sinFecha.length > 0) grupos.push({ fecha: null, partidos: sinFecha });
  return grupos;
}

/**
 * La etiqueta de una fecha del calendario: «sáb, 12 sept». Sin año: la temporada ya está en la pantalla.
 * Una fecha imposible no se pinta; el que llama decide qué hacer con `null`.
 */
export function etiquetaDeFecha(fecha: string | null): string | null {
  if (fecha === null) return null;
  const crudo = fecha.slice(0, 10);
  const d = new Date(`${crudo}T00:00:00Z`);
  // Una fecha imposible (2026-02-31) la rueda JavaScript al mes siguiente: se valida la ida y vuelta.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== crudo) return null;
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(d);
  return texto.replace(/\.$/, '');
}

/**
 * Aplica los filtros del calendario de un grupo a sus partidos.
 *
 * Se filtra en el servidor sobre la lista del grupo (acotada a sus partidos) y no con una consulta por
 * combinación de filtros: el grupo más grande no llega a 500 partidos.
 */
export function filtraPartidosDeGrupo(
  partidos: readonly FilaPartidoCanonico[],
  filtros: FiltrosCalendarioGrupo,
): FilaPartidoCanonico[] {
  return partidos.filter((p) => {
    if (filtros.jornada !== null && Number(p.jornada) !== filtros.jornada) return false;
    if (filtros.equipo !== null
      && Number(p.local_id) !== filtros.equipo
      && Number(p.visitante_id) !== filtros.equipo) return false;
    const jugado = p.goles_local !== null && p.goles_visitante !== null;
    if (filtros.estado === 'con-resultado' && !jugado) return false;
    if (filtros.estado === 'sin-resultado' && jugado) return false;
    return true;
  });
}

/** Título de la pestaña del navegador para el calendario de un grupo. */
export function tituloDeCalendarioGrupo(x: { edicion: string; grupo: string }): string {
  return `Calendario · ${x.edicion} · ${x.grupo} — facylf`;
}

/** Título de la pestaña del navegador para el calendario global. */
export const TITULO_DE_CALENDARIO = 'Calendario — facylf';

/** La ruta del calendario de un grupo. La usan la cabecera de competición y las pruebas. */
export const rutaDeCalendario = (grupoId: number): string => `/explorar/competicion/${grupoId}/calendario`;

/** La ruta del calendario global. */
export const RUTA_CALENDARIO_GLOBAL = '/explorar/calendario';

/**
 * La ruta de la pantalla de acta (WALL objetivo 1). Vive en `lib/acta.ts`; aquí se replica el contrato
 * para no depender del fichero de otra pantalla, y la prueba de rutas fija el valor.
 */
export const rutaDeActaDePartido = (partidoId: number): string => `/explorar/acta/${partidoId}`;

/** Un id de grupo de la URL sólo vale si es un entero positivo; lo demás no es una página. */
export function idDeGrupoDeUrl(crudo: string | undefined): number | null {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}
