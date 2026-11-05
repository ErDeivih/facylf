import { urlVolverSegura } from './cuentas';

/**
 * Comprobaciones de seguridad de las mutaciones (route handlers).
 *
 * CSRF: el navegador manda `Origin` en todo POST. Se exige que coincida con el `Host` de la petición
 * y, si viene `Sec-Fetch-Site`, que no sea de otro sitio. `curl` puede probar los endpoints enviando
 * la cabecera `Origin` correcta, que es justo lo que hace un navegador.
 *
 * Esto no sustituye a `SameSite=Lax` en la cookie: son dos capas.
 */
export function mismoOrigen(peticion: Request): boolean {
  const origen = peticion.headers.get('origin');
  const host = peticion.headers.get('host');
  if (!origen || !host) return false;
  let hostDelOrigen: string;
  try {
    hostDelOrigen = new URL(origen).host;
  } catch {
    return false;
  }
  if (hostDelOrigen !== host) return false;
  const sitio = peticion.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin' && sitio !== 'none') return false;
  return true;
}

/** Ruta interna del `Referer`, para volver tras un formulario sin JavaScript. */
export function rutaDeVuelta(peticion: Request): string | null {
  const referer = peticion.headers.get('referer');
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== peticion.headers.get('host')) return null;
    return urlVolverSegura(`${url.pathname}${url.search}`);
  } catch {
    return null;
  }
}
