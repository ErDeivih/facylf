/**
 * Límite de peticiones de la API pública (WALL objetivo 6).
 *
 * Es un límite **por IP y por proceso**: la instancia es una sola y privada, y no hay Redis ni proxy
 * delante que reparta. Se documenta como tal: no es una defensa contra un ataque distribuido, es un
 * cortafuegos para que un script descontrolado no convierta la API en un generador de consultas.
 *
 * La ventana es de un minuto. La primera petición abre la ventana; al superar el máximo se responde 429
 * con `Retry-After` hasta que la ventana se cierra. No se guarda nada entre reinicios.
 */

/** Peticiones permitidas por IP dentro de una ventana de un minuto. */
export const LIMITE_POR_MINUTO = 300;

/** Duración de la ventana. */
export const VENTANA_MS = 60_000;

/** Máximo de claves recordadas. Al pasar, se limpian las ventanas caducadas (no crece sin freno). */
const MAXIMO_CLAVES = 10_000;

type Ventana = { inicio: number; cuenta: number };

const ventanas = new Map<string, Ventana>();

export type ResultadoLimite =
  | { permitido: true }
  | { permitido: false; retryAfterSegundos: number };

/**
 * Apunta una petición de `clave` (la IP) en el instante `ahora` y dice si se permite.
 *
 * `ahora` se puede inyectar para probar la ventana sin esperar un minuto de verdad.
 */
export function limitePorIp(clave: string, ahora: number = Date.now()): ResultadoLimite {
  const ventana = ventanas.get(clave);
  if (!ventana || ahora - ventana.inicio >= VENTANA_MS) {
    if (ventanas.size >= MAXIMO_CLAVES) limpiaVentanasCaducadas(ahora);
    ventanas.set(clave, { inicio: ahora, cuenta: 1 });
    return { permitido: true };
  }
  if (ventana.cuenta >= LIMITE_POR_MINUTO) {
    const restanteMs = VENTANA_MS - (ahora - ventana.inicio);
    return { permitido: false, retryAfterSegundos: Math.max(1, Math.ceil(restanteMs / 1000)) };
  }
  ventana.cuenta += 1;
  return { permitido: true };
}

function limpiaVentanasCaducadas(ahora: number): void {
  for (const [clave, ventana] of ventanas) {
    if (ahora - ventana.inicio >= VENTANA_MS) ventanas.delete(clave);
  }
}

/** Vacía el registro. Sólo para pruebas: en producción el estado vive mientras viva el proceso. */
export function reiniciaLimitesApi(): void {
  ventanas.clear();
}
