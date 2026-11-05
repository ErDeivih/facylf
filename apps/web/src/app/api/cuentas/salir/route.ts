import { NextResponse } from 'next/server';
import { terminaSesion } from '@/lib/sesion';
import { mismoOrigen } from '@/lib/seguridad';

/**
 * Cierre de sesión. Borra la fila de `app.sesion` (con el SHA-256 del token) y la cookie.
 *
 * Es un POST con comprobación de `Origin`: un enlace GET que cierre la sesión se puede provocar
 * desde otro sitio y además lo precarga el navegador.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) {
    return NextResponse.redirect(new URL('/entrar?aviso=origen', peticion.url), 303);
  }
  await terminaSesion();
  return NextResponse.redirect(new URL('/entrar?aviso=saliste', peticion.url), 303);
}
