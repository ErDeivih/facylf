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
};

/** La clave de una inscripción sin código: la referencia contextual misma. */
export const claveContextual = (normalizado: string) => `contexto:${normalizado}`;

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
  for (const inscripcion of porClave.values()) {
    if (inscripcion.codigoExterno !== null) porCodigo.set(inscripcion.codigoExterno, inscripcion.clave);
  }

  return { porCodigo, porNormalizado, porClave, ambiguos };
}

export type ViaInscripcion =
  | 'codigo-explicito-del-partido'
  | 'codigo-del-catalogo-del-grupo'
  | 'referencia-contextual-existente'
  | 'nombre-limpio-unico'
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
