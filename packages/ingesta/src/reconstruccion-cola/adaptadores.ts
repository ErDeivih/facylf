/**
 * Adaptadores de reconstrucción: qué maqueta usa cada federación, con qué extractor se lee su jornada
 * archivada y si su resolución está cerrada.
 *
 * Está separado del resto de la herramienta a propósito: así el adaptador de una federación se puede
 * cambiar —o declarar «todavía no»— sin tocar la lógica de simulación, aplicación y reversión, y ese
 * cambio entra en la huella de versión aunque no se toque ningún otro fichero.
 *
 * El NOMBRE del extractor se declara aquí y la FUNCIÓN vive en `scripts/lib/recolector-local.mjs`, que
 * también entra en la huella. Así este módulo no depende de un `.mjs` y sigue siendo tipable.
 */

/**
 * Maqueta del portal. «nova» es la de Euskadi; «pnfg» la clásica de las federaciones de gestor; **«isquad»
 * es la de Madrid y Valencia**, que no se parece a ninguna de las otras dos: la jornada archivada es un
 * JSON, los equipos traen SIEMPRE código, la clasificación viene en `clasificacion.json` y el bloque de
 * descanso se reconoce por **código de equipo negativo**, no por el literal.
 */
export type Maqueta = 'nova' | 'pnfg' | 'isquad';

/** Extractor de la jornada archivada. La función correspondiente la resuelve el CLI. */
export type NombreExtractor = 'widget' | 'clasica' | 'isquad';

/**
 * `nova` = hay adaptador de resolución y la reconstrucción se puede simular.
 * `pendiente` = la federación está declarada, pero su resolución no está cerrada y la reconstrucción
 * NO se ejecuta. Es el caso de la Clase B de las PNFG: mientras el extractor clásico no se corrija, la
 * fila de la cola no es la que dice su HTML y reconstruirla escribiría otra cosa.
 */
export type EstadoResolucion = 'nova' | 'pendiente';

export type Adaptador = {
  maqueta: Maqueta;
  extractor: NombreExtractor;
  resolucion: EstadoResolucion;
};

export const ADAPTADORES: Readonly<Record<string, Adaptador>> = {
  euskadi: { maqueta: 'nova', extractor: 'widget', resolucion: 'nova' },
  /*
   * iSquad: Madrid y Valencia. Su resolución SÍ está cerrada y por eso van con `nova` —la etiqueta quiere
   * decir «se puede simular», no «maqueta nova»—: los equipos traen código siempre (medido el 17/09/2026:
   * 53.119 de 53.119 filas en Madrid y 30.977 de 30.977 en Valencia con los DOS códigos), así que la
   * identidad se resuelve por código y no por parecido de nombre. Su evidencia de descanso es otra y vive en
   * `scripts/lib/filas-descanso-isquad.mjs`.
   */
  madrid: { maqueta: 'isquad', extractor: 'isquad', resolucion: 'nova' },
  valencia: { maqueta: 'isquad', extractor: 'isquad', resolucion: 'nova' },
  // Las PNFG comparten maqueta clásica. Declaradas para que su adaptador enchufe aquí sin tocar el
  // resto de la herramienta; hasta entonces `resolucion: 'pendiente'` las rechaza en voz alta.
  'castilla-leon': { maqueta: 'pnfg', extractor: 'clasica', resolucion: 'pendiente' },
  aragon: { maqueta: 'pnfg', extractor: 'clasica', resolucion: 'pendiente' },
  'castilla-la-mancha': { maqueta: 'pnfg', extractor: 'clasica', resolucion: 'pendiente' },
  rioja: { maqueta: 'pnfg', extractor: 'clasica', resolucion: 'pendiente' },
  ceuta: { maqueta: 'pnfg', extractor: 'clasica', resolucion: 'pendiente' },
};

/** El adaptador declarado, exista o no resolución cerrada. Lanza si la federación no está declarada. */
export function adaptadorDe(federacion: string): Adaptador {
  const adaptador = ADAPTADORES[federacion];
  if (!adaptador) {
    throw new Error(
      `No hay adaptador de reconstrucción para la federación «${federacion}». `
      + `Declaradas: ${Object.keys(ADAPTADORES).sort().join(', ')}.`,
    );
  }
  return adaptador;
}

/**
 * El adaptador, pero rechazando la federación cuyo adaptador todavía no está cerrado. Esta es la puerta
 * que impide que una reconstrucción se ejecute sobre una maqueta cuya fila no se sabe leer: rechazar
 * es la respuesta correcta, no intentarlo y dejar un lote a medias.
 */
export function exigeAdaptadorListo(federacion: string): Adaptador {
  const adaptador = adaptadorDe(federacion);
  if (adaptador.resolucion === 'pendiente') {
    throw new Error(
      `La reconstrucción de «${federacion}» (maqueta ${adaptador.maqueta}) todavía no tiene adaptador de `
      + 'resolución: la Clase B necesita primero su corrección de extractor. No se simula nada.',
    );
  }
  return adaptador;
}
