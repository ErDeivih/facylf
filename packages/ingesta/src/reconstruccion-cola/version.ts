/**
 * Versionado de la reconstrucción: qué invalida un manifiesto y qué no.
 *
 * ## El defecto que esto corrige
 *
 * La versión anterior se derivaba del hash de dos ficheros —`scripts/lib/recolector-local.mjs` y
 * `packages/ingesta/src/parsers/nova-equipos.ts`— y **no** de la lógica propia de
 * `scripts/reconstruir-cola.mjs`. Cambiar cómo se construye una fila dentro de ese fichero dejaba la
 * versión intacta y el manifiesto seguía pareciendo vigente: se podía aplicar un lote calculado con
 * una regla que ya no existía. El caso real es el manifiesto `e01b3eec46ee4909`, generado antes de
 * corregir la construcción de las filas y que por eso quedó obsoleto sin que nada lo dijera.
 *
 * ## La corrección
 *
 * Toda decisión que afecte al resultado vive ahora en módulos declarados, y la huella se calcula
 * sobre la huella SEMÁNTICA de cada uno (ver `digest.ts`: sin comentarios ni formato). Se incluye:
 *
 * 1. la **versión explícita del contrato**, que se sube a mano cuando cambia una regla que no está en
 *    ningún fichero (por ejemplo, un acuerdo sobre qué se considera ambiguo);
 * 2. el **esquema del manifiesto**, que cambia cuando cambian sus campos;
 * 3. el **adaptador** de cada federación (qué maqueta, qué extractor, si está permitida);
 * 4. la **normalización** del nombre del equipo y la separación de marcadores;
 * 5. la **construcción de filas**;
 * 6. las **reglas de selección** (qué entra en el lote y qué queda fuera por ambiguo);
 * 7. los **extractores** cuya salida alimenta todo lo anterior.
 *
 * ## Lo que NO invalida
 *
 * Un cambio de comentario, de sangría o de JSDoc. Es deliberado: invalidar por eso obligaría a
 * rehacer una simulación de 4.635 jornadas cada vez que alguien arregla una tilde en un comentario, y
 * un mecanismo que obliga a eso se acaba desactivando. Está medido y probado en
 * `packages/ingesta/test/reconstruccion-cola/tool.test.ts`.
 */
import { createHash } from 'node:crypto';
import { huellaFicheroSemantico } from './digest.js';

/**
 * Versión explícita del contrato de la reconstrucción. Súbela SIEMPRE que cambie una regla que no se
 * puede leer en el código: qué se considera ambiguo, qué marcadores se separan, qué se acepta como
 * sostén del acta.
 *
 * Historial:
 * - 1 · primera versión, con la huella calculada sólo sobre el extractor (defectuosa: no cubría la
 *       construcción de filas).
 * - 2 · la huella cubre contrato, esquema, adaptadores, normalización, filas y selección.
 * - 3 · el manifiesto informa además de filas fantasma, partidos recuperados y duplicados del defecto de
 *       las filas de descanso.
 * - 4 · el manifiesto lleva además las filas que un lote puede RETIRAR —con la fila entera, porque retirar
 *       es un `delete` y la reversión sólo puede restaurar lo que copió— y una jornada cuyo HTML archivado
 *       ya no es el que la cola registró queda FUERA del lote: comparar filas viejas contra un HTML nuevo
 *       no mide defectos del extractor, mide desfase de evidencia. Las correcciones publicadas antes y
 *       después de este cambio NO son la misma cifra.
 * - 5 · la retirada de una fantasma deja de decidirse por «¿trae acta?» y pasa a decidirse por lo que el
 *       acta DICE: sin acta, o con un acta que nombra el descanso, se retira; con un acta que nombra dos
 *       equipos reales, jamás; con un acta que no demuestra nada, tampoco. Medido en Euskadi: 12 de las 13
 *       fantasma con acta lo tienen de descanso y NINGUNA lo tiene de partido.
 */
export const VERSION_CONTRATO = 5;

/**
 * Versión del esquema del manifiesto: los campos que `--aplicar` espera encontrar. Un manifiesto con
 * otro esquema se rechaza aunque su huella cuadre, porque los campos que se leerían no serían ésos.
 *
 * Historial: 1 · primera; 2 · informativas y filas fantasma; 3 · marcadores y referencias contextuales por
 * cambio; 4 · `retiradas` (filas que el lote retira, con la fila entera); 5 · `evidencia_desfasada` y
 * `filas_no_comparables`; 6 · el veredicto del acta de cada fantasma y los contadores que lo resumen;
 * 7 · `en_la_cola` en cada bloque informativo, que es lo que deja ver un bloque ya retirado; 8 · `recuperadas`
 * (los partidos desplazados que el lote recupera corrigiendo la pareja, con `--recuperar-desplazados`).
 */
export const ESQUEMA_MANIFIESTO = 8;

/**
 * Ficheros cuya huella semántica entra en la versión. Las rutas son relativas a la raíz del proyecto.
 *
 * No están aquí `digest.ts` ni `version.ts` a propósito: cambiar cualquiera de los dos cambia TODAS
 * las huellas, así que incluirlos no añadiría información y sí confusión sobre quién invalidó qué.
 */
export const ARTEFACTOS_SEMANTICOS: readonly string[] = [
  'packages/ingesta/src/reconstruccion-cola/adaptadores.ts',
  'packages/ingesta/src/reconstruccion-cola/bloques-descanso.ts',
  'packages/ingesta/src/reconstruccion-cola/catalogo.ts',
  'packages/ingesta/src/reconstruccion-cola/filas.ts',
  'packages/ingesta/src/reconstruccion-cola/manifiesto.ts',
  'packages/ingesta/src/parsers/nova-equipos.ts',
  'scripts/reconstruir-cola.mjs',
  'scripts/lib/filas-descanso-isquad.mjs',
  'scripts/lib/recolector-local.mjs',
];

export type VersionReconstruccion = {
  /** Huella de conjunto. Es lo que se guarda como `version_extractor` del manifiesto. */
  version: string;
  contrato: number;
  esquema: number;
  /** Huella semántica de cada artefacto: permite decir CUÁL cambió, no sólo que algo cambió. */
  artefactos: Record<string, string>;
};

/**
 * Calcula la versión. `raiz` es obligatoria y explícita: la herramienta se ejecuta también sobre
 * copias (`FACYLF_RAIZ`), y una versión que dependiera de la raíz de la copia mediría otra cosa.
 */
export function versionExtractor(opciones: {
  raiz: string;
  artefactos?: readonly string[];
  versionContrato?: number;
  esquemaManifiesto?: number;
}): VersionReconstruccion {
  const contrato = opciones.versionContrato ?? VERSION_CONTRATO;
  const esquema = opciones.esquemaManifiesto ?? ESQUEMA_MANIFIESTO;
  const artefactos: Record<string, string> = {};
  for (const relativa of opciones.artefactos ?? ARTEFACTOS_SEMANTICOS) {
    artefactos[relativa] = huellaFicheroSemantico(opciones.raiz, relativa);
  }
  // La serialización es canónica: el orden del objeto no depende de cómo se escribió el literal.
  const texto = [
    `contrato=${contrato}`,
    `esquema=${esquema}`,
    ...Object.keys(artefactos).sort().map((r) => `${r}=${artefactos[r]}`),
  ].join('\n');
  const version = huellaDeTexto(texto);
  return { version, contrato, esquema, artefactos };
}

/** sha256 de 16 hex sobre el texto canónico. Se aísla aquí para que la versión no cambie de formato por accidente. */
function huellaDeTexto(texto: string): string {
  return createHash('sha256').update(texto).digest('hex').slice(0, 16);
}
