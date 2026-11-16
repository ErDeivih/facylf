/**
 * Reglas y cuentas de las páginas de estadísticas (WALL objetivo 5).
 *
 * Las funciones son puras para poder probarlas sin consultar ni renderizar. Lo que se calcula aquí son
 * cuentas que se pueden deducir de datos ya publicados (puntos por jornada, casa y fuera, forma,
 * porcentajes); lo que necesita eventos (goles por tramo, tarjetas) viene agregado de PostgreSQL.
 *
 * Regla que se respeta en todo el fichero: un partido sin resultado NO cuenta como 0-0 ni suma puntos;
 * una jornada sin partidos no se inventa; un porcentaje sin denominador no se pinta.
 */

import type {
  FilaGoleadorEstadisticas, GolesPorMes, ResumenDePartidos, TarjetasDeEquipo, TramoDeGoles,
} from '@/consultas/estadisticas';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { ETIQUETA_SIN_NOMBRE } from './menores';
import { formaHasta } from './pantalla-competicion';

/** La federación por defecto de la plataforma cuando la URL no pide otra. */
export const FEDERACION_POR_DEFECTO = 'castilla-leon';

/** Título de la pestaña del navegador de la página global. */
export const TITULO_ESTADISTICAS = 'Estadísticas — Fondo Popular';

/** Ruta de la página global de estadísticas. */
export const RUTA_ESTADISTICAS = '/explorar/estadisticas';

/** Filtros de la página global: federación, temporada y búsqueda de competición. */
export type FiltrosEstadisticas = {
  federacion: string | null;
  temporada: string | null;
  texto: string | null;
};

type Parametros = Record<string, string | string[] | undefined>;

function uno(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '');
}

/** Código de federación: minúsculas, letras, dígitos y guiones. */
export function federacionDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(crudo) ? crudo : null;
}

/** Etiqueta de temporada `AAAA-AA`. */
export function temporadaDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim();
  return /^\d{4}-\d{2}$/.test(crudo) ? crudo : null;
}

/** Texto de búsqueda de competición: recortado y acotado; vacío es «sin búsqueda». */
export function textoDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().slice(0, 80);
  return crudo === '' ? null : crudo;
}

/** Lee los filtros de la URL de estadísticas. Un valor inválido se ignora, no rompe la página. */
export function leeFiltrosEstadisticas(parametros: Parametros): FiltrosEstadisticas {
  return {
    federacion: federacionDeFiltro(parametros.fed),
    temporada: temporadaDeFiltro(parametros.temp),
    texto: textoDeFiltro(parametros.q),
  };
}

/** Categorías entre las que se elige en la página general. El orden es el de la pantalla. */
export const CATEGORIAS_DE_ESTADISTICAS = [
  'aficionados', 'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin', 'veteranos',
] as const;
export type CategoriaDeEstadisticas = (typeof CATEGORIAS_DE_ESTADISTICAS)[number];

/** La categoría que se enseña si la URL no pide ninguna. Siempre hay una: no existe «todas». */
export const CATEGORIA_POR_DEFECTO: CategoriaDeEstadisticas = 'aficionados';

/** Categoría de la URL (`cat`). Un valor que no es una categoría vuelve a la de por defecto. */
export function categoriaDeEstadisticas(valor: string | string[] | undefined): CategoriaDeEstadisticas {
  const crudo = uno(valor).trim().toLowerCase();
  return (CATEGORIAS_DE_ESTADISTICAS as readonly string[]).includes(crudo)
    ? (crudo as CategoriaDeEstadisticas) : CATEGORIA_POR_DEFECTO;
}

/** URL de estadísticas con una categoría, conservando el resto de filtros. */
export function urlDeEstadisticasConCategoria(filtros: FiltrosEstadisticas, categoria: CategoriaDeEstadisticas): string {
  const base = urlDeEstadisticas(filtros);
  if (categoria === CATEGORIA_POR_DEFECTO) return base;
  return `${base}${base.includes('?') ? '&' : '?'}cat=${categoria}`;
}

/** La URL de estadísticas con los filtros puestos; los valores por defecto no se escriben. */
export function urlDeEstadisticas(
  filtros: FiltrosEstadisticas,
  cambios: Partial<FiltrosEstadisticas> = {},
): string {
  const f = { ...filtros, ...cambios };
  const q = new URLSearchParams();
  if (f.federacion) q.set('fed', f.federacion);
  if (f.temporada) q.set('temp', f.temporada);
  if (f.texto) q.set('q', f.texto);
  const cadena = q.toString();
  return cadena === '' ? RUTA_ESTADISTICAS : `${RUTA_ESTADISTICAS}?${cadena}`;
}

/** ¿La URL trae algún filtro activo? Sirve para ofrecer «Quitar» sólo cuando hay algo que quitar. */
export function tieneFiltrosEstadisticas(filtros: FiltrosEstadisticas): boolean {
  return Boolean(filtros.federacion || filtros.temporada || filtros.texto);
}

/**
 * Un filtro que no existe en el catálogo no se sustituye en silencio por otro: se dice. Devolver los
 * datos de la temporada por defecto cuando se ha pedido una que no está sería mentir con la URL.
 */
export function avisoDeFiltroInexistente(
  filtros: FiltrosEstadisticas,
  federaciones: readonly string[],
  temporadas: readonly string[],
): string | null {
  if (filtros.federacion !== null && !federaciones.includes(filtros.federacion)) {
    return `La federación «${filtros.federacion}» no está en el catálogo.`;
  }
  if (filtros.temporada !== null && !temporadas.includes(filtros.temporada)) {
    return `La temporada «${filtros.temporada}» no está publicada.`;
  }
  return null;
}

/**
 * Palabras de una búsqueda de competición, normalizadas como las espera la consulta del selector
 * (minúsculas y sin tildes). Sin palabras vacías y con un máximo de 8.
 */
export function tokensDeBusqueda(texto: string | null): string[] {
  if (texto === null) return [];
  const vacias = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'en', 'a', 'por']);
  return (texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && token.length <= 30 && !vacias.has(token)))
    .filter((token, i, todos) => todos.indexOf(token) === i)
    .slice(0, 8);
}

/** La temporada que se enseña: la pedida si existe en el catálogo y, si no, la más reciente. */
export function temporadaPorDefecto(temporadas: readonly string[], pedida: string | null): string | null {
  if (pedida !== null && temporadas.includes(pedida)) return pedida;
  return temporadas[0] ?? null;
}

/**
 * Las temporadas del desplegable de la cabecera de una competición.
 *
 * Se aplica la ventana publicada, pero SIEMPRE se conserva la temporada de la competición que se está
 * viendo: una ficha histórica (2016-17, grupo 30665) tiene que poder seguir enseñándola aunque quede
 * fuera de la ventana general.
 */
export function temporadasParaCabecera<T extends { temporada: string }>(
  temporadas: readonly T[],
  temporadaActual: string,
  publicable: (temporada: string) => boolean,
): T[] {
  const publicadas = temporadas.filter((t) => publicable(t.temporada));
  if (publicadas.some((t) => t.temporada === temporadaActual)) return publicadas;
  const actual = temporadas.find((t) => t.temporada === temporadaActual);
  return actual ? [actual, ...publicadas] : publicadas;
}

/** Suma los partidos publicados de un grupo. No confunde «sin resultado» con un 0-0. */
export function agregaResumenDePartidos(partidos: readonly FilaPartidoCanonico[]): ResumenDePartidos {
  let conResultado = 0;
  let goles = 0;
  let local = 0;
  let empate = 0;
  let visitante = 0;
  let conCero = 0;
  let actas = 0;
  let actasCorrectas = 0;
  for (const p of partidos) {
    if (p.calidad_acta !== null) {
      actas += 1;
      if (p.calidad_acta === 'correct') actasCorrectas += 1;
    }
    if (p.goles_local === null || p.goles_visitante === null) continue;
    conResultado += 1;
    goles += p.goles_local + p.goles_visitante;
    if (p.goles_local > p.goles_visitante) local += 1;
    else if (p.goles_local === p.goles_visitante) empate += 1;
    else visitante += 1;
    if (p.goles_local === 0 || p.goles_visitante === 0) conCero += 1;
  }
  return {
    partidos: partidos.length,
    con_resultado: conResultado,
    goles,
    local,
    empate,
    visitante,
    con_cero: conCero,
    actas,
    actas_correctas: actasCorrectas,
  };
}

/** Un equipo con sus puntos acumulados jornada a jornada. */
export type EquipoEnJornadas = {
  id: number;
  nombre: string;
  /** Puntos acumulados al final de cada jornada de `jornadas` (misma longitud). */
  puntos: number[];
  total: number;
};

/** Los puntos de cada equipo jornada a jornada, con la lista de jornadas publicadas. */
export function puntosPorJornada(partidos: readonly FilaPartidoCanonico[]): {
  jornadas: number[];
  equipos: EquipoEnJornadas[];
} {
  const numeros = new Set<number>();
  const porEquipo = new Map<number, { nombre: string; puntos: Map<number, number> }>();
  const suma = (id: number, nombre: string, jornada: number, puntos: number) => {
    const equipo = porEquipo.get(id) ?? { nombre, puntos: new Map<number, number>() };
    equipo.puntos.set(jornada, (equipo.puntos.get(jornada) ?? 0) + puntos);
    porEquipo.set(id, equipo);
  };
  for (const p of partidos) {
    if (p.goles_local === null || p.goles_visitante === null) continue;
    const jornada = Number(p.jornada);
    numeros.add(jornada);
    const puntosLocal = p.goles_local > p.goles_visitante ? 3 : p.goles_local === p.goles_visitante ? 1 : 0;
    const puntosVisitante = p.goles_visitante > p.goles_local ? 3 : p.goles_local === p.goles_visitante ? 1 : 0;
    suma(Number(p.local_id), p.local, jornada, puntosLocal);
    suma(Number(p.visitante_id), p.visitante, jornada, puntosVisitante);
  }
  const jornadas = [...numeros].sort((a, b) => a - b);
  const equipos = [...porEquipo.entries()].map(([id, equipo]) => {
    let acumulado = 0;
    const puntos = jornadas.map((jornada) => {
      acumulado += equipo.puntos.get(jornada) ?? 0;
      return acumulado;
    });
    return { id, nombre: equipo.nombre, puntos, total: acumulado };
  }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
  return { jornadas, equipos };
}

/** Los números de un equipo en una condición (casa o fuera). */
export type MarcadorDeCondicion = {
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  goles_favor: number;
  goles_contra: number;
  puntos: number;
};

/** Una fila de la tabla de casa y fuera. */
export type FilaCasaFuera = {
  id: number;
  nombre: string;
  casa: MarcadorDeCondicion;
  fuera: MarcadorDeCondicion;
  total: MarcadorDeCondicion;
};

const marcadorVacio = (): MarcadorDeCondicion => ({
  jugados: 0, ganados: 0, empatados: 0, perdidos: 0, goles_favor: 0, goles_contra: 0, puntos: 0,
});

/** Casa y fuera de cada equipo del grupo, contando sólo partidos con resultado. */
export function casaFueraPorEquipo(partidos: readonly FilaPartidoCanonico[]): FilaCasaFuera[] {
  const porEquipo = new Map<number, FilaCasaFuera>();
  const fila = (id: number, nombre: string): FilaCasaFuera => {
    const existente = porEquipo.get(id);
    if (existente) return existente;
    const nueva = { id, nombre, casa: marcadorVacio(), fuera: marcadorVacio(), total: marcadorVacio() };
    porEquipo.set(id, nueva);
    return nueva;
  };
  const anota = (marcador: MarcadorDeCondicion, gf: number, gc: number) => {
    marcador.jugados += 1;
    marcador.goles_favor += gf;
    marcador.goles_contra += gc;
    if (gf > gc) marcador.ganados += 1;
    else if (gf === gc) marcador.empatados += 1;
    else marcador.perdidos += 1;
    marcador.puntos += gf > gc ? 3 : gf === gc ? 1 : 0;
  };
  for (const p of partidos) {
    if (p.goles_local === null || p.goles_visitante === null) continue;
    const local = fila(Number(p.local_id), p.local);
    const visitante = fila(Number(p.visitante_id), p.visitante);
    anota(local.casa, p.goles_local, p.goles_visitante);
    anota(local.total, p.goles_local, p.goles_visitante);
    anota(visitante.fuera, p.goles_visitante, p.goles_local);
    anota(visitante.total, p.goles_visitante, p.goles_local);
  }
  return [...porEquipo.values()]
    .sort((a, b) => b.total.puntos - a.total.puntos || a.nombre.localeCompare(b.nombre, 'es'));
}

/** La forma de cada equipo: sus últimos cinco resultados, del más antiguo al más reciente. */
export function ultimosResultados(
  partidos: readonly FilaPartidoCanonico[],
  limite = 5,
): Map<number, Array<'G' | 'E' | 'P'>> {
  const porEquipo = new Map<number, Array<'G' | 'E' | 'P'>>();
  const jornadas = partidos.map((p) => Number(p.jornada)).filter((n) => Number.isInteger(n));
  const maxima = jornadas.length > 0 ? Math.max(...jornadas) : 0;
  const ids = new Set<number>();
  for (const p of partidos) {
    ids.add(Number(p.local_id));
    ids.add(Number(p.visitante_id));
  }
  /*
   * Los ids de `core.team_entry` son bigint y el driver los entrega como texto. `formaHasta` compara con
   * `===` contra un número, así que se normalizan antes de calcular la forma; si no, todas las formas
   * salían vacías.
   */
  const normalizados = partidos.map((p) => ({
    ...p,
    local_id: Number(p.local_id),
    visitante_id: Number(p.visitante_id),
  }));
  for (const id of ids) {
    porEquipo.set(id, formaHasta(normalizados, id, maxima).slice(-limite));
  }
  return porEquipo;
}

/** Un partido de la lista de goleadores con su porcentaje acumulado sobre los goles del ámbito. */
export type GoleadorConAcumulado = FilaGoleadorEstadisticas & {
  /** Porcentaje acumulado de los goles del ámbito que suman los goleadores hasta esta fila. */
  acumulado: number | null;
};

/**
 * Añade el porcentaje acumulado a la lista de goleadores. Se calcula sobre los goles del ámbito; si no
 * hay goles publicados, no hay porcentaje (no se pinta un 0 que no significa nada).
 */
export function goleadoresConAcumulado(
  goleadores: readonly FilaGoleadorEstadisticas[],
  golesDelAmbito: number,
): GoleadorConAcumulado[] {
  let acumulados = 0;
  return goleadores.map((goleador) => {
    acumulados += goleador.goles;
    return {
      ...goleador,
      acumulado: golesDelAmbito > 0 ? Math.round((100 * acumulados) / golesDelAmbito) : null,
    };
  });
}

/** Una parte del reparto de resultados (local, empate o visitante). */
export type ParteDeResultados = {
  clave: 'local' | 'empate' | 'visitante';
  etiqueta: string;
  partidos: number;
  porcentaje: number;
};

/** El reparto de resultados de un ámbito, sin porcentajes inventados. */
export function repartoDeResultados(resumen: ResumenDePartidos): ParteDeResultados[] {
  const total = resumen.con_resultado;
  const parte = (clave: ParteDeResultados['clave'], etiqueta: string, partidos: number): ParteDeResultados => ({
    clave, etiqueta, partidos, porcentaje: total > 0 ? Math.round((100 * partidos) / total) : 0,
  });
  return [
    parte('local', 'Gana el local', resumen.local),
    parte('empate', 'Empate', resumen.empate),
    parte('visitante', 'Gana el visitante', resumen.visitante),
  ];
}

/** Etiqueta de un tramo de quince minutos. El 6 es «90+» y el 99 «sin minuto». */
export function etiquetaDeTramo(orden: number): string {
  if (orden === 99) return 'Sin minuto';
  if (orden >= 6) return "90+'";
  return `${orden * 15}-${orden * 15 + 15}'`;
}

/**
 * Los seis tramos de quince minutos, siempre, más el grupo «sin minuto» sólo si hay goles sin minuto.
 * Un tramo con 0 goles es un cero real (había partidos y no se marcó en ese tramo), no un hueco.
 */
export function tramosCompletos(tramos: readonly TramoDeGoles[]): Array<{ orden: number; etiqueta: string; goles: number }> {
  const porOrden = new Map(tramos.map((tramo) => [tramo.orden, tramo.goles]));
  const filas = Array.from({ length: 6 }, (_, orden) => ({
    orden, etiqueta: etiquetaDeTramo(orden), goles: porOrden.get(orden) ?? 0,
  }));
  const sinMinuto = porOrden.get(99) ?? 0;
  if (sinMinuto > 0) filas.push({ orden: 99, etiqueta: etiquetaDeTramo(99), goles: sinMinuto });
  return filas;
}

/** Porcentaje redondeado; sin denominador devuelve `null` en vez de un cero falso. */
export function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((100 * parte) / total);
}

/** Goles por partido con un decimal en coma española, o `null` si no hay partidos con resultado. */
export function golesPorPartido(resumen: ResumenDePartidos): number | null {
  if (resumen.con_resultado <= 0) return null;
  return Math.round((resumen.goles / resumen.con_resultado) * 100) / 100;
}

/** Un número con separador de miles español. */
export function numero(valor: number): string {
  return new Intl.NumberFormat('es-ES').format(valor);
}

/** Un número decimal con coma española. */
export function decimal(valor: number | null): string {
  if (valor === null) return '—';
  return valor.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/** El nombre que se publica de un goleador; sin nombre no se inventa. */
export function nombrePublicado(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();
  return limpio === '' ? ETIQUETA_SIN_NOMBRE : limpio;
}

/** Títulos que enuncian la conclusión, no cómo se calcula. */
export function conclusionDePuntos(equipos: readonly EquipoEnJornadas[], jornadas: number): string {
  if (equipos.length === 0 || jornadas === 0) return 'Sin puntos publicados';
  const lider = equipos[0]!;
  if (jornadas === 1) return `${lider.nombre} empieza con ${lider.total} puntos`;
  return `${lider.nombre} cierra con ${lider.total} puntos en ${jornadas} jornadas`;
}

export function conclusionDeTramos(tramos: readonly { orden: number; goles: number }[]): string {
  const jugables = tramos.filter((tramo) => tramo.orden < 99);
  const total = jugables.reduce((suma, tramo) => suma + tramo.goles, 0);
  if (total === 0) return 'Sin goles publicados';
  const maximo = Math.max(...jugables.map((tramo) => tramo.goles));
  const mejores = jugables.filter((tramo) => tramo.goles === maximo);
  if (mejores.length > 1) {
    return `${mejores.map((tramo) => etiquetaDeTramo(tramo.orden)).join(' y ')} suman ${maximo} goles cada uno`;
  }
  return `${etiquetaDeTramo(mejores[0]!.orden)} es el tramo con más goles (${maximo})`;
}

/** Etiqueta corta de un mes (`AAAA-MM`) para el eje del gráfico: «sept», «oct». */
export function etiquetaDeMesCorta(mes: string): string {
  const fecha = new Date(`${mes}-01T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return mes;
  return new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(fecha).replace(/\.$/, '');
}

export function conclusionDeResultados(resumen: ResumenDePartidos): string {
  if (resumen.con_resultado === 0) return 'Sin resultados publicados';
  const reparto = repartoDeResultados(resumen);
  const maximo = reparto.reduce((mejor, parte) => (parte.partidos > mejor.partidos ? parte : mejor), reparto[0]!);
  if (maximo.clave === 'empate') return `${maximo.porcentaje} % de los partidos terminan en empate`;
  return `${maximo.porcentaje} % de los partidos los gana ${maximo.clave === 'local' ? 'el local' : 'el visitante'}`;
}

/** Título de la gráfica de goles por mes: el mes con más goles, no cómo se cuenta. */
export function etiquetaDeMes(mes: string): string {
  const fecha = new Date(`${mes}-01T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return mes;
  const texto = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(fecha);
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
}

export function conclusionDeMes(porMes: readonly GolesPorMes[]): string {
  if (porMes.length === 0) return 'Sin goles publicados';
  const maximo = porMes.reduce((mejor, mes) => (mes.goles > mejor.goles ? mes : mejor), porMes[0]!);
  if (maximo.goles === 0) return 'Sin goles publicados';
  return `${etiquetaDeMes(maximo.mes)} es el mes más goleador (${maximo.goles} goles)`;
}

export function conclusionDeGoleadores(
  goleadores: readonly GoleadorConAcumulado[],
  golesDelAmbito: number,
): string {
  if (goleadores.length === 0 || golesDelAmbito === 0) return 'Sin goleadores publicados';
  const ultimo = goleadores[goleadores.length - 1]!;
  const cuantos = goleadores.length;
  return cuantos === 1
    ? `${goleadores[0]!.nombre} firma el ${ultimo.acumulado ?? 0} % de los goles`
    : `Los ${cuantos} máximos goleadores firman el ${ultimo.acumulado ?? 0} % de los goles`;
}

/** Un id de grupo de la URL sólo vale si es un entero positivo. */
export function idDeGrupoDeUrl(crudo: string | undefined): number | null {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Título de la pestaña para las estadísticas de una competición. */
export function tituloDeEstadisticasGrupo(x: { edicion: string; grupo: string }): string {
  return `Estadísticas · ${x.edicion} · ${x.grupo} — Fondo Popular`;
}

/** La ruta de las estadísticas de un grupo. */
export const rutaDeEstadisticas = (grupoId: number): string => `/explorar/competicion/${grupoId}/estadisticas`;

/** Los meses ordenados; utilidad para la tabla del gráfico. */
export function golesPorMesOrdenados(porMes: readonly GolesPorMes[]): GolesPorMes[] {
  return [...porMes].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
}

/** Total de tarjetas de un equipo, para ordenar y comparar en la tabla de disciplina. */
export function totalDeTarjetas(tarjetas: TarjetasDeEquipo): number {
  return tarjetas.amarillas + tarjetas.rojas;
}
