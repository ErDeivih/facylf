/**
 * El manifiesto de una simulación: qué se va a cambiar, con qué evidencia, y qué queda fuera.
 *
 * ## Por qué este módulo existe aparte
 *
 * Porque el manifiesto es el **contrato** entre `--simular` y `--aplicar`. Si su esquema cambia, un
 * manifiesto antiguo no se puede leer con las reglas nuevas, y esa comprobación tiene que ser una
 * función propia y probada, no un `if` perdido en el CLI.
 *
 * ## Los contadores y por qué se sumaban mal
 *
 * El informe de una simulación publica varios contadores. Se llegaron a presentar a la vez «22 casos
 * ambiguos» (del manifiesto) y «13 + 11 = 24» (de dos diagnósticos anteriores), como si fueran el
 * mismo conjunto contado de dos maneras. No lo eran:
 *
 * - el **13** era un DELTA —«13 casos más quedarían reparados si además se quitara `(P)`»— de un
 *   diagnóstico que compara el calendario con el acta, medido en otra instantánea de la cola. Hoy mide
 *   **16**. Es una parte de los ambiguos, no un añadido a ellos;
 * - el **11** no era un recuento de filas: era el número de apariciones del marcador `(Irabazlea)`
 *   (tabla de `nova-equipos.ts` y §«Clase A» de `IMPORTADOR-SQLITE.md`). La Clase B de Euskadi es
 *   **cero**: los 75 casos de Clase B que documenta `IMPORTADOR-SQLITE.md` son de Castilla y León (62),
 *   Aragón (5), Castilla-La Mancha (3), La Rioja (3) y Ceuta (2).
 *
 * Sumar un delta de un diagnóstico con un recuento de marcador de otro no da un conjunto, y por eso
 * `compruebaCoherencia` exige que **todo contador publicado se pueda derivar del manifiesto**. Una
 * cifra que no cuadre con el desglose detiene el informe en vez de imprimirse.
 *
 * Detalle reproducible: `scripts/_diag-union-ambiguas.mjs` y
 * `pruebas/reconstruccion/informes/union-ambiguas.txt`.
 */
import { huella } from './digest.js';
import { huellaFila } from './filas.js';
import type { FilaCola } from './filas.js';
import type { VeredictoActaDescanso } from '../parsers/filas-informativas.js';

/**
 * Vocabulario CERRADO de motivos de ambigüedad. Un motivo fuera de esta lista detiene el lote: es lo
 * que impide que dos diagnósticos distintos se sumen como si fueran el mismo contador.
 */
export const VOCABULARIO_MOTIVO_AMBIGUO = [
  'el-acta-no-sostiene-la-pareja',
  'el-acta-no-permite-comprobar-la-pareja',
  'el-html-no-trae-una-fila-en-esa-posicion',
] as const;

export type MotivoAmbiguo = (typeof VOCABULARIO_MOTIVO_AMBIGUO)[number];

export function esMotivoAmbiguo(valor: unknown): valor is MotivoAmbiguo {
  return typeof valor === 'string' && (VOCABULARIO_MOTIVO_AMBIGUO as readonly string[]).includes(valor);
}

export type CambioDeterminista = {
  orden: number;
  antes: FilaCola;
  despues: FilaCola;
  huella_antes: string;
  huella_despues: string;
  /** La corrección recupera un código federativo que la cola no tenía. */
  codigo_recuperado: boolean;
  via: { local: string; visitante: string };
  marcadores: string[];
  /** Alguno de los dos lados queda enlazado por referencia contextual, sin código. */
  referencia_contextual: boolean;
};

export type Ambiguedad = {
  orden: number;
  actual: string;
  html: string;
  motivo: MotivoAmbiguo;
  vias: { local: string; visitante: string };
  marcadores_fuera_de_posicion: string[];
  marcadores_desconocidos: string[];
};

export type JornadaManifiesto = {
  temporada: string;
  competicion: string;
  grupo: string;
  numero: number;
  archivo: string;
  /**
   * Huella del HTML tal y como la calcula la herramienta: sha256 **recortado a 16 hex**. Es lo que
   * `--verificar` vuelve a calcular para detectar que el archivo cambió desde la simulación, así que las
   * dos partes de esa comparación son del mismo formato.
   */
  huella_html: string;
  /**
   * El sha256 **completo (64 hex)** que la cola guardó del contenido con el que escribió estas filas.
   * OJO: no es comparable con `huella_html`, que va recortado; compararlos directamente marca todas las
   * jornadas como desfasadas. La comparación buena está en `simula`, y vive en la jornada que se declaró
   * fuera del lote (`EvidenciaDesfasada`), donde las dos huellas van en el mismo formato.
   */
  huella_jornada_guardada: string | null;
  filas: number;
  identicas: number;
  cambios: CambioDeterminista[];
  ambiguos: Ambiguedad[];
  estado: 'con-cambios' | 'sin-cambios';
  /**
   * Presente cuando la jornada NO se pudo reconstruir por falta de HTML archivado. No es una jornada
   * ambigua —no hay dos lecturas que comparar— y por eso cuenta aparte y con `filas: 0`: meterla en
   * `ambiguos` inflaría la cifra publicada con casos de otra naturaleza.
   */
  saltada?: string;
  /**
   * Presente cuando el HTML archivado **ya no es el que produjo estas filas**: la cola guarda el sha256
   * del contenido que leyó al escribirlas (`jornadas.hash`) y no coincide con el del archivo del disco.
   *
   * No es un caso raro: quien reescribe el HTML en el sitio es el worker, y una copia de la cola es una
   * foto. Cualquier jornada que el worker haya vuelto a comprobar después de la foto llega aquí. Comparar
   * esas filas contra el HTML nuevo fabrica «correcciones» que no son defectos del extractor sino desfase
   * de evidencia —medido: 5 de las 199 correcciones de Euskadi salían de 1 jornada desfasada—, así que la
   * jornada queda FUERA del lote y se declara, en vez de compararse en silencio.
   */
  evidencia_desfasada?: EvidenciaDesfasada;
  /**
   * Filas de la cola que existen pero NO se compararon, porque la jornada quedó fuera por evidencia
   * desfasada. Va aparte de la partición para que la resta se pueda auditar: `identicas + cambios +
   * ambiguos + fantasma + no_comparables = filas`.
   */
  filas_no_comparables?: number;
  /**
   * DIAGNÓSTICO del defecto de las filas de descanso. **No entra en el lote**: `--aplicar` escribe sólo
   * `cambios`. Borrar e insertar filas necesita su propio lote reversible y sus propias pruebas, así que
   * primero se informa. Estos contadores son disjuntos de la partición
   * `filas = identicas + cambios + ambiguos` y NO se suman a ella: describen lo mismo desde otro ángulo.
   */
  informativas?: BloqueInformativo[];
  filasFantasma?: FilaFantasma[];
  partidosRecuperados?: PartidoRecuperado[];
  filasDuplicadas?: FilaDuplicada[];
  /**
   * Partidos DESPLAZADOS: filas cuyo acta nombra dos equipos reales aunque la cola ponga el descanso.
   * Es diagnóstico; ver `FilaDesplazada`.
   */
  desplazadas?: FilaDesplazada[];
  /**
   * Las filas fantasma que el lote RETIRA de `partidos` cuando se le pide con `--retirar-fantasma`.
   *
   * Sólo entran las que **no traen acta**: el extractor no puede descartar una que la traiga sin abrirla, y
   * descartarla podría borrar un partido real. La fila entera se guarda en `antes` porque la reversión no
   * puede restaurar lo que no copió: retirar no es un `update`, es un `delete` que hay que poder deshacer.
   */
  retiradas?: FilaRetirada[];
  /**
   * Los partidos DESPLAZADOS que el lote RECUPERA cuando se le pide con `--recuperar-desplazados`.
   *
   * No es una retirada: la fila ya existe y lo que se corrige es la pareja —el lado que dice «Descansa» pasa
   * a ser el equipo que el acta nombra—. Va en la misma forma que un `cambio` (con `antes` y `despues`)
   * porque la escritura es la misma: un `update` cuyo diario ya sabe deshacerse.
   *
   * Sólo entran las que se pueden sostener: el acta nombra dos equipos reales, los dos se resuelven en el
   * catálogo del grupo, y la pareja del acta **no está ya** en esa jornada como otra fila (si lo estuviera,
   * corregirla DUPLICARÍA el partido, y eso no se hace).
   */
  recuperadas?: CambioDeterminista[];
  /**
   * Filas que la COLA tiene y la FUENTE no publica, sostenidas por el acta de esa misma fila: son las
   * recuperaciones ya aplicadas. Se declaran para que se puedan distinguir de un partido perdido, y NO
   * entran en la comparación posicional (la fuente no tiene esa fila, así que contarla desplazaría las
   * siguientes).
   */
  recuperadasPorActa?: Array<{ orden: number; en_la_cola: string; dice_el_acta: string; codigo_acta: string }>;
};

/**
 * Una fila que el lote retira de `partidos`, con todo lo necesario para volver a insertarla.
 *
 * `motivo` no es decorativo: dice CUÁL de las dos vías autoriza a borrar —no hay acta, o el acta nombra el
 * descanso—, y con él se puede auditar por qué desapareció cada fila.
 */
export type FilaRetirada = {
  orden: number;
  /** La fila completa tal y como está en la cola. Es lo que la reversión vuelve a insertar. */
  antes: FilaCola;
  huella_antes: string;
  equipo_que_descansa: string | null;
  motivo: string;
};

/** El bloque de descanso tal y como lo publica la fuente, con el equipo que descansa. */
export type BloqueInformativo = {
  maqueta: string;
  local: string;
  visitante: string;
  informativa: boolean;
  sospechosa: boolean;
  motivo: string;
  equipoQueDescansa: string | null;
  /**
   * ¿La COLA tiene hoy una fila con esta misma pareja?
   *
   * No es deducible de los demás campos —las parejas de `filasFantasma` van en crudo, sin normalizar— y es
   * justo el dato que hace falta para leer una retirada: un bloque `sospechosa` que la fuente sigue publicando
   * y que la cola ya no tiene es la huella que deja un lote de retirada. Ojo: prueba que HOY no está, **no**
   * que la retirara un lote concreto; quién la retiró lo dice el diario de ese lote.
   *
   * Opcional porque el extractor no conoce la cola: lo rellena la reconstrucción, que es quien las compara.
   */
  en_la_cola?: boolean;
};

/** Una fila de la cola que es el bloque de descanso: el extractor corregido ya no la produce. */
export type FilaFantasma = {
  orden: number;
  local: string;
  visitante: string;
  codigo_acta: string | null;
  equipo_que_descansa: string | null;
  motivo: string | null;
  /**
   * Si trae acta. Por sí solo NO decide nada: lo que decide es lo que dice el acta, en `acta`.
   *
   * @deprecated Se conserva porque dice lo que hay en la cola (`codigo_acta is not null`), pero la regla de
   * retirada mira `acta`: un acta que nombra el descanso autoriza a borrar y una que nombra dos equipos
   * reales lo prohíbe. Usar `tiene_acta` para decidir es justo el error que se corrigió.
   */
  tiene_acta: boolean;
  /**
   * Veredicto del acta de esta fila: `sin-acta` (no hay), `descanso` (el acta nombra el descanso en uno de
   * los lados: no hubo partido), `partido-real` (el acta nombra DOS equipos reales: aquí sí hay partido y
   * la fila NO se retira) o `no-demuestra` (acta sin pareja, ilegible o ausente de la cola).
   */
  acta: VeredictoActaDescanso | 'sin-acta';
};

/** Un partido que el HTML publica y la cola no tiene. */
export type PartidoRecuperado = { local: string; visitante: string; codigo_acta: string | null };

/** Una fila que comparte acta con otra de la misma jornada. */
export type FilaDuplicada = { orden: number; codigo_acta: string; local: string; visitante: string };

/**
 * Un PARTIDO DESPLAZADO: la fila de la cola pone el descanso en un lado y el acta de esa misma fila nombra
 * dos equipos reales. Ahí hubo partido, así que la fila no es una fantasma que se pueda retirar: lo que
 * pasa es que la cola tiene el descanso donde debería estar el equipo que el acta sí conoce.
 *
 * Es DIAGNÓSTICO y no entra en el lote: recuperar el partido es insertar o corregir una pareja, no borrar
 * una fila, y eso necesita su propio lote reversible. Tampoco entra en la partición de las filas —la fila
 * sigue comparándose como cualquier otra—, así que sus contadores NO se suman a `identicas + cambios + ...`.
 */
export type FilaDesplazada = {
  orden: number;
  /** Lo que dice la cola hoy, con el descanso en uno de los lados. */
  en_la_cola: string;
  /** Lo que dice el acta de esa misma fila. */
  dice_el_acta: string;
  codigo_acta: string;
  /** El lado que el acta nombra y la fila no tiene: es el equipo que el calendario se ha dejado. */
  equipo_que_la_cola_no_tiene: string | null;
  /** La pareja del acta ya está en la jornada como otra fila: entonces no falta nada, hay dos lecturas. */
  la_pareja_del_acta_ya_esta_en_la_jornada: boolean;
};

/**
 * El HTML del disco no es el que la cola registró al escribir las filas: ambas huellas se guardan para
 * que la declaración se pueda comprobar sin volver a leer nada.
 */
export type EvidenciaDesfasada = {
  /** sha256 que la cola guardó de la jornada. `null` si la cola no lo registró: entonces no se puede demostrar. */
  huella_cola: string | null;
  /** sha256 del archivo que hay ahora en el disco. */
  huella_disco: string;
  /** Cuándo comprobó el worker esa jornada, según la cola. */
  comprobada_en: string | null;
};

export type ResumenManifiesto = {
  jornadas: number;
  /** Jornadas que no se pudieron reconstruir por falta de HTML archivado. */
  jornadas_saltadas: number;
  filas: number;
  identicas: number;
  cambios: number;
  ambiguos: number;
  jornadas_con_cambios: number;
  ambiguos_por_motivo: Record<MotivoAmbiguo, number>;
  /** Diagnóstico del descanso. NO entra en el lote; ver `JornadaManifiesto`. */
  filas_fantasma: number;
  /** De las fantasma, las que NO traen acta: ésas sí se pueden retirar sin más comprobación. */
  filas_fantasma_sin_acta: number;
  partidos_recuperados: number;
  filas_duplicadas: number;
  jornadas_con_filas_fantasma: number;
  /** Fantasma sin acta, que son las que un lote puede retirar sin abrir nada más. */
  filas_retirables: number;
  /**
   * De las fantasma, las que traen acta. Por sí solo no dice que haya partido: hay que mirar el veredicto.
   */
  filas_fantasma_con_acta: number;
  /**
   * Fantasma cuyo acta NOMBRA EL DESCANSO en uno de los dos lados: no hubo partido, así que también se
   * pueden retirar. Son las que la regla anterior dejaba fuera por no abrir el acta.
   */
  filas_fantasma_con_acta_de_descanso: number;
  /**
   * Fantasma cuyo acta nombra DOS EQUIPOS REALES. Son las únicas que **no se retiran nunca** por esta vía:
   * ahí sí hay un partido documentado, y borrar la fila lo perdería.
   */
  filas_fantasma_con_acta_de_partido: number;
  /**
   * Jornadas fuera del lote porque el HTML del disco no es el que la cola registró. Se cuentan APARTE de
   * `jornadas_saltadas`: una jornada sin HTML y una jornada con el HTML de otra lectura no son el mismo
   * caso, y sumarlas publicaría una cifra que mezcla dos naturalezas.
   */
  jornadas_con_evidencia_desfasada: number;
  /** Filas que quedaron sin comparar por eso mismo. */
  filas_no_comparables: number;
  /**
   * Partidos desplazados: el acta nombra dos equipos reales donde la cola pone el descanso. NO se suman a
   * la partición —esas filas se siguen comparando— y por eso van en su propio contador, que es la única
   * forma de que no se confundan con las fantasma.
   */
  filas_desplazadas: number;
  /**
   * Partidos desplazados que el lote puede RECUPERAR (con `--recuperar-desplazados`): el acta nombra dos
   * equipos reales, los dos resuelven en el catálogo del grupo y la pareja no está ya en la jornada.
   * Es un subconjunto de `filas_desplazadas`, y NO entra en la partición: la fila sigue contando como
   * fantasma, porque la fila de la cola es el bloque de descanso.
   */
  filas_recuperables: number;
  /** Recuperaciones ya aplicadas que se han visto en la cola: filas que la fuente no publica y el acta sí. */
  filas_recuperadas_por_acta: number;
};

export type Manifiesto = {
  federacion: string;
  maqueta: string;
  version_extractor: string;
  version_contrato: number;
  esquema_manifiesto: number;
  artefactos: Record<string, string>;
  generado_en: string;
  resumen: ResumenManifiesto;
  jornadas: JornadaManifiesto[];
  id: string;
  /** Presente y `true` cuando el manifiesto se ha invalidado a mano. Se rechaza al aplicar. */
  obsoleto?: boolean;
  motivo_obsolescencia?: string;
};

const CAMPOS_FILA = [
  'jornada', 'orden', 'codigo_acta', 'equipo_local_codigo', 'equipo_visitante_codigo',
  'local', 'visitante', 'goles_local', 'goles_visitante', 'fecha', 'hora',
  'campo', 'campo_codigo', 'arbitro',
] as const;

/** Sólo los campos de la fila, sin `actualizado_en`: es lo que se guarda en el diario y en el manifiesto. */
export function recortaFila(fila: FilaCola): FilaCola {
  const salida = {} as Record<string, unknown>;
  for (const campo of CAMPOS_FILA) salida[campo] = (fila as unknown as Record<string, unknown>)[campo];
  return salida as unknown as FilaCola;
}

export function resumenDe(jornadas: readonly JornadaManifiesto[]): ResumenManifiesto {
  const ambiguos_por_motivo = Object.fromEntries(
    VOCABULARIO_MOTIVO_AMBIGUO.map((m) => [m, 0]),
  ) as Record<MotivoAmbiguo, number>;
  for (const j of jornadas) {
    for (const a of j.ambiguos) {
      if (esMotivoAmbiguo(a.motivo)) ambiguos_por_motivo[a.motivo]++;
    }
  }
  return {
    jornadas: jornadas.length,
    jornadas_saltadas: jornadas.filter((j) => j.saltada !== undefined).length,
    filas: jornadas.reduce((a, j) => a + (j.filas ?? 0), 0),
    identicas: jornadas.reduce((a, j) => a + (j.identicas ?? 0), 0),
    cambios: jornadas.reduce((a, j) => a + j.cambios.length, 0),
    ambiguos: jornadas.reduce((a, j) => a + j.ambiguos.length, 0),
    jornadas_con_cambios: jornadas.filter((j) => j.cambios.length > 0).length,
    ambiguos_por_motivo,
    filas_fantasma: jornadas.reduce((a, j) => a + (j.filasFantasma?.length ?? 0), 0),
    filas_fantasma_sin_acta: jornadas.reduce((a, j) => a + (j.filasFantasma ?? []).filter((f) => !f.tiene_acta).length, 0),
    partidos_recuperados: jornadas.reduce((a, j) => a + (j.partidosRecuperados?.length ?? 0), 0),
    filas_duplicadas: jornadas.reduce((a, j) => a + (j.filasDuplicadas?.length ?? 0), 0),
    jornadas_con_filas_fantasma: jornadas.filter((j) => (j.filasFantasma?.length ?? 0) > 0).length,
    filas_retirables: jornadas.reduce((a, j) => a + (j.retiradas?.length ?? 0), 0),
    filas_fantasma_con_acta: jornadas.reduce((a, j) => a + (j.filasFantasma ?? []).filter((f) => f.acta !== 'sin-acta').length, 0),
    filas_fantasma_con_acta_de_descanso: jornadas.reduce((a, j) => a + (j.filasFantasma ?? []).filter((f) => f.acta === 'descanso').length, 0),
    filas_fantasma_con_acta_de_partido: jornadas.reduce((a, j) => a + (j.filasFantasma ?? []).filter((f) => f.acta === 'partido-real').length, 0),
    jornadas_con_evidencia_desfasada: jornadas.filter((j) => j.evidencia_desfasada !== undefined).length,
    filas_no_comparables: jornadas.reduce((a, j) => a + (j.filas_no_comparables ?? 0), 0),
    filas_desplazadas: jornadas.reduce((a, j) => a + (j.desplazadas?.length ?? 0), 0),
    filas_recuperables: jornadas.reduce((a, j) => a + (j.recuperadas?.length ?? 0), 0),
    filas_recuperadas_por_acta: jornadas.reduce((a, j) => a + (j.recuperadasPorActa?.length ?? 0), 0),
  };
}

/**
 * Identidad del lote. Incluye el MOTIVO de cada ambigüedad, no sólo su posición: dos simulaciones que
 * difieren en por qué una fila es ambigua son dos lotes distintos y no pueden compartir id.
 */
export function idDeManifiesto(datos: {
  federacion: string;
  version: string;
  jornadas: readonly JornadaManifiesto[];
}): string {
  return huella(JSON.stringify({
    federacion: datos.federacion,
    version: datos.version,
    jornadas: datos.jornadas.map((j) => [
      j.temporada, j.competicion, j.grupo, j.numero,
      j.cambios.map((c) => [c.orden, c.huella_antes, c.huella_despues]),
      j.ambiguos.map((a) => [a.orden, a.motivo]),
      // Una jornada fuera del lote por evidencia desfasada deja de aportar cambios, pero además hay que
      // decir POR QUÉ no aporta: dos lotes que difieren en eso no son el mismo lote.
      j.evidencia_desfasada ? ['evidencia-desfasada', j.evidencia_desfasada.huella_cola, j.evidencia_desfasada.huella_disco] : null,
    ]),
  }));
}

/**
 * Incoherencias del manifiesto consigo mismo. Lista vacía = se puede publicar.
 *
 * La comprobación central es la partición: **cada fila es idéntica, corregida o ambigua, y nada más**.
 * Si la suma no cuadra, algún contador está midiendo otra cosa —que es exactamente cómo se llegó a
 * presentar 22 y 24 a la vez— y el informe se detiene.
 */
export function compruebaCoherencia(manifiesto: Manifiesto): string[] {
  const fallos: string[] = [];
  const r = manifiesto.resumen;
  if (!r) return ['el manifiesto no tiene resumen'];

  if (r.jornadas !== manifiesto.jornadas.length) {
    fallos.push(`resumen.jornadas=${r.jornadas} pero hay ${manifiesto.jornadas.length} jornadas`);
  }
  for (const j of manifiesto.jornadas) {
    if (j.saltada !== undefined && (j.filas !== 0 || j.cambios.length > 0 || j.ambiguos.length > 0)) {
      fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: jornada saltada («${j.saltada}») `
        + 'y sin embargo declara filas, cambios o ambigüedades');
    }
    const suma = j.identicas + j.cambios.length + j.ambiguos.length + (j.filasFantasma?.length ?? 0)
      + (j.recuperadasPorActa?.length ?? 0) + (j.filas_no_comparables ?? 0);
    if (j.filas !== suma) {
      fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: filas=${j.filas} `
        + `pero identicas+cambios+ambiguos+fantasma+recuperadas_por_acta+no_comparables=`
        + `${j.identicas}+${j.cambios.length}+${j.ambiguos.length}+${j.filasFantasma?.length ?? 0}+`
        + `${j.recuperadasPorActa?.length ?? 0}+${j.filas_no_comparables ?? 0}=${suma}`);
    }
    /*
     * La evidencia desfasada y la jornada saltada son excluyentes: sin HTML no hay huella con la que
     * comparar, así que no se puede declarar desfase. Y una jornada desfasada no puede traer cambios ni
     * ambigüedades: si los trae, se comparó —que es justo lo que no se puede hacer con esa evidencia—.
     */
    if (j.evidencia_desfasada !== undefined) {
      if (j.saltada !== undefined) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: evidencia desfasada y jornada saltada a la vez`);
      }
      if (j.cambios.length > 0 || j.ambiguos.length > 0 || j.identicas > 0) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: evidencia desfasada y sin embargo `
          + `declara ${j.identicas} idénticas, ${j.cambios.length} cambios y ${j.ambiguos.length} ambiguas`);
      }
      if ((j.filas_no_comparables ?? 0) !== j.filas) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: evidencia desfasada pero `
          + `filas_no_comparables=${j.filas_no_comparables ?? 0} y filas=${j.filas}`);
      }
      if (j.evidencia_desfasada.huella_cola !== null
        && j.evidencia_desfasada.huella_cola === j.evidencia_desfasada.huella_disco) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: declara evidencia desfasada con las dos huellas iguales`);
      }
    } else if (j.filas_no_comparables !== undefined) {
      fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: filas_no_comparables sin evidencia desfasada declarada`);
    }
    const esperado = j.cambios.length > 0 ? 'con-cambios' : 'sin-cambios';
    if (j.estado !== esperado) fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: estado=${j.estado} y deberia ser ${esperado}`);
    for (const c of j.cambios) {
      if (c.huella_antes === c.huella_despues) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${c.orden}: cambio sin diferencia de huella`);
      }
    }
    for (const a of j.ambiguos) {
      if (!esMotivoAmbiguo(a.motivo)) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${a.orden}: motivo fuera del vocabulario (${String(a.motivo)})`);
      }
    }
  }

  const calculado = resumenDe(manifiesto.jornadas);
  for (const campo of ['jornadas', 'jornadas_saltadas', 'filas', 'identicas', 'cambios', 'ambiguos', 'jornadas_con_cambios',
    'filas_fantasma', 'filas_fantasma_sin_acta', 'partidos_recuperados', 'filas_duplicadas', 'jornadas_con_filas_fantasma',
    'filas_retirables', 'jornadas_con_evidencia_desfasada', 'filas_no_comparables',
    'filas_fantasma_con_acta', 'filas_fantasma_con_acta_de_descanso', 'filas_fantasma_con_acta_de_partido',
    'filas_desplazadas', 'filas_recuperables', 'filas_recuperadas_por_acta'] as const) {
    if (r[campo] !== calculado[campo]) {
      fallos.push(`resumen.${campo}=${r[campo]} pero las jornadas suman ${calculado[campo]}`);
    }
  }
  if (r.filas_fantasma_sin_acta > r.filas_fantasma) {
    fallos.push(`resumen.filas_fantasma_sin_acta=${r.filas_fantasma_sin_acta} no puede superar filas_fantasma=${r.filas_fantasma}`);
  }
  if (r.filas_fantasma_con_acta_de_descanso + r.filas_fantasma_con_acta_de_partido > r.filas_fantasma_con_acta) {
    fallos.push('los veredictos de acta no pueden superar las fantasma con acta');
  }
  if (r.filas_fantasma_con_acta + r.filas_fantasma_sin_acta !== r.filas_fantasma) {
    fallos.push(`fantasma con acta (${r.filas_fantasma_con_acta}) + sin acta (${r.filas_fantasma_sin_acta}) `
      + `tiene que sumar filas_fantasma=${r.filas_fantasma}`);
  }
  /*
   * Sólo se puede retirar lo que el extractor NO emite y cuya evidencia diga que ahí no hubo partido:
   * sin acta, o con un acta que NOMBRA EL DESCANSO. Una fantasma cuyo acta nombra dos equipos reales no se
   * retira nunca —ahí hay un partido documentado— y una cuyo acta no demuestra nada tampoco. Comprobarlo
   * aquí impide que un lote borre un partido real, que es la única forma de perderlo por este camino.
   */
  for (const j of manifiesto.jornadas) {
    const fantasmaPorOrden = new Map((j.filasFantasma ?? []).map((f) => [f.orden, f]));
    /*
     * Un partido desplazado NO se puede retirar: el acta dice que hubo partido. Se comprueba aquí, junto a
     * la puerta de la retirada, porque es la misma pregunta —¿autoriza esta evidencia a borrar la fila?— y
     * tener las dos respuestas en el mismo sitio impide que una contradiga a la otra.
     */
    const desplazadoPorOrden = new Set((j.desplazadas ?? []).map((d) => d.orden));
    for (const retirada of j.retiradas ?? []) {
      if (desplazadoPorOrden.has(retirada.orden)) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${retirada.orden}: `
          + 'se retira una fila declarada partido DESPLAZADO (el acta dice que ahí hubo partido)');
      }
      const fantasma = fantasmaPorOrden.get(retirada.orden);
      if (!fantasma) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${retirada.orden}: se retira una fila que no está declarada fantasma`);
      } else if (fantasma.acta !== 'sin-acta' && fantasma.acta !== 'descanso') {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${retirada.orden}: se retira una fantasma `
          + `cuyo acta no autoriza a borrar (${fantasma.acta})`);
      }
      if (retirada.huella_antes !== huellaFila(retirada.antes)) {
        fallos.push(`t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${retirada.orden}: la huella guardada no es la de la fila guardada`);
      }
    }
  }
  const sumaMotivos = Object.values(calculado.ambiguos_por_motivo).reduce((a, n) => a + n, 0);
  if (sumaMotivos !== calculado.ambiguos) {
    fallos.push(`el desglose por motivo suma ${sumaMotivos} y las ambigüedades son ${calculado.ambiguos}`);
  }
  if (r.ambiguos_por_motivo) {
    for (const m of VOCABULARIO_MOTIVO_AMBIGUO) {
      if ((r.ambiguos_por_motivo[m] ?? 0) !== calculado.ambiguos_por_motivo[m]) {
        fallos.push(`resumen.ambiguos_por_motivo[${m}]=${r.ambiguos_por_motivo[m] ?? 0} pero las jornadas suman ${calculado.ambiguos_por_motivo[m]}`);
      }
    }
  } else {
    fallos.push('el resumen no lleva el desglose por motivo: sin él los contadores no son auditables');
  }
  return fallos;
}

/**
 * Comprueba que una cifra de casos ambiguos que se va a PUBLICAR es la del manifiesto.
 *
 * Existe por el error concreto que hay que impedir: publicar `13 + 11 = 24` cuando el manifiesto dice
 * 22. La cifra publicada tiene que ser exactamente la del manifiesto; cualquier otra cosa —una suma,
 * un delta de otro diagnóstico, un recuento de marcador— se rechaza con la explicación de qué es cada
 * contador.
 */
export function compruebaCifraAmbigua(manifiesto: Manifiesto, cifraPublicada: number): string[] {
  const fallos = compruebaCoherencia(manifiesto);
  if (fallos.length) return fallos;
  const esperada = manifiesto.resumen.ambiguos;
  if (cifraPublicada !== esperada) {
    const desglose = Object.entries(manifiesto.resumen.ambiguos_por_motivo)
      .filter(([, n]) => n > 0).map(([m, n]) => `${m}=${n}`).join(', ');
    return [
      `la cifra publicada de casos ambiguos es ${cifraPublicada} y el manifiesto dice ${esperada} `
      + `(desglose por motivo: ${desglose || 'ninguno'})`,
      'no se puede sumar a ese número el delta de otro diagnóstico (casos que quedarían reparados si '
      + 'se quitara otro marcador) ni el recuento de apariciones de un marcador: son universos distintos',
    ];
  }
  return [];
}

/**
 * Vigencia del manifiesto frente a la versión de la herramienta que lo va a aplicar.
 *
 * Se comprueban las CUATRO cosas por separado —esquema, contrato, versión de conjunto y huella de cada
 * artefacto— porque cuando falla hay que poder decir qué cambió, no sólo que algo cambió. Un manifiesto
 * de otro esquema se rechaza aunque su versión cuadre: los campos que se leerían no serían ésos.
 */
export function compruebaVigencia(
  manifiesto: Manifiesto,
  actual: { version: string; contrato: number; esquema: number; artefactos: Record<string, string> },
): string[] {
  const fallos: string[] = [];
  if (manifiesto.obsoleto === true) {
    fallos.push(`el manifiesto está marcado como OBSOLETO${manifiesto.motivo_obsolescencia ? `: ${manifiesto.motivo_obsolescencia}` : ''}`);
  }
  if (manifiesto.esquema_manifiesto !== actual.esquema) {
    fallos.push(`esquema del manifiesto ${String(manifiesto.esquema_manifiesto)} ≠ ${actual.esquema} de la herramienta`);
  }
  if (manifiesto.version_contrato !== actual.contrato) {
    fallos.push(`versión del contrato ${String(manifiesto.version_contrato)} ≠ ${actual.contrato}`);
  }
  if (manifiesto.version_extractor !== actual.version) {
    fallos.push(`versión de la reconstrucción ${String(manifiesto.version_extractor)} ≠ ${actual.version}`);
  }
  for (const [ruta, digest] of Object.entries(manifiesto.artefactos ?? {})) {
    const ahora = actual.artefactos[ruta];
    if (ahora === undefined) fallos.push(`el artefacto ${ruta} ya no está declarado`);
    else if (ahora !== digest) fallos.push(`el artefacto ${ruta} cambió desde la simulación (${digest} → ${ahora})`);
  }
  return fallos;
}
