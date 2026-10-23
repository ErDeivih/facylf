/**
 * Cuánto esperar antes de volver a mirar un grupo cuyo calendario todavía no está publicado.
 *
 * ── POR QUÉ EXISTE (diagnosticado el 30/09/2026) ─────────────────────────────────────────────────────────
 *
 * Cataluña llevaba cuatro días sin guardar ni un acta. No era un bloqueo ni el aviso de cookies: la cola
 * elige siempre la temporada más nueva primero (`prioridadPlaneada`), y la 2026-27 tenía unos 3.300 grupos
 * creados en el selector pero con el calendario vacío (sobre todo «Promoció ascens…» y fútbol base que
 * empieza en octubre). Cada uno se reintentaba a las 48 h **para siempre**, así que las 6.600 visitas de esos
 * días se fueron en «el calendario no muestra ninguna jornada» y a las actas no les llegaba nunca el turno.
 *
 * Regla aprobada por David el 30/09/2026 («Espera creciente + promociones a abril»):
 *   · calendario sin publicar: 48 h, luego 4 días, luego 8 días y como máximo 14 días;
 *   · las competiciones de promoción o ascenso **de la temporada en curso** no se vuelven a mirar hasta el
 *     1 de abril (hora de Madrid), porque se juegan al final. Si ya pasó el 1 de abril, escalera normal.
 *
 * No cambia el ritmo entre peticiones: sólo decide CUÁNDO vuelve a ser elegible un trabajo.
 *
 * La racha se cuenta en la columna propia `trabajos.sin_publicar_seguidos` y no en `intentos`, porque
 * `intentos` también sube con cada «hecho» (marcaTrabajo lo incrementa siempre): una clasificación
 * reactivada para el repaso semanal saltaría directamente a 14 días al primer vacío pasajero.
 */

const HORA_MS = 3_600_000;

/** Escalera en horas: 1.ª vez sin publicar, 2.ª, 3.ª y a partir de la 4.ª. */
export const ESCALERA_SIN_PUBLICAR_HORAS = Object.freeze([48, 96, 192, 336]);

/** «Promoció», «Promoción», «ascens», «ascenso»… en catalán y castellano. */
export function esCompeticionDeFinalDeTemporada(nombre) {
  return /promoci|ascens/i.test(String(nombre ?? ''));
}

/** Medianoche del 1 de abril en Madrid (horario de verano, UTC+2) del año en que acaba la temporada. */
export function unoDeAbrilDeLaTemporada(anioInicio) {
  return new Date(Date.UTC(Number(anioInicio) + 1, 3, 1, 0, 0, 0) - 2 * HORA_MS);
}

/**
 * @param {object} p
 * @param {number} p.racha        veces seguidas sin publicar, CONTANDO la de ahora (1 = primera).
 * @param {boolean} p.esTemporadaActual
 * @param {number|null} p.anioInicio  año de inicio de la temporada del trabajo (2026 para 2026-27).
 * @param {string|null} p.nombreCompeticion
 * @param {Date} [p.ahora]
 * @returns {{ hasta: Date, texto: string, motivo: 'promocion'|'escalera' }}
 */
export function esperaSinPublicar({ racha, esTemporadaActual, anioInicio, nombreCompeticion, ahora = new Date() }) {
  if (esTemporadaActual && anioInicio != null && esCompeticionDeFinalDeTemporada(nombreCompeticion)) {
    const abril = unoDeAbrilDeLaTemporada(anioInicio);
    if (abril.getTime() > ahora.getTime()) {
      return { hasta: abril, texto: 'el 1 de abril (promoción de final de temporada)', motivo: 'promocion' };
    }
  }
  const paso = Math.min(Math.max(1, Number(racha) || 1), ESCALERA_SIN_PUBLICAR_HORAS.length) - 1;
  const horas = ESCALERA_SIN_PUBLICAR_HORAS[paso];
  const texto = horas < 72 ? `${horas} h` : `${horas / 24} días`;
  return { hasta: new Date(ahora.getTime() + horas * HORA_MS), texto: `en ${texto}`, motivo: 'escalera' };
}

/** Patrones del `ultimo_error` que el recolector de Cataluña emite cuando el grupo aún no tiene datos. */
const ERRORES_SIN_PUBLICAR = ['%no muestra ninguna jornada%', '%sin datos publicados%'];

/**
 * Crea la columna de la racha si falta. Sólo la vez que la crea, siembra la racha de los trabajos que YA
 * estaban atascados con `intentos`, para que no repitan otra vuelta completa de 48 h: esa vuelta es
 * justo lo que ahogó las actas. Es idempotente.
 * @returns {{ creada: boolean, sembrados: number }}
 */
export function preparaRachaSinPublicar(db) {
  const existe = db.prepare('pragma table_info(trabajos)').all().some((c) => c.name === 'sin_publicar_seguidos');
  if (existe) return { creada: false, sembrados: 0 };
  db.exec('alter table trabajos add column sin_publicar_seguidos integer not null default 0');
  const donde = ERRORES_SIN_PUBLICAR.map(() => 'ultimo_error like ?').join(' or ');
  const r = db.prepare(`update trabajos set sin_publicar_seguidos = max(intentos, 1)
    where estado in ('pendiente','bloqueado') and (${donde})`).run(...ERRORES_SIN_PUBLICAR);
  return { creada: true, sembrados: Number(r.changes ?? 0) };
}
