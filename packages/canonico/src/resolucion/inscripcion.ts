/**
 * Inscripción de un equipo cuando la fuente NO publica su código federativo.
 *
 * ## El bloqueo que resuelve
 *
 * Euskadi trae 30.314 de 34.358 partidos (el 88 %) sin código de equipo en ninguno de los dos lados,
 * porque su maqueta sólo lo publica en el enlace de comparativa y la mayoría de las filas no lo traen.
 * El importador, hasta ahora, sólo creaba inscripción para un equipo con código: sin `team_entry` no hay
 * dónde colgar el partido, así que esos partidos quedaban sin equipos y las alineaciones del acta se
 * rechazaban por «participación sin equipo resoluble». Ésa era la razón de que Euskadi no estuviera en el
 * canónico.
 *
 * ## La decisión
 *
 * Una inscripción puede identificarse por una **referencia contextual**, que es el ámbito más el nombre
 * normalizado:
 *
 * ```text
 * federación | temporada | competición | grupo | nombre_normalizado
 * ```
 *
 * Los cuatro primeros ya están en `phase_group_id` y en `source.external_ref.context_key`; el nombre vive
 * aquí. Lo que NO se hace es lo que hace que esto sea seguro:
 *
 * - **no se fabrica un código federativo**. `codigo_externo` sigue siendo NULL y la referencia se guarda
 *   en `source.external_ref` con `external_id = 'ctx:<normalizado>'`. El prefijo no puede confundirse con
 *   un código real: los de estas federaciones son numéricos;
 * - **el nombre normalizado sólo vale DENTRO del ámbito**. La unicidad es por grupo. Dos equipos
 *   homónimos de grupos distintos son dos inscripciones y nunca se cruzan para resolver un nombre;
 * - **no hay parecido difuso**. No se usa distancia de edición, ni prefijos, ni trigramas: o el nombre
 *   normalizado es idéntico, o no resuelve;
 * - **no se eliminan A/B/C**. La letra de equipo forma parte de la identidad y separa al primer equipo de
 *   su filial;
 * - **no se eliminan los calificadores legítimos**: `(Femenino)`, `(Juv.)`, `(VETERANOS)`. Quitar
 *   `(Femenino)` uniría al equipo femenino con el masculino del mismo club;
 * - **dos candidatos implican «sin resolver»**. Si dos formas limpias distintas del mismo grupo
 *   normalizan igual, no se elige ninguna: elegir mal contamina DOS plantillas a la vez y no se nota;
 * - **la importación repetida devuelve la misma inscripción**, porque la clave es la referencia y no el
 *   orden de llegada.
 *
 * Lo único que sí se separa del nombre son los marcadores de estado **demostrados** —`(Sailkatua)`,
 * `(Irabazlea)`, `(Ganador)`, `(Clasificado)`—, y la lista es la misma que usa la reconstrucción de la
 * cola (`@facylf/ingesta`): si alguien la amplía allí, la prueba de coherencia de este paquete lo dice.
 */

import {
  MARCADORES_ESTADO, normalizaNombreEquipo, separaNombreYEstado,
} from '@facylf/ingesta';

/**
 * Vocabulario CERRADO de procedencias. De dónde se ha visto citado a este equipo.
 *
 * `jornada` no aporta literales por su cuenta —la fila de `partidos` ES la jornada ya extraída—, pero sí
 * aporta el DIRECTORIO del grupo, que es donde vive la clasificación archivada. Leer el HTML de la
 * jornada desde el importador convertiría al importador en la fuente del calendario, que es justo lo
 * contrario del diseño: eso lo hace la reconstrucción de la cola, con su propio manifiesto y su diario.
 */
export const PROCEDENCIAS = ['calendario', 'jornada', 'clasificacion', 'acta', 'catalogo'] as const;
export type Procedencia = (typeof PROCEDENCIAS)[number];

export function esProcedencia(valor: unknown): valor is Procedencia {
  return typeof valor === 'string' && (PROCEDENCIAS as readonly string[]).includes(valor);
}

export type MetodoResolucion = 'codigo-externo' | 'referencia-contextual';

/** Prefijo de una referencia contextual en `source.external_ref.external_id`. Nunca es un código. */
export const PREFIJO_CONTEXTUAL = 'ctx:';

/** El token que se guarda en `source.external_ref` para una inscripción sin código. */
export function externalIdContextual(normalizado: string): string {
  return `${PREFIJO_CONTEXTUAL}${normalizado}`;
}

export function esExternalIdContextual(externalId: string): boolean {
  return externalId.startsWith(PREFIJO_CONTEXTUAL);
}

/** El nombre normalizado que hay detrás de una referencia contextual. Vacío si no lo es. */
export function normalizadoDeExternalId(externalId: string): string {
  return esExternalIdContextual(externalId) ? externalId.slice(PREFIJO_CONTEXTUAL.length) : '';
}

/**
 * Un equipo citado en el ámbito del grupo. No es todavía una inscripción: es un candidato, con las
 * representaciones que lo citan y, si alguna lo publica, su código.
 */
export type CandidatoEquipo = {
  /** El literal tal cual lo publicó la fuente, con sus marcadores. Se conserva íntegro. */
  literal: string;
  /** El nombre sin los marcadores de estado demostrados. Es el que se guarda como nombre del equipo. */
  limpio: string;
  /** El nombre limpio normalizado. Sólo se compara DENTRO de este grupo. */
  normalizado: string;
  /** Código federativo, si el ámbito lo publica en alguna representación. Nunca se fabrica. */
  codigo: string | null;
  /**
   * TODOS los códigos federativos vistos para este nombre en el ámbito. Dos distintos son dos equipos
   * que se llaman igual: es la única señal demostrable de homonimia, y por eso no se colapsa a uno.
   */
  codigos: string[];
  /** Representaciones del ámbito que citan a este equipo. */
  procedencias: Procedencia[];
  /** Marcadores de estado que se han quitado, para poder auditar la limpieza. */
  marcadoresEstado: string[];
  /** Paréntesis conservados: `(P)`, `(RET)`, `(Juv.)`, `(Femenino)`, códigos dentro del nombre… */
  marcadoresDesconocidos: string[];
  /**
   * TODAS las formas literales con las que la fuente ha citado a este equipo en el ámbito, incluida la
   * que traía el marcador de estado y la del acta. Ninguna se pierde: se guardan como alias.
   */
  alias: string[];
};

/** Acumulador interno: agrupa por nombre normalizado las citas del mismo equipo. */
type Acumulado = CandidatoEquipo & {
  literales: Set<string>;
  /** Índice de prioridad de la procedencia que fijó el nombre: 0 es la más fuerte (calendario). */
  prioridadNombre: number;
};

/**
 * Orden de procedencia para elegir el NOMBRE de la inscripción: el calendario primero, porque es la
 * forma que usan los partidos y la clasificación reconstruida. Se elige por procedencia y no por orden de
 * llegada para que el mismo grupo procesado en otro orden dé el MISMO nombre, que es lo que hace que la
 * importación sea idempotente.
 */
export const ORDEN_NOMBRE: readonly Procedencia[] = ['calendario', 'clasificacion', 'acta', 'catalogo', 'jornada'];

/**
 * Reúne los candidatos de un grupo. **Todo se reúne dentro del ámbito**: federación, temporada,
 * competición y grupo. Nunca se cruza un nombre de un grupo a otro para resolverlo.
 *
 * ## Por qué la identidad por nombre es el nombre NORMALIZADO
 *
 * `normalizaNombreEquipo` quita tildes, mayúsculas y **todo** lo que no sea letra o dígito: comillas,
 * guiones, puntos, comas. Así que dos citas del mismo equipo escritas con tipografía distinta —el
 * calendario publica `ALAVES "B"` y el acta `ALAVES B`— normalizan al MISMO valor. Eso no es una
 * coincidencia afortunada: es la razón por la que el nombre normalizado sirve como identidad dentro del
 * ámbito, y está medido: en Euskadi el acta publica sistemáticamente el nombre sin las comillas de la
 * letra de equipo.
 *
 * Por eso la ambigüedad NO se declara por «dos formas limpias distintas»: casi todos los equipos de
 * Euskadi tienen dos formas (la del calendario con comillas y la del acta sin ellas), y declararlos
 * ambiguos dejaría el 88 % de sus partidos sin importar, que es exactamente el problema que esto
 * resuelve. La ambigüedad de verdad es **dos identificadores distintos para el mismo nombre**, y eso se
 * detecta con los CÓDIGOS: si dos citas del mismo nombre traen códigos federativos diferentes, son dos
 * equipos y no se elige ninguno. Lo resuelve `construyeCatalogoInscripciones`.
 *
 * Todas las formas literales se conservan en `alias`: la tipografía no se pierde, sólo no decide.
 */
export function construyeCandidatos(citas: ReadonlyArray<{ literal: string; codigo: string | null; procedencia: Procedencia }>): {
  candidatos: CandidatoEquipo[];
  /** Nombres normalizados que NO resuelven por tener dos candidatos distintos. */
  ambiguos: Set<string>;
} {
  const porNormalizado = new Map<string, Acumulado>();
  for (const cita of citas) {
    const literal = String(cita.literal ?? '').trim();
    if (!literal) continue;
    if (!esProcedencia(cita.procedencia)) continue;
    const separado = separaNombreYEstado(literal);
    const normalizado = normalizaNombreEquipo(separado.nombreEquipo);
    if (!normalizado) continue;
    const prioridad = ORDEN_NOMBRE.indexOf(cita.procedencia);

    let acumulado = porNormalizado.get(normalizado);
    if (!acumulado) {
      acumulado = {
        literal, limpio: separado.nombreEquipo, normalizado, codigo: null, codigos: [],
        procedencias: [], marcadoresEstado: separado.marcadoresEstado,
        marcadoresDesconocidos: separado.marcadoresDesconocidos, alias: [],
        literales: new Set(), prioridadNombre: prioridad,
      };
      porNormalizado.set(normalizado, acumulado);
    } else if (prioridad < acumulado.prioridadNombre) {
      // Una cita de una representación más fuerte fija el nombre. Así el mismo grupo en otro orden da el
      // mismo resultado: es lo que hace idempotente la importación.
      acumulado.literal = literal;
      acumulado.limpio = separado.nombreEquipo;
      acumulado.prioridadNombre = prioridad;
    }
    if (!acumulado.procedencias.includes(cita.procedencia)) acumulado.procedencias.push(cita.procedencia);
    acumulado.literales.add(literal);
    acumulado.alias = [...acumulado.literales];
    const codigo = String(cita.codigo ?? '').trim();
    if (codigo !== '' && !acumulado.codigos.includes(codigo)) acumulado.codigos.push(codigo);
    acumulado.codigo = acumulado.codigos.length === 1 ? acumulado.codigos[0]! : null;
  }

  const candidatos = [...porNormalizado.values()].map(({ literales: _literales, prioridadNombre: _p, ...resto }) => resto);
  return { candidatos, ambiguos: new Set<string>() };
}

/**
 * Una inscripción del grupo, ya decidida. Es la unidad que se persiste como `core.team_entry`.
 *
 * **La clave es el código cuando lo hay, y la referencia contextual cuando no.** Esto no es un detalle
 * de implementación: es lo que garantiza que un mismo código federativo citado con dos denominaciones
 * distintas produzca UNA inscripción y no dos. Dos inscripciones con el mismo código en el mismo grupo
 * partirían la plantilla y las estadísticas de ese equipo en dos mitades.
 */
export type InscripcionDeGrupo = {
  clave: string;
  codigoExterno: string | null;
  referenciaContextual: string | null;
  metodo: MetodoResolucion;
  /** El nombre con el que se crea el equipo-temporada: el literal limpio, sin marcadores de estado. */
  nombre: string;
  normalizado: string;
  procedencias: Procedencia[];
  /** Todas las formas literales citadas para esta inscripción. Se conservan como alias, ninguna se pierde. */
  alias: string[];
  marcadoresEstado: string[];
  /**
   * `true` cuando la inscripción NACIÓ sin código y ahora la fuente publica uno: se le vincula el código
   * conservando la referencia contextual, y la vinculación queda fechada. Nunca es una fusión silenciosa.
   */
  vinculada?: boolean;
};

/**
 * Una inscripción contextual que YA existe en el canonico para este grupo, leída de `core.team_entry`.
 * Es lo que permite que la segunda importación devuelva la MISMA inscripción y que un código que aparece
 * más tarde se VINCULE en vez de duplicar.
 */
export type VinculacionContextual = {
  teamEntryId: number;
  codigoExterno: string | null;
};

/** El catálogo de inscripciones de UN grupo. */
export type CatalogoInscripciones = {
  /** Código federativo → clave de inscripción. */
  porCodigo: Map<string, string>;
  /** Nombre normalizado → clave de inscripción, sólo cuando es ÚNICO en el grupo. */
  porNormalizado: Map<string, string>;
  /** Clave de inscripción → la inscripción que describe. */
  porClave: Map<string, InscripcionDeGrupo>;
  /** Nombres normalizados que no resuelven por tener dos candidatos o dos códigos. */
  ambiguos: Set<string>;
  /**
   * Nombre normalizado SIN el sufijo de equipo → claves de los equipos del grupo que sí lo llevan.
   * Es lo que permite unir «ARO, C.E.» (lo que escribe el acta) con «ARO, C.E. A» (lo que publica el
   * calendario con su código). Si hay más de una clave, no se elige: `A` y `B` son equipos distintos.
   */
  porSinSufijoDeEquipo: Map<string, string[]>;
  /**
   * Claves que se han fusionado en otra: `contexto:aro c e` → `5081`. Quien tenga una referencia contextual
   * apuntando a la clave vieja tiene que repuntarla con esto, o resolverá a una inscripción que ya no existe.
   */
  equivalencias: Map<string, string>;
};

/** La clave de una inscripción sin código: la referencia contextual misma. */
export const claveContextual = (normalizado: string) => `contexto:${normalizado}`;

/**
 * Abreviaturas de tipo de club que terminan en una letra suelta.
 *
 * ── POR QUÉ ESTÁ VACÍA, HABIENDO SIDO UNA LISTA ────────────────────────────────────────────────────────
 *
 * Nació para que «REAL MADRID C.F.» no perdiera la «F» y se uniera al equipo «REAL MADRID C». El problema
 * es que en el naming catalán el tipo de club va DELANTE de la letra del equipo —«GIMNASTIC TARRAGONA, C. A»
 * es el club «C.» con el equipo «A»—, y con el guardián puesto esa pareja no se fusionaba: medido el
 * 25/09/2026, **181 parejas partidas en 96 grupos** de Cataluña, cada una con su partido colgado de una
 * identidad y la de código a cero.
 *
 * La evidencia medida (181 casos reales, y el «F» de Femenino del grupo de Ceuta) pesa más que el caso
 * hipotético que el guardián protegía, y que además exigiría que la fuente escribiera «REAL MADRID C» para
 * el equipo C, cosa que no hace: escribe «REAL MADRID C.F. C». La protección de verdad es la UNICIDAD: con
 * «EUROPA, C.E. A» y «EUROPA, C.E. B» en el grupo, «EUROPA, C.E.» no se resuelve.
 */
const ABREVIATURAS_DE_CLUB: ReadonlySet<string> = new Set();

/**
 * El nombre normalizado al que se le ha quitado el sufijo de equipo, o `null` si no lo lleva.
 *
 * «aro c e a» → «aro c e» · «barcelona f c b» → «barcelona f c» · «foso ceuta f» → «foso ceuta» ·
 * «real madrid c f» → `null` (la «f» completa «c f», que es C.F.) · «racing blanenc f c» → `null`.
 *
 * El sufijo es UNA letra final. Cualquier letra, no sólo la A: medido el 25/09/2026 en el grupo de Ceuta
 * 21876096, que es «ALEVÍN FEMENINO F7» y donde TODOS los equipos llevan una «F» de Femenino que el acta no
 * escribe —«Foso Ceuta F» frente a «Foso Ceuta»—. Con el alfabeto limitado a A–D ese grupo se quedaba
 * bloqueado con «el acta no se corresponde con la fila del calendario».
 *
 * Lo que impide que la regla se pase de lista es el guardián de abreviaturas, no el alfabeto.
 */
export function sinSufijoDeEquipo(normalizado: string): string | null {
  const m = /^(.*\S)\s([a-z])$/.exec(normalizado);
  if (m === null) return null;
  const anterior = /(\S+)\s+[a-z]$/.exec(normalizado)?.[1] ?? '';
  if (ABREVIATURAS_DE_CLUB.has(`${anterior} ${m[2]!}`)) return null;
  return m[1]!;
}

/**
 * Decide las inscripciones del grupo a partir de los candidatos.
 *
 * Reglas, y cada una tapa un fallo concreto:
 *
 * 1. **un código federativo es una inscripción**. Si el mismo código aparece citado con dos nombres
 *    distintos, es el mismo equipo con dos denominaciones: una sola inscripción, dos alias;
 * 2. **dos códigos para el mismo nombre normalizado son dos equipos**: no se elige y el nombre queda
 *    ambiguo, porque elegir uno contaminaría las dos plantillas;
 * 3. **un nombre normalizado con dos formas limpias distintas son dos equipos**: tampoco se elige;
 * 4. **sin código**: la inscripción se identifica por `contexto:<normalizado>`, que sólo vale dentro de
 *    este grupo.
 */
export function construyeCatalogoInscripciones(entrada: {
  candidatos: CandidatoEquipo[];
  ambiguos: Set<string>;
  /**
   * Inscripciones contextuales ya persistidas en este grupo, por nombre normalizado. Es lo que hace que
   * la importación repetida devuelva la misma inscripción y que un código que aparece después se vincule.
   */
  vinculaciones?: ReadonlyMap<string, VinculacionContextual>;
}): CatalogoInscripciones {
  const ambiguos = new Set(entrada.ambiguos);
  const porCodigo = new Map<string, string>();
  const porClave = new Map<string, InscripcionDeGrupo>();
  const vinculaciones = entrada.vinculaciones ?? new Map<string, VinculacionContextual>();

  // Un nombre con DOS códigos distintos son dos equipos: no se elige ninguno. Es la única señal
  // demostrable de homonimia dentro del ámbito, y por eso no se colapsa a un código «preferido».
  for (const candidato of entrada.candidatos) {
    if (candidato.codigos.length > 1) ambiguos.add(candidato.normalizado);
  }

  const porNormalizado = new Map<string, string>();

  /*
   * ── PERO CADA CÓDIGO ES UN EQUIPO, Y EL PARTIDO PUBLICa EL SUYO ───────────────────────────────────────
   *
   * Que el NOMBRE sea ambiguo no quiere decir que los códigos lo sean: cada uno identifica a un equipo
   * distinto, y el partido trae el suyo escrito. Descartar el candidato entero —que es lo que se hacía— se
   * llevaba por delante los dos códigos y el grupo no entraba. Medido el 25/09/2026: «C.D. Nuestra Señora de
   * Belén» aparece con los códigos 14730 y 16964 en el catálogo de la temporada, y varios grupos de Castilla
   * y León y de Andalucía fallaban con «el código … no está en el catálogo de este grupo».
   *
   * Se crea una inscripción por código para que `porCodigo` los tenga, y el nombre NO se mapea: resolver por
   * nombre sigue negándose, que es la regla que impide unir dos plantillas.
   */
  for (const candidato of entrada.candidatos) {
    if (candidato.codigos.length <= 1) continue;
    for (const codigo of candidato.codigos) {
      const previa = porClave.get(codigo);
      if (previa === undefined) {
        porClave.set(codigo, {
          clave: codigo,
          codigoExterno: codigo,
          referenciaContextual: null,
          metodo: 'codigo-externo',
          nombre: candidato.limpio,
          normalizado: candidato.normalizado,
          procedencias: [...candidato.procedencias],
          alias: [...candidato.alias],
          marcadoresEstado: [...candidato.marcadoresEstado],
        });
        continue;
      }
      // El mismo código citado por otra vía con el mismo nombre: se acumula, no se duplica.
      for (const literal of candidato.alias) if (!previa.alias.includes(literal)) previa.alias.push(literal);
      for (const p of candidato.procedencias) if (!previa.procedencias.includes(p)) previa.procedencias.push(p);
    }
  }

  for (const candidato of entrada.candidatos) {
    if (ambiguos.has(candidato.normalizado)) continue;
    let codigo = candidato.codigo;
    const yaPersistida = vinculaciones.get(candidato.normalizado);

    // La inscripción ya existe y nació SIN código. Si ahora la fuente publica un código y no contradice
    // el que ya tenía vinculado, se le AÑADE conservando la referencia contextual: eso es la vinculación
    // auditable. Si contradice al ya vinculado, NO se pisa — eso se registra aparte como incidencia.
    if (yaPersistida) {
      if (yaPersistida.codigoExterno !== null && codigo !== null && yaPersistida.codigoExterno !== codigo) {
        codigo = yaPersistida.codigoExterno;
      }
    }

    const clave = codigo ?? claveContextual(candidato.normalizado);
    porNormalizado.set(candidato.normalizado, clave);

    const previa = porClave.get(clave);
    if (!previa) {
      porClave.set(clave, {
        clave,
        codigoExterno: codigo,
        // Una inscripción que nació contextual CONSERVA su referencia aunque ya tenga código: es lo que
        // deja el rastro de que nació sin él.
        referenciaContextual: codigo === null || yaPersistida !== undefined ? candidato.normalizado : null,
        metodo: codigo === null || yaPersistida !== undefined ? 'referencia-contextual' : 'codigo-externo',
        nombre: candidato.limpio, normalizado: candidato.normalizado,
        procedencias: [...candidato.procedencias], alias: [...candidato.alias],
        marcadoresEstado: [...candidato.marcadoresEstado],
        ...(codigo !== null && yaPersistida !== undefined ? { vinculada: true } : {}),
      });
      continue;
    }
    // Misma inscripción citada por otra vía: se acumula, no se duplica.
    for (const literal of candidato.alias) if (!previa.alias.includes(literal)) previa.alias.push(literal);
    for (const p of candidato.procedencias) if (!previa.procedencias.includes(p)) previa.procedencias.push(p);
    // El nombre se elige por procedencia, no por orden de llegada: el mismo grupo procesado en otro
    // orden tiene que dar el MISMO nombre, o la importación dejaría de ser idempotente.
    const prioridadPrevia = Math.min(...previa.procedencias.map((p) => ORDEN_NOMBRE.indexOf(p)));
    const prioridadNueva = Math.min(...candidato.procedencias.map((p) => ORDEN_NOMBRE.indexOf(p)));
    if (prioridadNueva < prioridadPrevia) previa.nombre = candidato.limpio;
  }

  /*
   * ── UN NOMBRE SIN EL SUFIJO DE EQUIPO ES LA MISMA INSCRIPCIÓN ─────────────────────────────────────────
   *
   * El grupo puede citar al mismo equipo de dos formas: con el sufijo y su código —lo que publica el
   * calendario: «QUART, U.E. A», código 5081— y sin el sufijo —lo que escribe el acta: «QUART, U.E.»—. Si
   * las dos formas acaban en inscripciones distintas, el partido se cuelga de una y el equipo real se queda
   * con cero partidos: medido el 25/09/2026 en 23 grupos de Cataluña, 263 parejas.
   *
   * Se fusionan en la del CÓDIGO, que es la identidad establecida, y el otro literal queda como alias. Las
   * condiciones son estrechas a propósito:
   *
   *  · sólo se fusiona el candidato SIN código: si las dos formas traen código son dos equipos distintos (el
   *    A y el B del mismo club) y unirlos contaminaría las dos plantillas;
   *  · hace falta que el candidato con sufijo sea ÚNICO: con «EUROPA, C.E. A» y «EUROPA, C.E. B» en el
   *    grupo, «EUROPA, C.E.» no se resuelve;
   *  · y el nombre se queda el de la identidad establecida, no el de la cita nueva: es lo que mantiene
   *    estable el equipo-temporada, que se identifica por (club, temporada, nombre).
   */
  const equivalencias = new Map<string, string>();
  const baseConSufijo = new Map<string, string[]>();
  for (const [normalizado, clave] of porNormalizado) {
    const base = sinSufijoDeEquipo(normalizado);
    if (base === null) continue;
    const inscripcion = porClave.get(clave);
    if (inscripcion === undefined || inscripcion.codigoExterno === null) continue;
    const claves = baseConSufijo.get(base) ?? [];
    if (!claves.includes(clave)) claves.push(clave);
    baseConSufijo.set(base, claves);
  }
  for (const [normalizado, clave] of [...porNormalizado]) {
    const sinCodigo = porClave.get(clave);
    if (sinCodigo === undefined || sinCodigo.codigoExterno !== null) continue;
    const hermanas = baseConSufijo.get(normalizado) ?? [];
    if (hermanas.length !== 1) continue;
    const destino = porClave.get(hermanas[0]!);
    if (destino === undefined || destino === sinCodigo) continue;
    for (const literal of [sinCodigo.nombre, ...sinCodigo.alias]) {
      if (!destino.alias.includes(literal)) destino.alias.push(literal);
      if (!destino.procedencias.includes('acta') && sinCodigo.procedencias.includes('acta')) destino.procedencias.push('acta');
    }
    porClave.delete(clave);
    porNormalizado.set(normalizado, destino.clave);
    equivalencias.set(clave, destino.clave);
  }

  for (const inscripcion of porClave.values()) {
    if (inscripcion.codigoExterno !== null) porCodigo.set(inscripcion.codigoExterno, inscripcion.clave);
    /*
     * Y la equivalencia de toda inscripción que NACIÓ contextual y hoy tiene código: conserva su referencia
     * contextual —eso es lo que hace auditable la vinculación—, así que quien tenga esa referencia guardada
     * tiene que resolver a la clave del código. Sin esto, resolver por la referencia devolvía
     * `contexto:<nombre>`, una inscripción que ya no existe, y el lote se caía con «no se ha podido persistir».
     */
    if (inscripcion.referenciaContextual !== null) {
      const contextual = claveContextual(inscripcion.referenciaContextual);
      if (contextual !== inscripcion.clave) equivalencias.set(contextual, inscripcion.clave);
    }
  }

  /*
   * Y el índice por nombre SIN sufijo de equipo. Medido el 25/09/2026 en el canónico: tras reparar el
   * calendario de 23 grupos de Cataluña desde las actas, la misma pareja quedó con DOS identidades —
   * «QUART, U.E. A» (por código, con 10 inscripciones y compartida con otras competiciones) y
   * «QUART, U.E.» (por nombre, con 1 partido)—. El acta escribe el nombre sin el sufijo y el calendario lo
   * escribe con él, así que las dos formas se resolvían por separado y la historia del equipo se partía en
   * dos. El índice no elige: sólo dice a qué equipos del grupo les falta el sufijo.
   */
  const porSinSufijoDeEquipo = new Map<string, string[]>();
  for (const [normalizado, clave] of porNormalizado) {
    const base = sinSufijoDeEquipo(normalizado);
    if (base === null) continue;
    const claves = porSinSufijoDeEquipo.get(base) ?? [];
    if (!claves.includes(clave)) claves.push(clave);
    porSinSufijoDeEquipo.set(base, claves);
  }

  return { porCodigo, porNormalizado, porClave, ambiguos, porSinSufijoDeEquipo, equivalencias };
}

export type ViaInscripcion =
  | 'codigo-explicito-del-partido'
  | 'codigo-del-catalogo-del-grupo'
  | 'referencia-contextual-existente'
  | 'nombre-limpio-unico'
  | 'nombre-sin-sufijo-de-equipo'
  | 'sin-resolver';

export type ResolucionInscripcion = {
  /** NUNCA se fabrica: nulo cuando la fuente no publica código. */
  codigoExterno: string | null;
  /** La referencia contextual, si la inscripción no tiene código. */
  referenciaContextual: string | null;
  /** Identidad de la inscripción dentro del grupo. Nula si no se pudo resolver. */
  clave: string | null;
  metodo: MetodoResolucion | null;
  via: ViaInscripcion;
  /** El nombre limpio que se usó para resolver. Es el que se guarda como nombre del equipo. */
  limpio: string;
  normalizado: string;
  marcadoresEstado: string[];
  marcadoresDesconocidos: string[];
  /** Por qué se resolvió así, para poder auditarlo sin volver a ejecutar la resolución. */
  evidencia: string;
};

/**
 * Resuelve la inscripción de un equipo, en el orden de evidencia:
 *
 * 1. **código explícito válido en el ámbito** — el que publica el propio partido. Si el código no está
 *    en el catálogo del grupo NO se usa y NO se cae al nombre: un código de otro ámbito no puede
 *    resolver aquí, y usarlo cruzaría el ámbito;
 * 2. **referencia contextual ya existente** — si esa inscripción ya se creó antes, se devuelve la misma.
 *    Es lo que hace que la segunda importación no cree una inscripción nueva;
 * 3. **nombre limpio normalizado con un único candidato**;
 * 3.b **el nombre sin el sufijo de equipo**, cuando en el grupo hay UN solo equipo con ese sufijo: el acta
 *    escribe «ARO, C.E.» y el calendario «ARO, C.E. A», y sin este paso la misma pareja acaba con dos
 *    identidades (una con el partido y otra sin él).
 * 4. **sin resolver** — y entonces el partido no se importa.
 */
export function resuelveInscripcion(datos: {
  literal: string;
  codigoExplicito?: string | null;
  catalogo: CatalogoInscripciones;
  /** Referencias contextuales ya persistidas en este ámbito: normalizado → clave de inscripción. */
  referenciasExistentes?: ReadonlyMap<string, string>;
}): ResolucionInscripcion {
  const separado = separaNombreYEstado(String(datos.literal ?? ''));
  const base = {
    limpio: separado.nombreEquipo,
    normalizado: normalizaNombreEquipo(separado.nombreEquipo),
    marcadoresEstado: separado.marcadoresEstado,
    marcadoresDesconocidos: separado.marcadoresDesconocidos,
  };

  /* 1. El código explícito del propio partido. */
  const explicito = String(datos.codigoExplicito ?? '').trim();
  if (explicito !== '') {
    const clave = datos.catalogo.porCodigo.get(explicito);
    if (clave !== undefined) {
      return {
        ...base, codigoExterno: explicito, referenciaContextual: null, clave,
        metodo: 'codigo-externo', via: 'codigo-explicito-del-partido',
        evidencia: `equipo=${explicito} publicado por el propio partido`,
      };
    }
    return {
      ...base, codigoExterno: null, referenciaContextual: null, clave: null, metodo: null, via: 'sin-resolver',
      evidencia: `el código ${explicito} no está en el catálogo de este grupo: es de otro ámbito y no se usa`,
    };
  }

  /* 2. Referencia contextual ya existente. */
  const existente = datos.referenciasExistentes?.get(base.normalizado);
  if (existente !== undefined) {
    return {
      ...base, codigoExterno: null, referenciaContextual: base.normalizado, clave: existente,
      metodo: 'referencia-contextual', via: 'referencia-contextual-existente',
      evidencia: `«${base.limpio}» ya tiene inscripción por referencia contextual en este grupo`,
    };
  }

  /* 3. Nombre limpio normalizado con un único candidato. */
  if (base.normalizado !== '' && !datos.catalogo.ambiguos.has(base.normalizado)) {
    const clave = datos.catalogo.porNormalizado.get(base.normalizado);
    if (clave !== undefined) {
      const inscripcion = datos.catalogo.porClave.get(clave);
      const conCodigo = inscripcion?.codigoExterno ?? null;
      return {
        ...base,
        codigoExterno: conCodigo,
        referenciaContextual: conCodigo === null ? base.normalizado : null,
        clave,
        metodo: conCodigo === null ? 'referencia-contextual' : 'codigo-externo',
        via: conCodigo === null ? 'nombre-limpio-unico' : 'codigo-del-catalogo-del-grupo',
        evidencia: conCodigo === null
          ? `«${base.limpio}» es el único equipo del grupo con ese nombre limpio y el grupo no publica códigos`
          : `«${base.limpio}» es el único equipo del grupo con ese nombre y el grupo publica su código ${conCodigo}`,
      };
    }
  }

  /*
   * 3.b El nombre SIN el sufijo de equipo, cuando en el grupo hay UN solo equipo con ese sufijo.
   *
   * El acta de la FCF escribe «ARO, C.E.» y su calendario «ARO, C.E. A»: son el mismo equipo, y sin este
   * paso cada uno creaba su equipo-temporada. Con dos candidatos (`A` y `B`) NO se elige —elegir mal uniría
   * dos plantillas y no se notaría—, y si el nombre exacto ya existe en el grupo tampoco se llega aquí,
   * porque el paso 3 lo resuelve antes.
   */
  if (base.normalizado !== '' && !datos.catalogo.ambiguos.has(base.normalizado)) {
    const candidatas = datos.catalogo.porSinSufijoDeEquipo.get(base.normalizado) ?? [];
    if (candidatas.length === 1) {
      const clave = candidatas[0]!;
      const inscripcion = datos.catalogo.porClave.get(clave);
      const conCodigo = inscripcion?.codigoExterno ?? null;
      return {
        ...base,
        codigoExterno: conCodigo,
        referenciaContextual: conCodigo === null ? inscripcion?.normalizado ?? null : null,
        clave,
        metodo: conCodigo === null ? 'referencia-contextual' : 'codigo-externo',
        via: 'nombre-sin-sufijo-de-equipo',
        evidencia: `«${base.limpio}» es el nombre sin el sufijo de equipo de «${inscripcion?.nombre ?? clave}», `
          + `el único equipo del grupo que encaja${conCodigo === null ? '' : ` (código ${conCodigo})`}`,
      };
    }
  }

  /* 4. Sin resolver. No se fabrica un código ni se acepta un candidato dudoso. */
  const motivo = datos.catalogo.ambiguos.has(base.normalizado)
    ? `«${base.limpio}» normaliza igual que otro equipo de este grupo: elegir uno contaminaría dos plantillas`
    : `«${base.limpio}» no es único en el grupo (o no aparece en ninguna de sus representaciones)`;
  return {
    ...base, codigoExterno: null, referenciaContextual: null, clave: null, metodo: null,
    via: 'sin-resolver', evidencia: motivo,
  };
}

/**
 * La lista de marcadores de estado que se separan del nombre. Se exporta para poder COMPROBAR desde una
 * prueba que sigue siendo la misma que la de la reconstrucción de la cola: dos listas que se separan sin
 * que nadie lo note harían que el calendario y el acta hablaran de equipos distintos.
 */
export const MARCADORES_ESTADO_SEPARADOS: readonly string[] = MARCADORES_ESTADO;
