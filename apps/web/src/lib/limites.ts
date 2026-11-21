/**
 * Límites por proceso para la entrada y el alta.
 *
 * El freno principal es por cuenta y vive en la base (`app.espera_entrada`, 0043): 8 fallos en 15
 * minutos. Esto añade un techo por IP en memoria para que un ataque a muchas cuentas o al código de
 * invitación no pueda probar sin coste. Es defensa en profundidad y tiene la limitación de siempre:
 * en memoria vale para este proceso (el servidor de la web es uno); si algún día hay varias
 * instancias, el límite bueno es el de la base. La `ip` se toma de `X-Forwarded-For` porque la web
 * va detrás del proxy local; nunca se guarda ni se registra.
 */

const VENTANA_MS = 10 * 60 * 1000;

const golpes = new Map<string, number[]>();
const MAX_CLAVES = 5_000;

/** ¿Queda margen en esta ventana? Devuelve además cuántos segundos faltan para el siguiente hueco. */
export function permite(clave: string, maximo: number, ventanaMs = VENTANA_MS, ahora = Date.now()): boolean {
  const desde = ahora - ventanaMs;
  const previos = (golpes.get(clave) ?? []).filter((t) => t > desde);
  if (previos.length >= maximo) {
    golpes.set(clave, previos);
    return false;
  }
  previos.push(ahora);
  golpes.set(clave, previos);
  if (golpes.size > MAX_CLAVES) {
    const primera = golpes.keys().next().value;
    if (primera !== undefined) golpes.delete(primera);
  }
  return true;
}

/** Vacía el registro. Se usa en las pruebas para que no arrastren intentos entre casos. */
export function reiniciaLimites(): void {
  golpes.clear();
}

/** Dirección del cliente según la cabecera del proxy. Sólo se usa como clave en memoria. */
export function ipDe(peticion: Request): string {
  // CF/X-Real-IP solo son fiables si la web está detrás de un proxy de confianza que las sobrescribe.
  if (process.env.FACYLF_CONFIANZA_PROXY === '1') {
    const cf = peticion.headers.get('cf-connecting-ip')?.trim();
    if (cf) return cf;
    const real = peticion.headers.get('x-real-ip')?.trim();
    if (real) return real;
  }
  // `X-Forwarded-For` sólo es fiable si el proxy de confianza la sobrescribe. Sin esa configuración
  // se agrupa todo como «local»; aceptar una cabecera del cliente permitiría reiniciar la cuota.
  if (process.env.FACYLF_CONFIANZA_PROXY === '1') {
    const reenviada = peticion.headers.get('x-forwarded-for');
    if (reenviada) {
      const ultima = reenviada.split(',').map((x) => x.trim()).filter(Boolean).at(-1);
      if (ultima) return ultima;
    }
  }
  return 'local';
}
