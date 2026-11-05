/**
 * Reglas de presentación de las pantallas «Datos», «Salud» y «Estados».
 *
 * (La observabilidad de la web —`midiendo`, `anotaError`, `registraWebVital`— vive aparte, en
 * `lib/observabilidad.ts`; este fichero es sólo lo que se enseña.)
 *
 * La idea que gobierna el fichero: una comprobación de salud **no se interpreta, se lee**. El canónico
 * ya dice el estado (`ok`, `info`, `aviso`, `fallo`), el valor medido y el umbral con el que se compara;
 * aquí lo único que se hace es ponerle nombre, unidad y palabras, y decidir qué es lo peor de un área.
 * Cuando una comprobación no está en el diccionario se enseña su nombre legible y no se le inventa ni
 * unidad ni tratamiento.
 *
 * Los porcentajes de capacidad tampoco se retocan: si la base guarda un 700 % (una medida imposible),
 * no se publica como si fuera un dato; se enseña «—» y se acabó. Un número imposible no es un dato.
 */

import type { FilaCapacidad, FilaChequeo, EjemploDeEstado } from '@/consultas/observabilidad';

/* ── Estados y severidades ─────────────────────────────────────────────────────────────────────── */

export type EstadoChequeo = 'ok' | 'info' | 'aviso' | 'fallo';

const ORDEN_ESTADO: Record<EstadoChequeo, number> = { ok: 0, info: 1, aviso: 2, fallo: 3 };

/** Convierte el estado que llega de la base en uno conocido; lo desconocido no se disfraza de «ok». */
export function estadoConocido(estado: string | null | undefined): EstadoChequeo {
  return estado === 'ok' || estado === 'info' || estado === 'aviso' || estado === 'fallo' ? estado : 'info';
}

/** El peor estado de una lista. Sin lista, `ok`. */
export function estadoPeor(estados: readonly string[]): EstadoChequeo {
  let peor: EstadoChequeo = 'ok';
  for (const estado of estados) {
    const conocido = estadoConocido(estado);
    if (ORDEN_ESTADO[conocido] > ORDEN_ESTADO[peor]) peor = conocido;
  }
  return peor;
}

/** La severidad que se enseña: `fallo` es grave, `aviso` es aviso, `info` es informativo. */
export function severidadDeEstado(estado: string): 'grave' | 'aviso' | 'info' | 'ok' {
  const conocido = estadoConocido(estado);
  if (conocido === 'fallo') return 'grave';
  if (conocido === 'aviso') return 'aviso';
  if (conocido === 'info') return 'info';
  return 'ok';
}

/** Las áreas que la Salud pública enseña. Las cuentas, los usuarios y la publicidad quedan fuera. */
export const AREAS_PUBLICAS = [
  'base', 'procesos', 'frescura', 'calidad', 'identidad', 'rendimiento', 'copias', 'avisos', 'web',
] as const;

export type AreaPublica = (typeof AREAS_PUBLICAS)[number];

export const ETIQUETA_AREA: Record<string, string> = {
  base: 'Datos',
  procesos: 'Actualizaciones',
  frescura: 'Frescura',
  calidad: 'Calidad',
  identidad: 'Identidad',
  rendimiento: 'Velocidad',
  copias: 'Copias',
  avisos: 'Avisos',
  web: 'Web',
};

export type ResumenDeArea = {
  area: string;
  etiqueta: string;
  estado: EstadoChequeo;
  total: number;
  fallos: number;
  avisos: number;
  infos: number;
  ok: number;
};

/** Agrupa las comprobaciones por área (sólo las áreas que se enseñan), con el peor estado de cada una. */
export function agrupaChequeosPorArea(
  chequeos: readonly FilaChequeo[],
  areas: readonly string[] = AREAS_PUBLICAS,
): ResumenDeArea[] {
  const incluidas = new Set(areas);
  const porArea = new Map<string, ResumenDeArea>();
  for (const chequeo of chequeos) {
    if (!incluidas.has(chequeo.area)) continue;
    const actual = porArea.get(chequeo.area) ?? {
      area: chequeo.area,
      etiqueta: ETIQUETA_AREA[chequeo.area] ?? capitaliza(chequeo.area),
      estado: 'ok' as EstadoChequeo,
      total: 0, fallos: 0, avisos: 0, infos: 0, ok: 0,
    };
    const estado = estadoConocido(chequeo.estado);
    actual.total += 1;
    if (estado === 'fallo') actual.fallos += 1;
    else if (estado === 'aviso') actual.avisos += 1;
    else if (estado === 'info') actual.infos += 1;
    else actual.ok += 1;
    actual.estado = estadoPeor([actual.estado, estado]);
    porArea.set(chequeo.area, actual);
  }
  // En el orden en que se declaran las áreas, que es el orden en el que se leen.
  return areas
    .filter((area) => porArea.has(area))
    .map((area) => porArea.get(area)!);
}

/** Recuento de comprobaciones por estado, sobre las áreas que se enseñan. */
export function resumenDeComprobaciones(
  chequeos: readonly FilaChequeo[],
  areas: readonly string[] = AREAS_PUBLICAS,
): { fallos: number; avisos: number; infos: number; ok: number } {
  const incluidas = new Set(areas);
  const resumen = { fallos: 0, avisos: 0, infos: 0, ok: 0 };
  for (const chequeo of chequeos) {
    if (!incluidas.has(chequeo.area)) continue;
    const estado = estadoConocido(chequeo.estado);
    if (estado === 'fallo') resumen.fallos += 1;
    else if (estado === 'aviso') resumen.avisos += 1;
    else if (estado === 'info') resumen.infos += 1;
    else resumen.ok += 1;
  }
  return resumen;
}

/* ── Nombre, unidad y valor de cada comprobación ──────────────────────────────────────────────── */

/** Cómo se llama cada comprobación cuando la lee una persona. */
const ETIQUETA_CHEQUEO: Record<string, string> = {
  proyeccion_pendiente: 'Competiciones pendientes de publicar',
  lotes_fallidos_24h: 'Lotes fallidos (24 h)',
  lotes_colgados: 'Lotes colgados',
  errores_normalizacion_24h: 'Errores de normalización (24 h)',
  actas_a_revisar_7d: 'Actas a revisar (7 días)',
  jugados_sin_acta: 'Partidos jugados sin acta',
  goles_no_cuadran_7d: 'Goles que no cuadran con el marcador',
  amarillas_duplicadas: 'Amarillas duplicadas en el mismo minuto',
  titular_en_dos_partidos_a_la_vez: 'Titular en dos partidos a la vez',
  minutos_no_calculables: 'Minutos no calculables',
  edad_incoherente: 'Edad incoherente',
  dos_clubes_a_la_vez: 'Dos clubes a la vez',
  expulsado_que_juega_el_siguiente: 'Expulsado que juega el siguiente',
  tamano_base_gb: 'Tamaño de la base',
  conexiones: 'Conexiones a la base',
  bloqueos: 'Bloqueos de la base',
  consultas_largas: 'Consultas largas',
  consultas_sobre_presupuesto: 'Consultas por encima de su presupuesto',
  errores_web_15min: 'Errores de la web',
  sentencias_lentas: 'Sentencias lentas',
  copia_de_seguridad: 'Copia de seguridad',
  restauracion_probada: 'Restauración probada',
  avisos_generador: 'Generador de avisos',
  avisos_push_atascados: 'Avisos push atascados',
  suscripciones_push_fallando: 'Suscripciones push con fallos',
  correos_fallidos_24h: 'Correos fallidos (24 h)',
  generador_avisos_fallando: 'Generador de avisos con fallos',
  cache_sin_refrescar: 'Páginas con datos desactualizados',
  casos_graves_abiertos: 'Casos graves abiertos',
  casos_nuevos_24h: 'Casos nuevos (24 h)',
  ediciones_sin_medir: 'Competiciones sin datos comprobados',
  registros_sin_aprobar: 'Registros sin aprobar',
  altas_24h: 'Altas (24 h)',
  accesos_menores_24h: 'Accesos a nombres de menores',
  errores_entrada_15min: 'Errores de entrada',
  administradores_activos: 'Administradores activos',
  permisos_caducados_sin_quitar: 'Permisos caducados',
  publicidad_activa: 'Espacios de publicidad activos',
  campanas_caducadas_activas: 'Campañas caducadas activas',
  administradores_sin_2fa: 'Administradores sin verificación en dos pasos',
  pendientes_esperando: 'Cuentas pendientes',
  cuentas_frenadas: 'Cuentas frenadas',
};

/** Nombre de la federación en la comprobación `federacion_sin_lote:<código>`. */
const NOMBRE_FEDERACION: Record<string, string> = {
  'castilla-leon': 'Castilla y León', andalucia: 'Andalucía', aragon: 'Aragón', asturias: 'Asturias',
  baleares: 'Baleares', canarias: 'Canarias', cantabria: 'Cantabria', 'castilla-la-mancha': 'Castilla-La Mancha',
  cataluna: 'Cataluña', ceuta: 'Ceuta', euskadi: 'Euskadi', extremadura: 'Extremadura', galicia: 'Galicia',
  gipuzkoa: 'Gipuzkoa', laspalmas: 'Las Palmas', madrid: 'Madrid', melilla: 'Melilla', murcia: 'Murcia',
  navarra: 'Navarra', rfef: 'RFEF', rioja: 'La Rioja', tenerife: 'Tenerife', valencia: 'Valencia',
};

/** El nombre corto de una federación por su código; si no está, el código legible (no se inventa). */
export function nombreCortoDeFederacion(codigo: string): string {
  return NOMBRE_FEDERACION[codigo] ?? capitaliza(codigo.replace(/-/g, ' '));
}

function capitaliza(texto: string): string {
  return texto.length === 0 ? texto : texto[0]!.toLocaleUpperCase('es') + texto.slice(1);
}

/** El nombre de una comprobación en palabras. Lo que no está en el diccionario se hace legible. */
export function etiquetaDeChequeo(nombre: string): string {
  if (nombre.startsWith('federacion_sin_lote:')) {
    const codigo = nombre.slice('federacion_sin_lote:'.length);
    return `${nombreCortoDeFederacion(codigo)}: sin lote publicado`;
  }
  if (nombre.startsWith('tuplas_muertas:')) return 'Tablas con filas muertas';
  const directa = ETIQUETA_CHEQUEO[nombre];
  if (directa) return directa;
  // Un nombre que no está en el diccionario se enseña legible, no crudo: nunca se inventa su sentido.
  return capitaliza(nombre.replace(/_/g, ' ').replace(/:/g, ' · '));
}

/** La unidad en la que se mide cada comprobación (según lo que mide de verdad). */
const UNIDAD_CHEQUEO: Record<string, string> = {
  proyeccion_pendiente: 'grupos',
  federacion_sin_lote: 'horas',
  lotes_fallidos_24h: 'lotes',
  lotes_colgados: 'lotes',
  errores_normalizacion_24h: 'errores',
  actas_a_revisar_7d: '%',
  jugados_sin_acta: 'partidos',
  goles_no_cuadran_7d: 'partidos',
  amarillas_duplicadas: 'casos',
  titular_en_dos_partidos_a_la_vez: 'casos',
  minutos_no_calculables: '%',
  edad_incoherente: 'personas',
  dos_clubes_a_la_vez: 'personas',
  expulsado_que_juega_el_siguiente: 'casos',
  tamano_base_gb: 'GB',
  conexiones: '%',
  bloqueos: 'sesiones',
  consultas_largas: 'consultas',
  consultas_sobre_presupuesto: 'consultas',
  errores_web_15min: 'errores',
  sentencias_lentas: 'sentencias',
  copia_de_seguridad: 'horas',
  restauracion_probada: 'días',
  avisos_generador: 'minutos',
  avisos_push_atascados: 'avisos',
  suscripciones_push_fallando: 'suscripciones',
  correos_fallidos_24h: 'correos',
  generador_avisos_fallando: 'errores',
  cache_sin_refrescar: 'páginas',
  casos_graves_abiertos: 'casos',
  casos_nuevos_24h: 'casos',
  ediciones_sin_medir: 'competiciones',
  registros_sin_aprobar: 'registros',
  altas_24h: 'altas',
  accesos_menores_24h: 'accesos',
  errores_entrada_15min: 'errores',
  administradores_activos: 'administradores',
  permisos_caducados_sin_quitar: 'permisos',
  publicidad_activa: 'espacios',
  campanas_caducadas_activas: 'campañas',
  administradores_sin_2fa: 'administradores',
  pendientes_esperando: 'cuentas',
  cuentas_frenadas: 'cuentas',
};

/** La unidad de una comprobación; `null` si no se conoce (y entonces no se escribe ninguna). */
export function unidadDeChequeo(nombre: string): string | null {
  if (nombre.startsWith('federacion_sin_lote:')) return UNIDAD_CHEQUEO.federacion_sin_lote ?? null;
  if (nombre.startsWith('tuplas_muertas:')) return '%';
  return UNIDAD_CHEQUEO[nombre] ?? null;
}

/** Cómo se escribe una unidad corta: las horas se abrevian, los días y los grupos no. */
const UNIDAD_CORTA: Record<string, string> = { horas: 'h' };

/** Un valor con su unidad, en castellano. Sin valor, un guion (nunca un cero). */
export function textoDeValor(valor: number | null | undefined, unidad: string | null): string {
  if (valor === null || valor === undefined) return '—';
  const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(valor);
  if (unidad === null || unidad === '') return numero;
  if (unidad === '%') return `${numero} %`;
  return `${numero} ${UNIDAD_CORTA[unidad] ?? unidad}`;
}

/** Qué hace la plataforma con cada tipo de caso; `null` cuando no está escrito y no se inventa. */
const TRATAMIENTO: Record<string, string> = {
  proyeccion_pendiente: 'Las competiciones se publican por orden; mientras esperan, sus datos no se actualizan.',
  minutos_no_calculables: 'No se calculan minutos; se muestran los partidos y las titularidades.',
  jugados_sin_acta: 'El partido se enseña sin acta y se dice: no se rellena con ceros.',
  actas_a_revisar_7d: 'El acta se enseña con su aviso; no se corrige a mano.',
  goles_no_cuadran_7d: 'Manda el resultado oficial; los goles se cuentan igual y el partido queda marcado.',
  amarillas_duplicadas: 'Se cuenta una amarilla, no una expulsión: casi siempre es un duplicado.',
  titular_en_dos_partidos_a_la_vez: 'Se separan o se marcan: una persona no juega dos partidos a la vez.',
  edad_incoherente: 'Se revisa la unión de identidad antes de publicar edad o categoría.',
  dos_clubes_a_la_vez: 'Puede ser fútbol y sala o un convenio; se marca para revisar.',
  expulsado_que_juega_el_siguiente: 'La sanción se marca como «sin confirmar»: puede haber recurso.',
  ediciones_sin_medir: 'La competición se enseña con lo que hay; sus estadísticas aún no están calculadas.',
};

/** Lo que la plataforma hace con una comprobación, en palabras; `null` si no está documentado. */
export function tratamientoDeChequeo(nombre: string): string | null {
  return TRATAMIENTO[nombre] ?? null;
}

/**
 * Los tipos de caso que la pantalla «Datos» enseña. Es una lista corta a propósito: las 68
 * comprobaciones incluyen una por federación y varias de plataforma, y volcarlas todas convierte la
 * pantalla en un registro que nadie lee. Aquí van las que hablan de un tipo de problema de datos.
 */
export const CASOS_DE_DATOS = [
  'proyeccion_pendiente',
  'casos_graves_abiertos',
  'ediciones_sin_medir',
  'minutos_no_calculables',
  'titular_en_dos_partidos_a_la_vez',
  'amarillas_duplicadas',
  'actas_a_revisar_7d',
  'jugados_sin_acta',
  'goles_no_cuadran_7d',
  'edad_incoherente',
  'dos_clubes_a_la_vez',
  'expulsado_que_juega_el_siguiente',
] as const;

/** ¿Es una de las comprobaciones que se enseñan como caso de datos? */
export function esCasoDeDatos(nombre: string): boolean {
  return (CASOS_DE_DATOS as readonly string[]).includes(nombre);
}

/** ¿La federación es de laboratorio (no se publica)? */
export function esFederacionDePruebas(codigo: string): boolean {
  return codigo.startsWith('pruebas');
}

/* ── Alertas ──────────────────────────────────────────────────────────────────────────────────── */

export type AlertaDeChequeo = {
  nombre: string;
  titulo: string;
  severidad: 'grave' | 'aviso' | 'info' | 'ok';
  valorTexto: string;
  umbralTexto: string;
  unidad: string | null;
  tratamiento: string | null;
};

/** Una comprobación convertida en una línea que se puede leer: qué es, cuánto vale y con qué se compara. */
export function alertaDeChequeo(chequeo: FilaChequeo): AlertaDeChequeo {
  const unidad = unidadDeChequeo(chequeo.nombre);
  return {
    nombre: chequeo.nombre,
    titulo: etiquetaDeChequeo(chequeo.nombre),
    severidad: severidadDeEstado(chequeo.estado),
    valorTexto: textoDeValor(chequeo.valor, unidad),
    umbralTexto: textoDeValor(chequeo.umbral, unidad),
    unidad,
    tratamiento: tratamientoDeChequeo(chequeo.nombre),
  };
}

/* ── Tiempo y fechas ─────────────────────────────────────────────────────────────────────────── */

/** «hace 2 h», «hace 2 días», «ahora mismo»; sin fecha o ilegible, un guion. */
export function haceTiempo(fecha: string | null | undefined, ahora: Date = new Date()): string {
  if (fecha === null || fecha === undefined || fecha === '') return '—';
  const instante = new Date(fecha);
  if (Number.isNaN(instante.getTime())) return '—';
  const minutos = Math.floor((ahora.getTime() - instante.getTime()) / 60000);
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/**
 * Fecha y hora de un cálculo en hora de Madrid (`05/11, 22:06`), para que no dependa de la zona del
 * servidor que renderiza. Sin fecha, un guion.
 */
export function fechaHoraDeCalculo(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const instante = new Date(fecha);
  if (Number.isNaN(instante.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(instante);
}

/* ── Capacidad: qué datos se pueden enseñar ──────────────────────────────────────────────────── */

export type Capacidades = {
  minutos: boolean;
  disciplina: boolean;
  golesPorTramo: boolean;
  alineaciones: boolean;
  posiciones: boolean;
};

/** Umbrales por defecto (los mismos que guarda `analytics.parametro_capacidad`), por si faltan. */
export const PARAMETROS_POR_DEFECTO: Record<string, number> = {
  min_pct_cambios: 40,
  min_pct_tarjetas: 15,
  min_pct_minuto_gol: 80,
  min_pct_posiciones: 50,
  min_pct_alineaciones: 30,
};

/**
 * Qué se puede enseñar con los datos de una federación, según los umbrales REALES del proyecto.
 * Si un umbral no llega, la capacidad es `false`: no se afirma que haya minutos o tarjetas.
 */
export function capacidadesDeFederacion(
  fila: FilaCapacidad,
  parametros: Readonly<Record<string, number>>,
): Capacidades {
  const cumple = (valor: number | null, umbral: number | undefined): boolean =>
    umbral !== undefined && valor !== null && valor >= umbral;
  return {
    minutos: cumple(fila.pct_cambios, parametros.min_pct_cambios),
    disciplina: cumple(fila.pct_tarjetas, parametros.min_pct_tarjetas),
    golesPorTramo: cumple(fila.pct_minuto_gol, parametros.min_pct_minuto_gol),
    alineaciones: cumple(fila.pct_alineacion, parametros.min_pct_alineaciones),
    posiciones: cumple(fila.pct_posicion, parametros.min_pct_posiciones),
  };
}

/** Lo que NO se puede enseñar, en palabras. No incluye el filtro por posición (no es una carencia de la ficha). */
export function carenciasDeFederacion(capacidades: Capacidades): string[] {
  const carencias: string[] = [];
  if (!capacidades.minutos) carencias.push('sin minutos jugados');
  if (!capacidades.disciplina) carencias.push('sin disciplina');
  if (!capacidades.golesPorTramo) carencias.push('sin goles por tramo');
  if (!capacidades.alineaciones) carencias.push('sin alineaciones');
  return carencias;
}

/**
 * Un porcentaje que se puede publicar: entre 0 y 100. Fuera de ese rango la medida está mal y se
 * devuelve `null` (la pantalla enseña «—»), porque un 700 % no es un dato.
 */
export function porcentajePublicable(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null;
  return valor >= 0 && valor <= 100 ? valor : null;
}

/** Un porcentaje con un decimal y el signo; sin dato publicable, «—». */
export function textoDePorcentaje(valor: number | null | undefined): string {
  const publicable = porcentajePublicable(valor);
  if (publicable === null) return '—';
  const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(publicable);
  return `${numero} %`;
}

/**
 * La temporada de referencia para comparar federaciones: la última CERRADA. La más reciente puede estar
 * en curso (y comparar una federación con dos jornadas jugadas con otra con treinta no dice nada).
 */
export function temporadaDeReferencia(filas: readonly { temporada: string; orden: number }[]): string | null {
  const temporadas = [...new Map(filas.map((f) => [f.temporada, f.orden])).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([temporada]) => temporada);
  if (temporadas.length === 0) return null;
  return temporadas[1] ?? temporadas[0]!;
}

/* ── Estados de una competición ──────────────────────────────────────────────────────────────── */

export type TipoDeEstadoVacio = 'sin_resultado' | 'sin_calendario' | 'sin_actas' | 'sin_cambios';

export type MotivoDeEstado = {
  tipo: TipoDeEstadoVacio;
  chip: string;
  titulo: string;
  motivo: string;
  href: string | null;
};

/**
 * El estado vacío de una competición, con las cifras REALES del grupo que se enseña. Cada motivo dice
 * qué pasa y qué verá el usuario cuando el dato llegue; no rellena nada.
 */
export function motivoDeEstado(
  tipo: TipoDeEstadoVacio,
  ejemplo: EjemploDeEstado | null | undefined,
): MotivoDeEstado | null {
  if (!ejemplo || ejemplo.grupo === null) return null;
  const href = `/explorar/competicion/${ejemplo.grupo}`;
  switch (tipo) {
    case 'sin_resultado': {
      const partidos = ejemplo.partidos;
      return {
        tipo, chip: 'Pendiente', titulo: 'Resultados', href,
        motivo: partidos !== null && partidos > 0
          ? `El grupo tiene ${partidos} ${partidos === 1 ? 'partido' : 'partidos'} de calendario y ninguno con resultado publicado todavía. En cuanto la federación los publique, aparecerán aquí.`
          : 'El grupo tiene calendario y ningún resultado publicado todavía. En cuanto la federación los publique, aparecerán aquí.',
      };
    }
    case 'sin_calendario':
      return {
        tipo, chip: 'Sin calendario', titulo: 'Calendario', href,
        motivo: 'Esta competición todavía no tiene calendario importado. No hay partidos que enseñar, y no se completa con una lista inventada.',
      };
    case 'sin_actas': {
      const conResultado = ejemplo.con_resultado;
      return {
        tipo, chip: 'Sin actas', titulo: 'Actas', href,
        motivo: conResultado !== null && conResultado > 0
          ? `Hay ${conResultado} ${conResultado === 1 ? 'partido' : 'partidos'} con resultado y ninguna acta publicada. Sin acta no hay alineaciones, tarjetas ni minutos: se dice y no se rellena.`
          : 'No hay actas publicadas de este grupo. Sin acta no hay alineaciones, tarjetas ni minutos: se dice y no se rellena.',
      };
    }
    case 'sin_cambios':
      return {
        tipo, chip: 'Sin minutos', titulo: 'Minutos', href,
        motivo: 'La federación no apunta los cambios en este grupo. Los partidos y los resultados se enseñan, pero los minutos jugados no se pueden calcular.',
      };
  }
}
