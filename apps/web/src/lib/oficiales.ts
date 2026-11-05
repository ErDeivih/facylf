/**
 * Reglas de las fichas de árbitros, entrenadores y delegados: los cálculos que NO van en el JSX.
 *
 * ── LOS ROLES DEL ACTA ESTÁN ESCRITOS COMO A CADA FEDERACIÓN LE PARECIÓ ─────────────────────────────
 *
 * `core.match_staff.rol` guarda el literal de la fuente: «Entrenador», «entrenador», «Entrenatzailea»,
 * «2ºEntrenador», «DEL. Equipo», «DELEGAT EQUIP», «Taldeko Delegatua», «DEL. Campo», «delegado-campo»…
 * Son 171 variantes distintas en el canónico. Una pantalla de «entrenadores» no puede filtrar por el
 * literal exacto: se quedaría con los de una sola federación. Aquí se normalizan a una familia, con la
 * misma regla que usa el SQL de `consultas/oficiales.ts` (`core.normaliza_nombre` + patrones), para que
 * la pantalla y la consulta no digan cosas distintas.
 *
 * Lo que **no** se hace: deducir un rol que la fuente no publica. «Monitor», «Auxiliar» o un literal
 * desconocido se quedan en `otro`; no se ascienden a entrenador.
 *
 * La regla de los datos, la de siempre: un `null` es «no se sabe» y no se convierte en cero. Por eso las
 * medias devuelven `null` (y la pantalla enseña «—») cuando no hay partidos con acta.
 */

/** Familia de un rol del cuerpo técnico o de la delegación. */
export type FamiliaRol =
  | 'entrenador'
  | 'segundo_entrenador'
  | 'entrenador_porteros'
  | 'delegado_equipo'
  | 'delegado_campo'
  | 'preparador_fisico'
  | 'fisioterapeuta'
  | 'medico'
  | 'material'
  | 'auxiliar'
  | 'otro';

/** La etiqueta que se lee en pantalla para cada familia. */
const ETIQUETA_FAMILIA: Record<FamiliaRol, string> = {
  entrenador: 'Entrenador',
  segundo_entrenador: 'Segundo entrenador',
  entrenador_porteros: 'Entrenador de porteros',
  delegado_equipo: 'Delegado de equipo',
  delegado_campo: 'Delegado de campo',
  preparador_fisico: 'Preparador físico',
  fisioterapeuta: 'Fisioterapeuta',
  medico: 'Médico',
  material: 'Encargado de material',
  auxiliar: 'Auxiliar',
  otro: 'Cuerpo técnico',
};

/**
 * Normaliza un rol igual que `core.normaliza_nombre` de la base: minúsculas, sin diacríticos y con la
 * puntuación convertida en un espacio. `º`/`ª` se convierten en `o`/`a` porque `unaccent` en PostgreSQL
 * lo hace así («2ºEntrenador» → «2oentrenador»); sin eso, la regla de TypeScript y la del SQL no
 * coincidirían y una pantalla enseñaría un rol que la otra filtra.
 */
export function normalizaRol(rol: string): string {
  return (rol ?? '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/º/g, 'o')
    .replace(/ª/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** ¿El texto normalizado nombra a un entrenador (principal o ayudante)? */
const nombraEntrenador = (n: string): boolean =>
  /entrenador|entrenatzaile|coach|manager/.test(n);

/** ¿El texto normalizado nombra a un delegado? (`delegado`, `delegat`, `delegatua`, `delegate`) */
const nombraDelegado = (n: string): boolean => /deleg/.test(n);

/**
 * La familia de un rol del acta. Las reglas van de la más específica a la más general: el entrenador de
 * porteros y el segundo entrenador se reconocen ANTES que el entrenador a secas, y el delegado de campo
 * antes que el de equipo (comparten la palabra «delegado»).
 */
export function familiaDeRol(rol: string): FamiliaRol {
  const n = normalizaRol(rol);
  if (n === '') return 'otro';

  // ── Delegados ──────────────────────────────────────────────────────────────────────────────────
  // El de campo es otra figura (el del recinto), no el delegado del equipo.
  if (n === 'del campo' || n === 'delegat camp' || n === 'zelaiko delegatua'
    || (nombraDelegado(n) && /(^|\s)(campo|field)(\s|$)/.test(n))) {
    return 'delegado_campo';
  }
  // Responsabilidades que llevan «delegado» en el nombre pero no son el delegado del equipo.
  if (nombraDelegado(n) && /proteccion|covid/.test(n)) return 'otro';
  if (n === 'del equipo' || n === 'delegat equip' || n === 'taldeko delegatua' || nombraDelegado(n)) {
    return 'delegado_equipo';
  }

  // ── Cuerpo técnico ────────────────────────────────────────────────────────────────────────────
  if (nombraEntrenador(n) && /porter|atezain/.test(n)) return 'entrenador_porteros';
  if (/^2o?\s*(entrenador|entrenatzaile|coach)/.test(n) || /^2o?\s/.test(n) || n === '2' || n === '2o'
    || /(^|\s)segundo(\s|$)/.test(n)
    || ((/auxiliar|ayudante|assistant/.test(n)) && nombraEntrenador(n))) {
    return 'segundo_entrenador';
  }
  if (nombraEntrenador(n)) return 'entrenador';
  if (/preparador|prestatzaile/.test(n)) return 'preparador_fisico';
  if (/medic|metge/.test(n)) return 'medico';
  // «A.T.S.» llega normalizado como «a t s»: se compara también sin espacios para reconocer las siglas.
  if (/fisio|sanitari|enfermer/.test(n) || /^(ats|ftp)/.test(n.replace(/ /g, ''))) return 'fisioterapeuta';
  if (/material|encarregat|encargado/.test(n)) return 'material';
  if (/auxiliar|laguntzaile|(^|\s)(au|aus)(\s|$)/.test(n)) return 'auxiliar';
  return 'otro';
}

/** El nombre de la familia en palabras. */
export function etiquetaFamilia(familia: FamiliaRol): string {
  return ETIQUETA_FAMILIA[familia];
}

/** ¿El rol pertenece al cuerpo técnico que dirige al equipo (primer o segundo entrenador)? */
export function esRolDeEntrenador(rol: string): boolean {
  const familia = familiaDeRol(rol);
  return familia === 'entrenador' || familia === 'segundo_entrenador';
}

/** ¿El rol es delegado DEL EQUIPO? El de campo no cuenta: es otra figura. */
export function esRolDeDelegadoDeEquipo(rol: string): boolean {
  return familiaDeRol(rol) === 'delegado_equipo';
}

/**
 * ¿El rol de `core.match_official` es el árbitro principal?
 *
 * Hoy el canónico sólo guarda `principal`: los asistentes no se publican. La función no los inventa;
 * cuando lleguen, tendrán su propia familia y su pantalla.
 */
export function esRolDeArbitroPrincipal(rol: string): boolean {
  return normalizaRol(rol) === 'principal';
}

/* ── Resultados y cifras ────────────────────────────────────────────────────────────────────────── */

/** El signo del dominio (`G`/`E`/`P`) de un resultado del acta. Sin resultado no hay signo. */
export function signoDeResultado(resultado: string | null | undefined): 'G' | 'E' | 'P' | null {
  switch (resultado) {
    case 'ganado': return 'G';
    case 'empatado': return 'E';
    case 'perdido': return 'P';
    default: return null;
  }
}

/**
 * La racha de un equipo, del más antiguo al más reciente y como mucho `cuantos`: los partidos sin
 * resultado publicado no cuentan (ni como empate ni como derrota).
 */
export function rachaDeResultados(
  resultados: readonly string[],
  cuantos = 5,
): Array<'G' | 'E' | 'P'> {
  return resultados
    .map((resultado) => signoDeResultado(resultado))
    .filter((signo): signo is 'G' | 'E' | 'P' => signo !== null)
    .slice(-Math.max(1, cuantos));
}

/** Recuento de resultados jugados. Los partidos sin resultado no suman a ninguna columna. */
export function resumenDeResultados(resultados: readonly string[]): {
  jugados: number; victorias: number; empates: number; derrotas: number;
} {
  let victorias = 0;
  let empates = 0;
  let derrotas = 0;
  for (const resultado of resultados) {
    if (resultado === 'ganado') victorias += 1;
    else if (resultado === 'empatado') empates += 1;
    else if (resultado === 'perdido') derrotas += 1;
  }
  return { jugados: victorias + empates + derrotas, victorias, empates, derrotas };
}

/**
 * Una media por partido. `null` cuando no hay partidos o el total no se conoce: **nunca 0**, porque un
 * cero se lee como «no pasó nada» y aquí significa «no hay con qué dividir».
 */
export function mediaPorPartido(
  total: number | null | undefined,
  partidos: number | null | undefined,
): number | null {
  if (total === null || total === undefined) return null;
  if (partidos === null || partidos === undefined || partidos <= 0) return null;
  return total / partidos;
}

/** Una media en castellano con un decimal; sin dato, un guion. */
export function mediaTexto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valor);
}

/** Un identificador de la URL sólo vale si es un entero positivo; lo demás no es una ficha. */
export function idDeOficial(crudo: string | undefined): number | null {
  if (!/^\d{1,18}$/.test(crudo ?? '')) return null;
  const id = Number(crudo);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Asignaciones agrupadas por temporada, la más reciente primero. */
export function agrupaAsignacionesPorTemporada<T extends { temporada: string; temporada_orden: number }>(
  asignaciones: readonly T[],
): Array<{ temporada: string; asignaciones: T[] }> {
  const porTemporada = new Map<string, { orden: number; asignaciones: T[] }>();
  for (const asignacion of asignaciones) {
    const actual = porTemporada.get(asignacion.temporada) ?? { orden: asignacion.temporada_orden, asignaciones: [] };
    actual.asignaciones.push(asignacion);
    porTemporada.set(asignacion.temporada, actual);
  }
  return [...porTemporada.entries()]
    .sort((a, b) => b[1].orden - a[1].orden)
    .map(([temporada, datos]) => ({ temporada, asignaciones: datos.asignaciones }));
}
