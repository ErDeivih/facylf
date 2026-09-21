/**
 * Catálogo de inscripciones de UN grupo de UNA temporada.
 *
 * Es la pieza que decide a qué inscripción pertenece un literal de equipo, y la que hace posible que un
 * equipo SIN código federativo siga teniendo una identidad estable dentro de su grupo.
 *
 * Fuentes, por orden de evidencia:
 *
 * 1. las filas del propio calendario que traen código de equipo;
 * 2. la clasificación archivada del grupo, que publica `codequipo=<código>` junto al nombre;
 * 3. los literales del grupo, para el enlace por REFERENCIA CONTEXTUAL.
 *
 * Nunca se cruza el ámbito: el catálogo es de (temporada, competición, grupo) y no se mezcla con otro.
 * Nunca se fabrica un código federativo: cuando la fuente no publica ninguno, la inscripción es el
 * ámbito más el nombre limpio y `codigoExterno` queda nulo.
 */
import { normalizaNombreEquipo, separaNombreYEstado } from '../parsers/nova-equipos.js';

/** De dónde sale una inscripción del catálogo. */
export type ProcedenciaInscripcion = 'calendario' | 'clasificacion' | 'contexto';

export type CatalogoGrupo = {
  /** Código explícito → inscripción, sólo del ámbito de este catálogo. */
  inscripcionPorCodigo: Map<string, string>;
  /** Nombre limpio normalizado → inscripción, **sólo cuando es única** dentro del ámbito. */
  inscripcionPorNombreLimpio: Map<string, string>;
  /** Nombre limpio normalizado → de dónde salió la inscripción. Para poder auditar cada enlace. */
  procedencia: Map<string, ProcedenciaInscripcion>;
  /** Inscripciones que no tienen código federativo: se enlazan por contexto. */
  contextuales: Set<string>;
};

export type EntradaCatalogo = {
  /** Pares (literal, código) leídos del calendario. El código lo publica el propio partido. */
  filasConCodigo: ReadonlyArray<{ literal: string; codigo: string }>;
  /** Pares nombre limpio → código leídos de la clasificación archivada del grupo. */
  paresDeClasificacion: ReadonlyMap<string, string>;
  /** Todos los literales de equipo vistos en el grupo. Es la base del enlace contextual. */
  literales: Iterable<string>;
};

export function construyeCatalogo(entrada: EntradaCatalogo): CatalogoGrupo {
  const inscripcionPorCodigo = new Map<string, string>();
  const codigosPorLimpio = new Map<string, Set<string>>();
  const procedencia = new Map<string, ProcedenciaInscripcion>();

  for (const { literal, codigo } of entrada.filasConCodigo) {
    /*
     * El CÓDIGO entra en el catálogo SIEMPRE, aunque el nombre venga vacío: es identidad fuerte y no
     * necesita que la fuente publique el nombre. Antes se descartaba la fila entera cuando el literal estaba
     * vacío, y con eso el propio código que la fuente sí publica dejaba de resolver:
     *
     *   `resuelveEquipoNova({literal: '', codigoExplicito: '17145319'})` → «el código 17145319 no está en el
     *   catálogo de este grupo» → la reconstrucción no podía demostrar la fila y la declaraba AMBIGUA.
     *
     * Medido en Madrid: **52 filas** del grupo `t17 c18882291 g18850968`, todas con `local = ""` y su código
     * puesto. Con el código en el catálogo, la fila derivada coincide con la de la cola y pasa a ser
     * idéntica —que es lo que es: una fila bien guardada cuyo nombre la fuente no publica—.
     */
    const codigoTexto = String(codigo);
    inscripcionPorCodigo.set(codigoTexto, codigoTexto);
    const limpio = normalizaNombreEquipo(separaNombreYEstado(literal).nombreEquipo);
    if (!limpio) continue;
    if (!codigosPorLimpio.has(limpio)) codigosPorLimpio.set(limpio, new Set());
    codigosPorLimpio.get(limpio)!.add(codigoTexto);
    if (!procedencia.has(limpio)) procedencia.set(limpio, 'calendario');
  }
  for (const [limpio, codigo] of entrada.paresDeClasificacion) {
    const l = normalizaNombreEquipo(limpio);
    if (!l) continue;
    if (!inscripcionPorCodigo.has(String(codigo))) inscripcionPorCodigo.set(String(codigo), String(codigo));
    if (!codigosPorLimpio.has(l)) codigosPorLimpio.set(l, new Set());
    codigosPorLimpio.get(l)!.add(String(codigo));
    // La clasificación es evidencia MÁS DÉBIL que el calendario: no pisa lo que el calendario ya dijo.
    if (!procedencia.has(l)) procedencia.set(l, 'clasificacion');
  }
  const inscripcionPorNombreLimpio = new Map<string, string>();
  for (const [limpio, codigos] of codigosPorLimpio) {
    // Dos códigos para el mismo nombre limpio: detrás hay dos equipos. No se elige ninguno.
    if (codigos.size === 1) inscripcionPorNombreLimpio.set(limpio, [...codigos][0]!);
  }

  // Referencia contextual para lo que no tiene código en NINGUNA representación. Que dos literales den
  // el mismo nombre limpio NO es ambigüedad: `(Sailkatua) BEASAIN S.D.` y `BEASAIN S.D.` son el mismo
  // equipo, y separar el marcador es justo lo que lo demuestra. Lo que sí importa es que los literales
  // no difieran en nada MÁS que el marcador: si difieren, detrás hay dos equipos y el nombre no sirve.
  const literalesPorLimpio = new Map<string, Map<string, number>>();
  for (const literal of entrada.literales) {
    const separado = separaNombreYEstado(literal);
    const limpio = normalizaNombreEquipo(separado.nombreEquipo);
    if (!limpio) continue;
    if (!literalesPorLimpio.has(limpio)) literalesPorLimpio.set(limpio, new Map());
    const formas = literalesPorLimpio.get(limpio)!;
    formas.set(separado.nombreEquipo, (formas.get(separado.nombreEquipo) ?? 0) + 1);
  }
  const contextuales = new Set<string>();
  for (const [limpio, formas] of literalesPorLimpio) {
    if (formas.size !== 1) continue;                                  // dos formas distintas: dos equipos
    if (inscripcionPorNombreLimpio.has(limpio)) continue;             // ya resuelto con código: mejor
    const inscripcion = `contexto:${limpio}`;
    inscripcionPorNombreLimpio.set(limpio, inscripcion);
    procedencia.set(limpio, 'contexto');
    contextuales.add(inscripcion);
  }

  return { inscripcionPorCodigo, inscripcionPorNombreLimpio, procedencia, contextuales };
}
