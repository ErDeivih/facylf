/**
 * Construcción de la fila derivada de `partidos` a partir de la fila del HTML archivado.
 *
 * Ésta es la pieza cuyo cambio **no** invalidaba el manifiesto en el diseño anterior: se podía alterar
 * la forma de la fila, dejar la versión intacta y aplicar un lote calculado con una regla ya
 * inexistente. Por eso vive aquí, en un módulo declarado en `ARTEFACTOS_SEMANTICOS`.
 *
 * Dos reglas que no son obvias y por eso están escritas:
 *
 * 1. **el nombre se guarda limpio**: un marcador de estado como `(Sailkatua)` no forma parte del
 *    nombre del equipo, y separarlo es lo que hace que el calendario y el acta hablen del mismo
 *    equipo. El literal original NO se pierde: queda como procedencia en el manifiesto y en el diario;
 * 2. **el código sólo se escribe si la resolución lo demuestra**. `codigoExterno` es nulo cuando la
 *    fuente no publica código; no se fabrica ninguno y no se copia un código de otro ámbito.
 */
import { huella } from './digest.js';
import { separaNombreYEstado } from '../parsers/nova-equipos.js';
import type { ResolucionEquipoNova } from '../parsers/nova-equipos.js';

/** La fila de `partidos` tal y como se lee de la cola. */
export type FilaCola = {
  jornada: number;
  orden: number;
  codigo_acta: string | null;
  equipo_local_codigo: string | null;
  equipo_visitante_codigo: string | null;
  local: string;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
  fecha: string | null;
  hora: string | null;
  campo: string | null;
  campo_codigo: string | null;
  arbitro: string | null;
};

/** Un equipo tal y como lo publica la fila del HTML de la jornada. */
export type EquipoExtraido = {
  local: string;
  visitante: string;
  codLocal: string | null;
  codVisitante: string | null;
};

/**
 * Huella de una fila derivada: lo que se compara para saber si la fila cambió desde la simulación.
 *
 * `actualizado_en` NO entra. La escribe cada UPDATE, así que incluirla haría que toda fila pareciera
 * cambiada desde el lote anterior, y ni la verificación ni la reversión podrían distinguir un cambio
 * real de la marca de tiempo que ellas mismas acaban de poner.
 */
export function huellaFila(fila: Partial<FilaCola> | null | undefined): string {
  if (!fila) return 'ausente';
  return huella(JSON.stringify([
    fila.jornada, fila.orden, fila.codigo_acta, fila.equipo_local_codigo, fila.equipo_visitante_codigo,
    fila.local, fila.visitante, fila.goles_local, fila.goles_visitante, fila.fecha, fila.hora,
    fila.campo, fila.campo_codigo, fila.arbitro,
  ]));
}

/**
 * La fila que la reconstrucción escribiría. Sólo cambia los cuatro campos que la reconstrucción
 * decide —los dos códigos y los dos literales— y conserva intacto todo lo demás: marcador, fecha,
 * hora, campo y árbitro son de la cola y no se tocan.
 */
export function construyeFilaDerivada(datos: {
  fila: FilaCola;
  delHtml: EquipoExtraido;
  calLocal: ResolucionEquipoNova;
  calVisit: ResolucionEquipoNova;
}): FilaCola {
  const { fila, delHtml, calLocal, calVisit } = datos;
  return {
    jornada: fila.jornada,
    orden: fila.orden,
    codigo_acta: fila.codigo_acta,
    equipo_local_codigo: calLocal.codigoExterno,
    equipo_visitante_codigo: calVisit.codigoExterno,
    local: separaNombreYEstado(delHtml.local).nombreEquipo,
    visitante: separaNombreYEstado(delHtml.visitante).nombreEquipo,
    goles_local: fila.goles_local,
    goles_visitante: fila.goles_visitante,
    fecha: fila.fecha,
    hora: fila.hora,
    campo: fila.campo,
    campo_codigo: fila.campo_codigo,
    arbitro: fila.arbitro,
  };
}

/** ¿La fila derivada es distinta de la que hay en la cola? */
export function cambioDeFila(actual: FilaCola, derivada: FilaCola): boolean {
  return huellaFila(actual) !== huellaFila(derivada);
}

/** ¿La corrección recupera algún código federativo que la cola no tenía? */
export function recuperaCodigo(actual: FilaCola, derivada: FilaCola): boolean {
  return (actual.equipo_local_codigo === null && derivada.equipo_local_codigo !== null)
    || (actual.equipo_visitante_codigo === null && derivada.equipo_visitante_codigo !== null);
}
