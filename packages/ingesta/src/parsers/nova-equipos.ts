/**
 * Separación entre el NOMBRE de un equipo y los MARCADORES DE ESTADO que la fuente pega al nombre.
 *
 * ## De dónde sale esto
 *
 * La maqueta «nova» de Euskadi (y también la de Cantabria en algún caso) publica el estado deportivo
 * del equipo dentro del propio nombre: `(Sailkatua)` = «clasificado», `(Irabazlea)` = «ganador»,
 * `(Ganador)`, `(Clasificado)` y `(P)`, que es «**Ganador del partido en Penaltis**». El acta, en cambio,
 * publica el nombre limpio. Medido el 15/09/2026 sobre la cola de Euskadi, de los 199 partidos en los que
 * el calendario y el acta no compartían ningún equipo, **170 quedan idénticos** en cuanto se quitan los
 * marcadores, y **16 de ellos sólo si se quita también `(P)`**.
 *
 * ## `(P)` ya no es una incógnita: lo dice la propia fuente
 *
 * Durante un tiempo `(P)` se dejó fuera de la lista porque no se sabía qué era, y el encargo pedía
 * explícitamente no resolverlo por intuición. Ya no hace falta intuir nada: la maqueta nova envuelve cada
 * marcador de estado en un `<span>` con su estilo, y el de `(P)` lleva además un `title` que lo define.
 *
 * ```html
 * <h4> ARRUPE CHAMINADE C.D.
 *   <span title="Ganador del partido en Penaltis" style="font-size:12px;font-weight:bolder;color:green;"> (P) </span>
 *   <span style="font-size:9px;font-weight:bolder;color:green;"> (Sailkatua) </span>
 * </h4>
 * ```
 *
 * Medido con `scripts/_diag-glosario-marcadores.mjs` sobre 110 jornadas archivadas (548 celdas de nombre):
 * **35 de 35 apariciones de `(P)` llevan ese mismo `title`**, sin una sola excepción. Y
 * `scripts/_diag-parentesis-por-federacion.mjs` comprueba que `(P)` **sólo aparece en Euskadi** (35 filas, 0
 * en las otras diecisiete colas), así que el cambio está acotado a la federación donde se midió.
 *
 * Dos cautelas que se comprobaron y NO salieron a favor, y por eso se dicen:
 *
 * - la concordancia con el marcador es **débil**: de las 35 filas con `(P)` sólo 10 tienen marcador
 *   publicado y 6 son empates (60 % frente al 41 % del resto de la cola). La justificación no es ésa: es el
 *   `title`, que es la fuente diciendo qué significa;
 * - **la cola no guarda el desempate en ninguna columna**, y la acta tampoco lo trae: 0 de las 29 actas con
 *   `(P)` mencionan penaltis en ninguna clave ni valor. Quitar `(P)` limpia el nombre, pero el hecho
 *   deportivo de que la eliminatoria se decidió en penaltis sólo queda en el HTML archivado —que es la
 *   evidencia y no se toca—, en `core.team_alias.literal`, que conserva el literal original, y en los
 *   `marcadores` que el manifiesto de la reconstrucción guarda por cada corrección. Llevarlo al canónico
 *   como estado del partido exigiría una columna en la cola: queda como tarea pendiente declarada.
 *
 * ## Por qué una lista cerrada y no «quitar los paréntesis»
 *
 * Quitar cualquier contenido entre paréntesis sería un error caro. Medido sobre los 26.966 nombres
 * distintos de las 18 colas, sólo 219 (el 0,81 %) llevan paréntesis, y entre ellos hay cosas que
 * **identifican** al equipo y no son estados:
 *
 * | token | veces | qué es | ¿se quita? |
 * |---|---|---|---|
 * | `(Sailkatua)` | 130 | clasificado (estado) | **sí** |
 * | `(Irabazlea)` | 11 | ganador (estado) | **sí** |
 * | `(Ganador)` | 14 | ganador (estado) | **sí** |
 * | `(Clasificado)` | 9 | clasificado (estado) | **sí** |
 * | `(P)` | 35 | ganador en penaltis (estado), **según el `title` de la fuente** | **sí** |
 * | `(Juv.)` | 8 | juvenil: **categoría**, y va como texto suelto | no |
 * | `(Femenino)` / `(FEMENINO)` | 21 | **género** | no |
 * | `(VETERANOS)` | 4 | **categoría** | no |
 * | `(RET)` | 6 | **desconocido**, y va como texto suelto | no: se registra |
 * | `(603621)`, `(301780)`… | ~25 | código publicado dentro del nombre | no |
 * | `(DC 3)`, `(ADYO)`, `(SODA)`, `(CORDOBA)`… | varios | parte del nombre o de la razón social | no |
 *
 * Hay una razón POSITIVA, además de la prudencia, para no quitar `(RET)`, `(Juv.)`, `(3)` ni `(1)`: la
 * fuente los publica como **texto suelto dentro del `<h4>`, sin `<span>` y sin estilo**, es decir que no
 * los marca como estados. `(Femenino)` y `(VETERANOS)` sí van en `<span>`, pero identifican al equipo.
 *
 * Quitar `(Femenino)` uniría al equipo femenino con el masculino del mismo club: exactamente la fusión
 * falsa que el proyecto prohíbe. Y `(Juv.)` no aporta nada al problema: añadirlo a la lista cierra
 * **cero** casos más (163 con y sin él, medido), así que no se añade.
 *
 * ## Reglas
 *
 * 1. sólo se quitan los tokens de la lista cerrada `MARCADORES_ESTADO`;
 * 2. sólo en la posición documentada: **al principio o al final** del nombre, nunca en medio;
 * 3. el texto restante se conserva íntegro (no se reordena, ni se acortan palabras, ni se quitan
 *    comillas, puntos o guiones);
 * 4. cualquier otro paréntesis se conserva y su contenido se devuelve en `marcadoresDesconocidos`,
 *    para poder medirlo y ampliar la lista con conocimiento;
 * 5. el nombre limpio sirve para **resolver la inscripción**; el literal original no se pierde nunca:
 *    es el que se guarda como procedencia.
 */

/** Estados deportivos medidos. En minúsculas y con paréntesis, tal y como se comparan. */
export const MARCADORES_ESTADO: readonly string[] = ['(sailkatua)', '(irabazlea)', '(ganador)', '(clasificado)', '(p)'];

export type NombreSeparado = {
  /** El nombre sin los marcadores de estado, con el resto del texto intacto. */
  nombreEquipo: string;
  /** Marcadores de estado que se han QUITADO, en el orden en que aparecían. */
  marcadoresEstado: string[];
  /**
   * Marcadores de estado que están en el nombre pero **fuera de la posición documentada** (en medio):
   * se conservan y se declaran. Quitarlos cambiaría el nombre en un punto donde el paréntesis puede
   * ser parte de la razón social.
   */
  marcadoresFueraDePosicion: string[];
  /** Paréntesis que NO están en la lista de estados: se conservan y se registran. */
  marcadoresDesconocidos: string[];
  /** El literal recibido, sin tocar. Es lo que se guarda como procedencia. */
  literalOriginal: string;
};

const RE_PARENTESIS = /\(([^()]{1,20})\)/g;

/** ¿Está este token en la lista cerrada de estados? Comparación sin distinguir mayúsculas. */
export function esMarcadorEstado(token: string): boolean {
  return MARCADORES_ESTADO.includes(token.toLowerCase());
}

export function separaNombreYEstado(literal: string): NombreSeparado {
  const original = String(literal ?? '');
  const detectados: string[] = [];
  const marcadoresDesconocidos: string[] = [];
  for (const m of original.matchAll(RE_PARENTESIS)) {
    if (esMarcadorEstado(m[0])) detectados.push(m[0]);
    else marcadoresDesconocidos.push(m[0]);
  }
  if (detectados.length === 0) {
    return {
      nombreEquipo: original.trim().replace(/\s+/g, ' '),
      marcadoresEstado: [], marcadoresFueraDePosicion: [], marcadoresDesconocidos, literalOriginal: original,
    };
  }

  // Sólo en los extremos, y **en bucle**: `CALASANZ A.D. (Juv.) "A"` no lleva el marcador al final —va
  // antes de la letra de equipo, que forma parte del nombre— así que no se toca, y quitar un paréntesis de
  // en medio cambiaría la razón social. El bucle es lo que resuelve las formas encadenadas, que en Euskadi
  // son la mayoría: `ARRUPE CHAMINADE C.D. (P) (Sailkatua)` necesita dos pasadas —la segunda descubre `(P)`
  // al quedar al final— y `(P) (Sailkatua) BERGARA K.E., CLUB` también, quitando primero el que está al
  // principio y después el que queda al descubierto.
  let trabajo = original.trim();
  const quitados: string[] = [];
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const token of detectados) {
      if (quitados.includes(token)) continue;
      const escapado = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const alPrincipio = new RegExp(`^\\s*${escapado}\\s*`, 'i');
      const alFinal = new RegExp(`\\s*${escapado}\\s*$`, 'i');
      if (alPrincipio.test(trabajo)) { trabajo = trabajo.replace(alPrincipio, ' '); quitados.push(token); cambiado = true; }
      else if (alFinal.test(trabajo)) { trabajo = trabajo.replace(alFinal, ' '); quitados.push(token); cambiado = true; }
    }
  }
  const nombreEquipo = trabajo.replace(/\s+/g, ' ').trim();
  // Si al quitar los marcadores no queda nombre, no se quita nada: un nombre vacío no resuelve nada y
  // rompería la clave del equipo.
  if (nombreEquipo === '') {
    return {
      nombreEquipo: original.trim(), marcadoresEstado: [], marcadoresFueraDePosicion: detectados,
      marcadoresDesconocidos, literalOriginal: original,
    };
  }
  return {
    nombreEquipo, marcadoresEstado: quitados,
    marcadoresFueraDePosicion: detectados.filter((t) => !quitados.includes(t)),
    marcadoresDesconocidos, literalOriginal: original,
  };
}

/* ------------------------------------------------------------------ */
/* Fase 3 · Recuperar la inscripción de un equipo a partir de evidencia */
/* ------------------------------------------------------------------ */

/**
 * Lo que la fuente publica de un equipo en un partido de la maqueta «nova».
 *
 * Medido el 15/09/2026 sobre las jornadas archivadas de Euskadi: el ÚNICO identificador de equipo que
 * aparece en la fila de un partido es el enlace de comparativa
 * (`NFG_LstComparativaEquipos?...&equipo1=9439&equipo2=22880135`). Cuando ese enlace no está —y falta
 * en 28.833 de los 32.877 partidos de Euskadi, el 88 %— **la fila no trae ningún código**: se
 * comprobó que no hay `Codigo_Equipo=`, ni `codequipo`, ni `codEquipo`, ni `NFG_VisEquipos` en toda la
 * página. Las rutas de los escudos (`escudosFVF/1002_grande.png`) llevan números, pero son
 * identificadores de CLUB con tres formatos distintos y sin relación demostrada con el equipo: no se
 * usan.
 */
export type EquipoNovaPublicado = {
  /** Literal del nombre, tal cual lo publica la página. */
  literal: string;
  /** Código explícito del propio partido, si el enlace de comparativa existe. */
  codigoExplicito: string | null;
};

/**
 * Catálogo de UN grupo de UNA temporada. Se construye para ese ámbito y no se mezcla con otro: la
 * resolución nunca puede cruzar federación, temporada ni grupo.
 */
export type CatalogoNova = {
  /** Código explícito → inscripción, sólo del ámbito de este catálogo. */
  inscripcionPorCodigo: Map<string, string>;
  /**
   * Nombre limpio normalizado → inscripción, **sólo cuando es única** dentro del ámbito. Si dos
   * equipos del mismo grupo normalizan al mismo nombre, ese nombre NO entra: quedarse con uno sería
   * inventar y una fusión falsa contamina las dos plantillas.
   */
  inscripcionPorNombreLimpio: Map<string, string>;
};

export type ViaResolucionNova =
  | 'codigo-explícito-del-partido'
  | 'codigo-del-catálogo-del-grupo'
  | 'nombre-limpio-único'
  | 'sin-resolver';

export type ResolucionEquipoNova = {
  /** Nunca se fabrica: nulo cuando la fuente no publica código. */
  codigoExterno: string | null;
  /** Inscripción resuelta. Cuando no hay código, se enlaza por referencia contextual, no por código. */
  inscripcion: string | null;
  via: ViaResolucionNova;
  /** El nombre limpio que se ha usado para resolver. */
  nombreEquipo: string;
  marcadoresEstado: string[];
  marcadoresFueraDePosicion: string[];
  marcadoresDesconocidos: string[];
  /** Por qué se resolvió así, para poder auditarlo. */
  evidencia: string;
};

/** Normaliza igual que `core.normaliza_nombre`: sin tildes, sin signos, minúsculas, espacios simples. */
export function normalizaNombreEquipo(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Resuelve la inscripción de un equipo publicado por la maqueta «nova», en el orden de evidencia del
 * encargo. Devuelve `sin-resolver` —y no un parecido— cuando no hay evidencia suficiente.
 */
export function resuelveEquipoNova(
  publicado: EquipoNovaPublicado,
  catalogo: CatalogoNova,
): ResolucionEquipoNova {
  const separado = separaNombreYEstado(publicado.literal);
  const base = {
    nombreEquipo: separado.nombreEquipo,
    marcadoresEstado: separado.marcadoresEstado,
    marcadoresFueraDePosicion: separado.marcadoresFueraDePosicion,
    marcadoresDesconocidos: separado.marcadoresDesconocidos,
  };

  // 1. El código explícito del propio partido. Es identidad fuerte dentro de su federación y su ámbito.
  const explicito = String(publicado.codigoExplicito ?? '').trim();
  if (explicito !== '') {
    const inscripcion = catalogo.inscripcionPorCodigo.get(explicito);
    if (inscripcion !== undefined) {
      return { ...base, codigoExterno: explicito, inscripcion, via: 'codigo-explícito-del-partido', evidencia: `equipo=${explicito} del enlace de comparativa` };
    }
    // El código existe pero no está en este grupo: NO se usa y no se cae al nombre, porque un código
    // que no pertenece al ámbito es un dato de otro grupo y usarlo cruzaría el ámbito.
    return {
      ...base, codigoExterno: null, inscripcion: null, via: 'sin-resolver',
      evidencia: `el código ${explicito} no está en el catálogo de este grupo`,
    };
  }

  // 2 y 3. Catálogo del grupo por nombre limpio (el código del catálogo se resuelve al inscribirlo).
  const normalizado = normalizaNombreEquipo(separado.nombreEquipo);
  if (normalizado !== '') {
    const inscripcion = catalogo.inscripcionPorNombreLimpio.get(normalizado);
    if (inscripcion !== undefined) {
      return {
        ...base, codigoExterno: null, inscripcion, via: 'nombre-limpio-único',
        evidencia: `«${separado.nombreEquipo}» es el único equipo de este grupo con ese nombre limpio`,
      };
    }
  }

  // 4. Sin resolver: se conserva sin código y sin inscripción. No se fabrica un código federativo ni se
  //    acepta un candidato dudoso.
  return {
    ...base, codigoExterno: null, inscripcion: null, via: 'sin-resolver',
    evidencia: `sin código en la fuente y «${separado.nombreEquipo}» no es único en el grupo (o no aparece)`,
  };
}

