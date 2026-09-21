/**
 * Decisión persistente sobre una fila de descanso: qué se persiste en `partidos` y qué se conserva como
 * incidencia.
 *
 * ## El problema que resuelve
 *
 * El extractor de `nova-widget` emite el bloque de descanso cuando la fila del HTML trae enlace de acta, y
 * lo declara `sospechosa`. Eso es prudente —no descarta lo que no ha leído— pero tiene una consecuencia
 * medida: la fila vuelve a entrar en `partidos` en cada repaso, así que retirarla del calendario **no se
 * sostiene**: reaparece. Y no se puede decidir en el extractor, porque al procesar la jornada **todavía no
 * tiene el contenido del acta**.
 *
 * ## La separación que exige el encargo
 *
 * Tres cosas distintas, que hasta ahora vivían mezcladas en `partidos`:
 *
 *   1. **partido deportivo**: dos equipos, va a `partidos` y se queda;
 *   2. **fila informativa de descanso**: la fuente dice quién descansa; NO es un partido y NO va a
 *      `partidos`, pero se conserva entera;
 *   3. **incidencia pendiente de comprobar**: hay indicio de descanso y hay acta, pero el acta todavía no
 *      permite veredicto; NO se decide y NO se pierde.
 *
 * La invariante que sostiene todo: **`partidos` no guarda nunca una fila cuyo lado sea EXACTAMENTE una
 * palabra de descanso**. El veredicto (informativa / desplazada / sin decidir) no cambia esa invariante:
 * cambia **dónde queda la evidencia** y qué se puede afirmar de ella.
 *
 * ## Por qué la decisión es persistente y va atada a la evidencia
 *
 * Para que el repaso siguiente no vuelva a insertar una fila ya confirmada, la decisión se guarda con la
 * clave completa de la fuente y con las huellas que la justificaron. Si el HTML o el acta cambian, la
 * decisión **caduca** y la fila vuelve a revisión: nunca se hereda un veredicto de una evidencia distinta.
 */
import { veredictoDelActaDeDescanso, type VeredictoActaDescanso } from '../parsers/filas-informativas.js';

/** Qué se afirma de la fila. `sin-decidir` es un estado legítimo, no un fallo: no saber no autoriza. */
export type VeredictoDescanso = 'informativa' | 'desplazada' | 'sin-decidir';

/** Por qué se llegó a ese veredicto. Vocabulario cerrado: se guarda y se audita. */
export const EVIDENCIAS = [
  'palabra-de-descanso-sin-acta',
  'el-acta-nombra-el-descanso',
  'el-acta-nombra-dos-equipos-reales',
  'el-acta-no-permite-veredicto',
] as const;
export type EvidenciaDescanso = (typeof EVIDENCIAS)[number];

/** La decisión tal y como se persiste: clave completa + huellas + veredicto + evidencia. */
export type DecisionDescanso = {
  /** `federacion|temporada|competicion|grupo|jornada|orden|acta` — la identidad completa de la fuente. */
  clave: string;
  federacion: string;
  temporada: string;
  competicion: string;
  grupo: string;
  jornada: number;
  orden: number;
  codigo_acta: string | null;
  literal_local: string;
  literal_visitante: string;
  archivo_html: string;
  veredicto: VeredictoDescanso;
  evidencia: EvidenciaDescanso;
  /** Huella del HTML que justificó la decisión. Si cambia, la decisión caduca. */
  huella_html: string;
  /** Huella del acta que justificó la decisión (o `null` si no había acta). */
  huella_acta: string | null;
  /** La pareja que publica el acta, cuando la hay: es lo que permite recuperar un partido desplazado. */
  pareja_del_acta: readonly [string, string] | null;
  comprobada_en: string;
};

export type IdentidadFila = {
  federacion: string;
  temporada: string;
  competicion: string;
  grupo: string;
  jornada: number;
  orden: number;
  codigo_acta: string | null;
};

/**
 * La clave de la decisión. Incluye la federación —el mismo grupo en dos federaciones no es el mismo
 * grupo— y el orden, porque la identidad de una fila de calendario es su posición en la jornada.
 */
export function claveDeDecision(id: IdentidadFila): string {
  return [
    id.federacion, id.temporada, id.competicion, id.grupo, String(id.jornada), String(id.orden),
    id.codigo_acta ?? '',
  ].join('|');
}

export type EntradaDecision = IdentidadFila & {
  literal_local: string;
  literal_visitante: string;
  archivo_html: string;
  huella_html: string;
  /** `null` cuando la fila NO trae enlace de acta en el HTML. */
  enlaceDeActa: boolean;
  /** La pareja que publica el acta, si ya está descargada y legible. */
  parejaDelActa: readonly [string | null | undefined, string | null | undefined] | null;
  /** Huella del acta descargada, si la hay. */
  huella_acta?: string | null;
  comprobada_en: string;
};

export type ResultadoDecision = {
  /** Si la fila debe persistirse en `partidos`. */
  persiste: boolean;
  /** La decisión a guardar. `null` sólo si la fila es un partido y no hay nada que decidir. */
  decision: DecisionDescanso | null;
  /** Explicación corta para el rastro de `eventos`. */
  motivo: string;
};

/**
 * La política. Es una función pura: no lee ni escribe nada, así que se puede probar entera.
 *
 * OJO con la regla que NO se relaja: una palabra de descanso en un lado **no basta para borrar nada**. Lo
 * que hace es impedir que la fila se persista como partido y obligar a que quede como incidencia con toda
 * su evidencia. El veredicto sólo se afirma cuando el acta se puede leer; si no, queda `sin-decidir`.
 */
export function decideFilaDeDescanso(entrada: EntradaDecision): ResultadoDecision {
  const verdictoDelActa: VeredictoActaDescanso | null = entrada.parejaDelActa
    ? veredictoDelActaDeDescanso(entrada.parejaDelActa)
    : null;

  const base = {
    clave: claveDeDecision(entrada),
    federacion: entrada.federacion,
    temporada: entrada.temporada,
    competicion: entrada.competicion,
    grupo: entrada.grupo,
    jornada: entrada.jornada,
    orden: entrada.orden,
    codigo_acta: entrada.codigo_acta,
    literal_local: entrada.literal_local,
    literal_visitante: entrada.literal_visitante,
    archivo_html: entrada.archivo_html,
    huella_html: entrada.huella_html,
    huella_acta: entrada.huella_acta ?? null,
    comprobada_en: entrada.comprobada_en,
  };

  if (!entrada.enlaceDeActa) {
    return {
      persiste: false,
      motivo: 'palabra de descanso exacta y sin enlace de acta: no es un partido',
      decision: {
        ...base, veredicto: 'informativa', evidencia: 'palabra-de-descanso-sin-acta', pareja_del_acta: null,
      },
    };
  }

  // Con enlace de acta pero sin su contenido todavía: no se deduce nada del enlace.
  if (verdictoDelActa === null || verdictoDelActa === 'no-demuestra') {
    return {
      persiste: false,
      motivo: 'palabra de descanso exacta con acta sin veredicto: incidencia pendiente, no se decide',
      decision: {
        ...base, veredicto: 'sin-decidir', evidencia: 'el-acta-no-permite-veredicto', pareja_del_acta: null,
      },
    };
  }

  if (verdictoDelActa === 'descanso') {
    return {
      persiste: false,
      motivo: 'palabra de descanso exacta y el acta nombra el descanso: fila informativa confirmada',
      decision: {
        ...base,
        veredicto: 'informativa',
        evidencia: 'el-acta-nombra-el-descanso',
        pareja_del_acta: [String(entrada.parejaDelActa![0] ?? ''), String(entrada.parejaDelActa![1] ?? '')],
      },
    };
  }

  // El acta nombra dos equipos reales: la fila NO es el bloque de descanso, es un partido mal puesto.
  // Tampoco se persiste en `partidos` —la pareja que hay ahí no es la del partido— pero la incidencia
  // conserva la pareja del acta para que el lote de recuperación pueda reconstruirlo.
  return {
    persiste: false,
    motivo: 'el acta nombra dos equipos reales: partido DESPLAZADO, incidencia para recuperar',
    decision: {
      ...base,
      veredicto: 'desplazada',
      evidencia: 'el-acta-nombra-dos-equipos-reales',
      pareja_del_acta: [String(entrada.parejaDelActa![0] ?? ''), String(entrada.parejaDelActa![1] ?? '')],
    },
  };
}

export type EstadoDeLaDecision = 'vigente' | 'caducada' | 'ausente';

/**
 * ¿Sigue valiendo esta decisión para la evidencia de ahora?
 *
 * `caducada` es la respuesta importante: significa que el HTML o el acta cambiaron desde que se decidió, y
 * que por tanto **la fila vuelve a revisión**. Sin esto, un veredicto se heredaría de una evidencia que ya
 * no existe, que es el mismo error que el contrato 4 corrigió en la reconstrucción.
 */
export function estadoDeLaDecision(
  decision: DecisionDescanso,
  actual: { huella_html: string; huella_acta: string | null; codigo_acta: string | null },
): EstadoDeLaDecision {
  if (!decision) return 'ausente';
  if (decision.codigo_acta !== actual.codigo_acta) return 'caducada';
  if (decision.huella_html !== actual.huella_html) return 'caducada';
  if ((decision.huella_acta ?? null) !== (actual.huella_acta ?? null)) return 'caducada';
  return 'vigente';
}

/**
 * Decide y además dice si hay que escribir: es la forma que usa quien repasa la jornada. Devuelve
 * `escribir: false` cuando la decisión guardada sigue vigente, para que la segunda pasada sea idempotente
 * y no ensucie el rastro con la misma incidencia repetida.
 */
export function evaluaYCompara(
  entrada: EntradaDecision,
  guardada: DecisionDescanso | undefined,
): { resultado: ResultadoDecision; escribir: boolean; estado: EstadoDeLaDecision } {
  const resultado = decideFilaDeDescanso(entrada);
  const estado = guardada
    ? estadoDeLaDecision(guardada, {
      huella_html: entrada.huella_html,
      huella_acta: entrada.huella_acta ?? null,
      codigo_acta: entrada.codigo_acta,
    })
    : 'ausente';
  return { resultado, escribir: estado !== 'vigente', estado };
}
