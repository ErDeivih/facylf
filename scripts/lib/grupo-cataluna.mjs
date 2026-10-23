/**
 * Cuándo se puede pedir el calendario de un grupo de Cataluña, y qué hacer cuando no.
 *
 * ── EL BUCLE QUE ESTO CORTA (medido el 02/10/2026) ───────────────────────────────────────────────────────
 *
 * Cataluña llevaba una semana bajando de 4.685 actas al día a 25-40, con 490 peticiones por hora, y **3.177
 * trabajos de acta disponibles sin que nadie los tocara**. El bucle era éste:
 *
 *   1. De la cola sale la **clasificación** de un grupo (la promoción de ascenso de benjamines, p. ej.).
 *   2. Al abrir el grupo, el recolector lee TAMBIÉN su calendario, y para decidir si lo lee sólo miraba que no
 *      estuviera `hecho` ni `cancelado`. **No miraba si estaba aplazado.**
 *   3. Ese calendario ya estaba citado para el 1 de abril. Se volvía a pedir, volvía a contestar «sin
 *      publicar», y el aplazamiento creciente se apuntaba **al calendario**: de ahí las rachas de 230.
 *   4. La clasificación que había salido de la cola se quedaba en `en_curso`. Como el selector sólo elige
 *      `pendiente` y `bloqueado`, no se volvía a coger… hasta que el arranque de la sesión siguiente devolvía
 *      todos los `en_curso` a `pendiente` (línea 1168 del recolector). Y vuelta a empezar.
 *   5. Cada vuelta contaba como trabajo hecho, así que la sesión agotaba su cupo **sin llegar nunca a las
 *      actas**. Medido: 173 trabajos huérfanos en `en_curso`, y siempre los mismos grupos.
 *
 * La regla que lo corta es una sola frase: **un calendario aplazado no se pide**. Y si lo que salió de la cola
 * es otra cosa (la clasificación), se aplaza a la MISMA fecha sin pedir nada a la web.
 *
 * No cambia el ritmo entre peticiones: sólo evita peticiones que ya se sabía que no iban a servir.
 */

/** Un trabajo del grupo está cerrado y no hay nada que volver a pedir. */
const cerrado = (t) => !t || t.estado === 'hecho' || t.estado === 'cancelado';

/** ¿Su fecha de próximo intento está en el futuro? Sin fecha, no está aplazado. */
export function estaAplazado(trabajo, ahora = new Date()) {
  if (!trabajo?.siguiente_intento) return false;
  const cuando = new Date(trabajo.siguiente_intento);
  if (Number.isNaN(cuando.getTime())) return false;
  return cuando.getTime() > ahora.getTime();
}

/**
 * ¿Se pide el calendario de este grupo, o se aplaza?
 *
 * @param {object} p
 * @param {string} p.clave       clave del trabajo que ha salido de la cola
 * @param {object|null} p.calendario  fila del trabajo `calendario` del mismo grupo, si existe
 * @param {Date} [p.ahora]
 * @returns {{accion: 'pedir'} | {accion: 'aplazar', hasta: Date, motivo: string}}
 */
export function decideLecturaDeGrupo({ clave, calendario, ahora = new Date() }) {
  if (cerrado(calendario)) return { accion: 'pedir' };
  if (!estaAplazado(calendario, ahora)) return { accion: 'pedir' };
  /*
   * El propio calendario es el que salió de la cola. En teoría no puede pasar —el selector respeta
   * `siguiente_intento`—, pero si pasa, manda la cola y se pide: la decisión de elegirlo ya está tomada, y
   * aplazarlo otra vez aquí sería desobedecerla en silencio.
   */
  if (calendario.clave === clave) return { accion: 'pedir' };
  return {
    accion: 'aplazar',
    hasta: new Date(calendario.siguiente_intento),
    motivo: 'el calendario de este grupo está aplazado: no se pide y el grupo espera a la misma fecha',
  };
}

/** Texto corto y humano de una espera, para el registro. */
export function textoDeEspera(hasta, ahora = new Date()) {
  const horas = Math.max(0, Math.round((new Date(hasta).getTime() - ahora.getTime()) / 3_600_000));
  if (horas < 48) return `${horas} h`;
  return `${Math.round(horas / 24)} días`;
}

/*
 * ── «SE AGOTÓ LA ESPERA» NO ES «CHROME SE HA CAÍDO» (medido el 03/10/2026) ──────────────────────────────
 *
 * Cataluña volvió a atascarse con un bucle nuevo y más caro que el anterior:
 *
 *   · 724 peticiones marcadas como fallo de navegador y **6 correctas** en 24 horas;
 *   · siempre las mismas 6 clasificaciones, repetidas entre 91 y 136 veces cada una;
 *   · la página de esos grupos no termina de cargar en 40 s, y salta `Wait timed out`;
 *   · el recolector lo confundía con una caída de Chrome: devolvía el trabajo a la cola para dentro de 5
 *     minutos **sin sumar intento**, cerraba la sesión, y el supervisor abría otra con un Chrome nuevo 20 s
 *     después. Cada sesión hacía UN trabajo —siempre una de esas 6— y terminaba con «0 trabajos».
 *
 * El PC abría y cerraba Chrome unas 50 veces por hora sin sacar nada. Y como el intento no sumaba, la espera
 * nunca escalaba: podía repetirse cada 5 minutos para siempre.
 *
 * La distinción que faltaba es ésta: esperar de más es un problema DE LA PÁGINA, y tirar la sesión no lo
 * arregla —sólo cambia el navegador y vuelve al mismo sitio—. Una caída de verdad es otra cosa, y se nota
 * porque el navegador ya no contesta.
 */

/** El navegador ya no está: eso sí es una caída y hay que reciclar la sesión. */
const CAIDA_DE_NAVEGADOR = /invalid session id|session deleted|chrome not reachable|not connected to devtools|disconnected|timed out receiving message from renderer|no such window|tab crashed/i;

/** Se agotó el tiempo esperando a que la página hiciera algo: es la página, no el navegador. */
const ESPERA_AGOTADA = /wait timed out|timed out after|timed out waiting|script timeout|asynchronous script timeout/i;

export const esCaidaDeNavegador = (mensaje) => CAIDA_DE_NAVEGADOR.test(String(mensaje ?? ''));

export const esEsperaAgotada = (mensaje) => ESPERA_AGOTADA.test(String(mensaje ?? ''));

/**
 * ¿Hay que tratar este error como una caída del navegador?
 *
 * Un error de sesión, sí. Un tiempo agotado, sólo si el navegador además no responde — y para saberlo hay que
 * preguntárselo, que es lo que hace el recolector con `navegadorResponde(driver)`. Sin esa comprobación, cada
 * página lenta cuesta un Chrome nuevo.
 */
export function esCaidaQueRecicla(mensaje, { navegadorVivo = true } = {}) {
  if (esCaidaDeNavegador(mensaje)) return true;
  if (esEsperaAgotada(mensaje)) return !navegadorVivo;
  return false;
}

/**
 * ¿Cuánto esperar tras un fallo del navegador?
 *
 * Cinco minutos está bien para un tropiezo, pero si el intento no se cuenta la espera nunca sube y el mismo
 * trabajo se repite cada cinco minutos para siempre. Al tercero, como los demás errores: 24 horas.
 */
export function esperaTrasFalloDeNavegador(intentos) {
  return Number(intentos) >= 3 ? 24 * 3_600_000 : 5 * 60_000;
}
