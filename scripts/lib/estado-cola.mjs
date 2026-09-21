/*
 * QUÉ LE QUEDA A UNA COLA, Y QUÉ CONVIENE HACER CON SU CONTENEDOR.
 *
 * Este módulo existe para que **no haya dos criterios** sobre la misma pregunta. Antes había uno solo, dentro de
 * `proximo-trabajo.mjs` (cuánto esperar antes de la siguiente tanda), y ahora hay dos consumidores:
 *
 *   · `proximo-trabajo.mjs` — el supervisor de cada federación (Windows y contenedor) decide con él cuándo
 *     relanzar el worker;
 *   · `ajustar-flota.mjs` — decide qué contenedores merecen estar levantados y cuáles se paran para devolver
 *     capacidad a la máquina cuando su federación ya no tiene trabajo.
 *
 * Si cada uno leyera la cola a su manera, la flota podría parar un contenedor que sí tenía trabajo (o mantener
 * diecisiete navegadores despiertos para nada). Así que la lectura y las decisiones viven aquí, y los dos guiones
 * son envoltorios finos.
 *
 * ── LO QUE SE CONSIDERA «TRABAJO DISPONIBLE AHORA» ─────────────────────────────────────────────────────────
 *
 * Exactamente lo mismo que el worker: `siguienteTrabajo()` en `lib/recolector-local.mjs` elige entre
 * `pendiente` y `bloqueado` cuya fecha de reintento ya ha llegado, excluyendo las temporadas por debajo del
 * suelo. Medido el 19/09/2026: `proximo-trabajo.mjs` sólo miraba `pendiente`/`en_curso`, así que un trabajo
 * `bloqueado` con la fecha de reintento vencida —que el worker SÍ coge— no contaba como disponible y el
 * supervisor podía esperar hasta cinco minutos de más. Los trabajos de temporadas antiguas tampoco deben contar:
 * están aplazados y no se van a trabajar, y contarlos mantenía contenedores despiertos para nada.
 *
 * ── DESCONOCIDO NO ES CERO ─────────────────────────────────────────────────────────────────────────────────
 *
 * Si la cola no existe o no se puede abrir, esto devuelve `{ legible: false, motivo }`. Quien lo use NO debe
 * suponer que la federación ha terminado: no se para un contenedor por no haber podido leer su cola.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { TEMPORADA_MINIMA, sqlExcluyeTemporadasViejas } from './temporada-minima.mjs';
import { diaDeMadrid } from './dia-madrid.mjs';

/** A partir de cuándo sale más a cuenta parar el contenedor y volver a levantarlo que dejarlo esperando. */
export const HORIZONTE_OCIOSO_MS = 2 * 60 * 60_000;

/**
 * Cuánto esperar antes de relanzar cuando la sesión anterior no pudo abrir navegador por falta de memoria de la
 * MÁQUINA. Cinco minutos: el problema no es de la federación, es de que el equipo está lleno, y volver a intentarlo
 * cada veinte segundos solo hace ruido.
 */
export const ESPERA_TRAS_MEMORIA_MS = 5 * 60_000;

/**
 * Lee el estado de una cola. `ahoraMs` se puede fijar para las pruebas.
 *
 * Devuelve, si se puede leer: trabajos disponibles YA (`listos`), trabajos que quedan en total (`pendientes`),
 * los aplazados y la fecha del próximo (`proximoIntento`), más la pausa global y el presupuesto diario, que son
 * las dos razones por las que puede haber trabajo «disponible» sin que nadie deba abrir un navegador.
 */
export function leeEstadoDeCola(ruta, { ahoraMs = Date.now() } = {}) {
  if (!ruta || !existsSync(ruta)) return { legible: false, motivo: 'no existe la cola' };
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch (error) {
    return { legible: false, motivo: `no se pudo abrir la cola: ${error.message}` };
  }
  try {
    const ahora = new Date(ahoraMs).toISOString();
    const excluyeViejas = sqlExcluyeTemporadasViejas('trabajos');
    const fila = (sql, ...parametros) => db.prepare(sql).get(...parametros) ?? {};

    const listos = fila(`select count(*) n from trabajos
      where estado in ('pendiente','bloqueado')
        and (siguiente_intento is null or siguiente_intento <= ?)
        and ${excluyeViejas}`, ahora, TEMPORADA_MINIMA).n ?? 0;

    const pendientes = fila(`select count(*) n from trabajos
      where estado in ('pendiente','bloqueado') and ${excluyeViejas}`, TEMPORADA_MINIMA).n ?? 0;

    const aplazado = fila(`select count(*) n, min(siguiente_intento) t from trabajos
      where estado in ('pendiente','bloqueado')
        and siguiente_intento is not null and siguiente_intento > ?
        and ${excluyeViejas}`, ahora, TEMPORADA_MINIMA);

    const pausaHasta = fila("select valor from metadatos where clave='pausa_global_hasta'").valor ?? null;
    const limiteDiario = Number(fila("select valor from metadatos where clave='diario_max'").valor ?? 0);
    const usadasHoy = peticionesDelDia(db, diaDeMadrid(ahoraMs));
    /*
     * Por qué terminó la sesión anterior cuando no pudo abrir navegador: `turno` (hay más federaciones que plazas,
     * lo normal) o `memoria` (a la máquina le queda menos que su reserva). Eso último no se arregla relanzando cada
     * veinte segundos, así que el supervisor espera un poco más.
     */
    const salidaMotivo = fila("select valor from metadatos where clave='ultima_salida_motivo'").valor ?? null;
    const salidaEn = fila("select valor from metadatos where clave='ultima_salida_en'").valor ?? null;
    const salidaMs = Date.parse(salidaEn ?? '');
    const salidaPorMemoriaReciente = salidaMotivo === 'memoria'
      && Number.isFinite(salidaMs) && (ahoraMs - salidaMs) < ESPERA_TRAS_MEMORIA_MS;

    return {
      legible: true,
      listos,
      pendientes,
      aplazados: aplazado.n ?? 0,
      proximoIntento: aplazado.t ?? null,
      pausaHasta,
      enPausa: Boolean(pausaHasta && Date.parse(pausaHasta) > ahoraMs),
      limiteDiario,
      usadasHoy,
      presupuestoGastado: limiteDiario > 0 && usadasHoy >= limiteDiario,
      salidaMotivo,
      salidaPorMemoriaReciente,
    };
  } catch (error) {
    return { legible: false, motivo: `no se pudo leer la cola: ${error.message}` };
  } finally {
    try { db.close(); } catch { /* ya cerrada */ }
  }
}

/**
 * Peticiones de un día de Madrid.
 *
 * Se cuenta por la columna `peticiones.dia_madrid` (la escribe el recolector al registrar cada petición) y, si
 * la cola todavía no la tiene —una cola que no ha pasado por `abreBase` en esta versión o abierta en sólo
 * lectura—, se cuenta por la fecha de la marca de tiempo, que es como se contaba antes. Preferimos contar de
 * más a dejar sin cupo a una federación.
 */
export function peticionesDelDia(db, dia) {
  try {
    return Number(db.prepare('select count(*) n from peticiones where dia_madrid = ?').get(dia)?.n ?? 0);
  } catch {
    return Number(db.prepare('select count(*) n from peticiones where substr(iniciada_en, 1, 10) = ?')
      .get(dia)?.n ?? 0);
  }
}

/**
 * Cuántos segundos conviene esperar antes de la siguiente tanda. Es el contrato de `proximo-trabajo.mjs`:
 * 0 si hay trabajo ya; los segundos que faltan si todo está aplazado; y los topes de siempre (una hora con el
 * presupuesto diario gastado, cinco minutos si no hay nada que decir).
 *
 * El orden importa y es el mismo de siempre: primero la pausa global (si la federación está en pausa preventiva
 * hay trabajos «disponibles» pero el worker sale sin hacer nada), después el presupuesto diario, y sólo entonces
 * los trabajos.
 */
export function segundosDeEspera(estado, { ahoraMs = Date.now() } = {}) {
  if (!estado?.legible) return 300;
  if (estado.enPausa) {
    return Math.max(1, Math.round((Date.parse(estado.pausaHasta) - ahoraMs) / 1000));
  }
  if (estado.presupuestoGastado) return 3600;
  /*
   * Si la última sesión se fue por falta de memoria de la máquina, se espera un poco antes de volver: relanzar de
   * inmediato solo repite el mismo intento. Va antes de «hay trabajo → 0 s» a propósito, porque el trabajo está
   * disponible pero el navegador no se puede abrir.
   */
  if (estado.salidaPorMemoriaReciente) return ESPERA_TRAS_MEMORIA_MS / 1000;
  if (estado.listos > 0) return 0;
  if (!estado.proximoIntento) return 300;
  return Math.max(0, Math.round((Date.parse(estado.proximoIntento) - ahoraMs) / 1000));
}

/** Milisegundos que quedan hasta la medianoche de Madrid (más cinco minutos de colchón). */
export function msHastaMedianocheDeMadrid(ahoraMs = Date.now()) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ahoraMs));
  const parte = (tipo) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const transcurrido = (parte('hour') * 3600 + parte('minute') * 60 + parte('second')) * 1000;
  return Math.max(0, 86_400_000 - transcurrido) + 5 * 60_000;
}

/**
 * Decide, federación a federación, si su contenedor debe estar levantado. Devuelve una lista con una decisión por
 * entrada, sin tocar nada: aplicar es cosa de quien llama.
 *
 *   · `arriba`   — hay trabajo ahora, o tan pronto que no compensa parar y volver a levantar;
 *   · `abajo`    — no queda trabajo (la federación ha terminado) o todo está tan lejos que se levanta entonces;
 *   · `no-tocar` — no se pudo leer la cola: ni se levanta ni se para, no se decide a ciegas.
 *
 * `reanudarEn` es la fecha en la que hay que volver a levantar el contenedor (o `null` si no queda nada).
 */
export function decideFlota(entradas, { ahoraMs = Date.now(), horizonteMs = HORIZONTE_OCIOSO_MS } = {}) {
  const minutosHorizonte = Math.round(horizonteMs / 60_000);
  return entradas.map(({ federacion, servicio, estado }) => {
    if (!estado?.legible) {
      return {
        federacion, servicio, accion: 'no-tocar', reanudarEn: null, listos: null, pendientes: null,
        motivo: `no se puede leer la cola (${estado?.motivo ?? 'motivo desconocido'}): se deja como está`,
      };
    }
    const comun = {
      federacion, servicio, listos: estado.listos, pendientes: estado.pendientes,
    };

    // Cuándo habría trabajo otra vez: cuando acabe la pausa, cuando venza el próximo aplazado o mañana, si lo que
    // impide trabajar es el presupuesto diario.
    const candidatas = [estado.pausaHasta, estado.proximoIntento]
      .map((sello) => Date.parse(sello ?? ''))
      .filter((t) => Number.isFinite(t) && t > ahoraMs);
    if (estado.presupuestoGastado) candidatas.push(ahoraMs + msHastaMedianocheDeMadrid(ahoraMs));
    const reanudarEn = candidatas.length ? new Date(Math.min(...candidatas)).toISOString() : null;
    const esperaSobre = (reanudarEn ? Date.parse(reanudarEn) : Infinity) - ahoraMs;

    if (estado.listos > 0 && !estado.enPausa && !estado.presupuestoGastado) {
      return { ...comun, accion: 'arriba', reanudarEn: null, motivo: `${estado.listos} trabajo(s) disponibles ahora` };
    }
    if (estado.pendientes === 0) {
      return {
        ...comun, accion: 'abajo', reanudarEn: null,
        motivo: 'no queda ningún trabajo en la cola: esta federación ha terminado',
      };
    }
    if (esperaSobre <= horizonteMs) {
      return {
        ...comun, accion: 'arriba', reanudarEn,
        motivo: `${estado.pendientes} trabajo(s), el siguiente ${reanudarEn}: dentro del horizonte de ${minutosHorizonte} min, se deja levantado`,
      };
    }
    return {
      ...comun, accion: 'abajo', reanudarEn,
      motivo: `${estado.pendientes} trabajo(s) aplazados hasta ${reanudarEn ?? 'una fecha sin determinar'}: se para y se levanta entonces`,
    };
  });
}
