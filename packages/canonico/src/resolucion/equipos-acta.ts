/**
 * Reconciliación entre la pareja de equipos que declara el CALENDARIO y la que declara el ACTA.
 *
 * ## El fallo que motivó esta regla
 *
 * En una liga de número impar de equipos, cada jornada deja a uno descansando y la página de la
 * jornada publica esa fila como un bloque propio (el nombre del equipo y la palabra «Descansa»). En
 * siete de las treinta y ocho jornadas del grupo 11379752 (Tercera Federación de Castilla y León
 * 2024-25) ese bloque aparece **justo antes del primer partido**, y la lectura posicional de la
 * cola tomó el equipo que descansaba como `local` de ese primer partido: el `local` verdadero pasó a
 * ser `visitante` y el `visitante` verdadero se perdió. El `codigo_acta` siguió colgado de la fila,
 * así que las alineaciones, los goles y el cuerpo técnico del acta quedaron atribuidos a dos equipos
 * que no jugaron ese partido, y la clasificación reconstruida se desvió de la oficial en siete de
 * los diecinueve equipos.
 *
 * ## Qué manda aquí
 *
 * El acta es el documento del partido: nombra a los dos equipos y **todo su contenido es relativo a
 * esa pareja** (`participaciones.lado`, `eventos_acta.lado`, `lado_beneficiado`, cuerpo técnico,
 * árbitro y marcador). El calendario manda en la programación (jornada, fecha, hora y campo). Cuando
 * los dos discrepan sobre QUIÉN jugó, manda el acta; pero la discrepancia no se resuelve en
 * silencio: se devuelve clasificada para que el lote la registre.
 *
 * Sólo se corrige cuando la contradicción es demostrable:
 *
 * - **invertido**: el calendario trae la misma pareja con los campos cambiados;
 * - **fuga**: el calendario trae el `local` verdadero como `visitante` delante de un equipo que
 *   **no juega ningún otro partido de esa jornada** (el que descansaba). Sin esa comprobación no se
 *   corrige: un equipo que sí juega otro partido de la misma jornada no puede ser un fantasma.
 *
 * Cualquier otro desacuerdo (**otro**, ni siquiera comparten un equipo) no se puede resolver aquí:
 * no se toca nada y quien llama tiene que detener el lote. Adivinar qué partido describe el acta
 * sería inventar, y un invento así contamina dos equipos a la vez.
 *
 * Este módulo es puro a propósito: no consulta la base, no escribe y se prueba sin PostgreSQL.
 */

export type ParejaEquipos = { local: string; visitante: string };

export type FormaDiscrepancia = 'fuga' | 'invertido' | 'otro';

export type DiscrepanciaEquipos = {
  forma: FormaDiscrepancia;
  /** Lo que dice el calendario de la cola (`partidos.local` / `partidos.visitante`). */
  calendario: ParejaEquipos;
  /** Lo que dice el acta (`actas.datos.local` / `actas.datos.visitante`). */
  acta: ParejaEquipos;
};

export type DecisionEquipos = {
  /**
   * CLAVE de la inscripción que debe ocupar cada lado: su código federativo cuando lo tiene, o
   * `contexto:<normalizado>` cuando la fuente no lo publica. Nunca sale del grupo que se importa.
   *
   * Es una clave y no un código porque un equipo de Euskadi no tiene código —30.314 de sus 34.358
   * partidos no traen ninguno— y sin embargo sí tiene inscripción. Devolver `null` cuando el calendario
   * no traía código dejaba las alineaciones del acta sin equipo y el lote se detenía por «participación
   * sin equipo resoluble»: era el bloqueo que dejaba Euskadi fuera del canónico.
   */
  local: string | null;
  visitante: string | null;
  /** Contradicción demostrable entre el calendario y el acta. `null` si coinciden o no hay acta. */
  discrepancia: DiscrepanciaEquipos | null;
  /** El acta nombra equipos que este grupo no sabe resolver: no se corrige, pero se mide. */
  actaSinResolver: boolean;
  /** `true` sólo cuando los lados del calendario se han sustituido por los del acta. */
  reparado: boolean;
};

export type EntradaReconciliacion = {
  calendario: {
    /**
     * CLAVE ya resuelta de cada lado, la misma que el lote escribió en `core.match`. Se pasa resuelta y
     * no como el código crudo de la cola porque el equipo puede no tener código: quien llama ya tiene la
     * clave, y volver a deducirla aquí duplicaría la regla de resolución.
     */
    localClave: string | null;
    visitanteClave: string | null;
    local: string;
    visitante: string;
  };
  /** Pareja declarada por el acta archivada, si el lote la trae analizada. */
  acta: ParejaEquipos | null;
  /**
   * Nombre normalizado de equipo → CLAVE de inscripción, y SÓLO de los equipos de este grupo.
   *
   * La clave es el código federativo cuando la fuente lo publica, y `contexto:<normalizado>` cuando no.
   * Se llama «clave» y no «código» a propósito: un equipo de Euskadi no tiene código —30.314 de sus
   * 34.358 partidos no traen ninguno— y sin embargo sí tiene identidad dentro de su grupo.
   */
  clavePorNombre: Map<string, string>;
  /** Normalizador ya cacheado (mismo resultado que `core.normaliza_nombre`). Síncrono. */
  normaliza: (texto: string) => string;
  /**
   * ¿El equipo que el calendario pone como `local` juega algún otro partido de esta misma jornada?
   * `false` es lo que convierte una fuga en demostrable.
   */
  localFantasmaJuegaOtroPartido: boolean;
};

const limpio = (valor: unknown): string => String(valor ?? '').replace(/\s+/g, ' ').trim();

/** Lee la pareja de equipos que la propia acta declara en su cabecera. Nunca lanza. */
export function equiposDeclaradosPorActa(datos: string | null | undefined): ParejaEquipos | null {
  const crudo = limpio(datos);
  if (crudo === '') return null;
  let analizado: unknown;
  try {
    analizado = JSON.parse(crudo);
  } catch {
    // Un `datos` ilegible es un acta sin cabecera legible, no un error del lote: se sigue sin
    // reconciliar y el acta entra por la vía de siempre.
    return null;
  }
  if (analizado === null || typeof analizado !== 'object') return null;
  const local = limpio((analizado as Record<string, unknown>).local);
  const visitante = limpio((analizado as Record<string, unknown>).visitante);
  if (local === '' || visitante === '') return null;
  return { local, visitante };
}

export function reconciliaEquiposDelPartido(entrada: EntradaReconciliacion): DecisionEquipos {
  const sinCambios: DecisionEquipos = {
    local: entrada.calendario.localClave,
    visitante: entrada.calendario.visitanteClave,
    discrepancia: null,
    actaSinResolver: false,
    reparado: false,
  };
  const acta = entrada.acta;
  if (!acta) return sinCambios;

  const { normaliza } = entrada;
  const calLocal = normaliza(entrada.calendario.local);
  const calVisitante = normaliza(entrada.calendario.visitante);
  const actaLocal = normaliza(acta.local);
  const actaVisitante = normaliza(acta.visitante);

  // Coinciden: no hay nada que reconciliar y no se toca la fila.
  if (calLocal === actaLocal && calVisitante === actaVisitante) return sinCambios;

  const claveActaLocal = entrada.clavePorNombre.get(actaLocal);
  const claveActaVisitante = entrada.clavePorNombre.get(actaVisitante);
  if (!claveActaLocal || !claveActaVisitante) {
    // El acta nombra equipos que este grupo no conoce (denominación distinta, equipo de otro grupo o
    // de otra temporada). No se corrige nada —resolver por parecido sería inventar— pero quien llama
    // lo registra: es una comprobación que no se ha podido hacer, no una comprobación que salga bien.
    return { ...sinCambios, actaSinResolver: true };
  }

  let forma: FormaDiscrepancia;
  if (calVisitante === actaLocal && calLocal === actaVisitante) {
    forma = 'invertido';
  } else if (calVisitante === actaLocal && calLocal !== actaLocal && calLocal !== actaVisitante
             && !entrada.localFantasmaJuegaOtroPartido) {
    forma = 'fuga';
  } else {
    forma = 'otro';
  }

  const discrepancia: DiscrepanciaEquipos = {
    forma,
    calendario: { local: limpio(entrada.calendario.local), visitante: limpio(entrada.calendario.visitante) },
    acta: { local: limpio(acta.local), visitante: limpio(acta.visitante) },
  };

  // `otro` no se resuelve aquí: quien llama tiene que detener el lote en vez de elegir.
  if (forma === 'otro') return { ...sinCambios, discrepancia };

  return {
    local: claveActaLocal,
    visitante: claveActaVisitante,
    discrepancia,
    actaSinResolver: false,
    reparado: true,
  };
}
