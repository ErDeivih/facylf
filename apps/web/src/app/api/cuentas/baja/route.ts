import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { mismoOrigen } from '@/lib/seguridad';
import { sesionActual, terminaSesion } from '@/lib/sesion';

/** Baja de cuenta: borra favoritos/preferencias/avisos y anonimiza el perfil (0037). */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return NextResponse.redirect(new URL('/mi-cuenta?aviso=origen', peticion.url), 303);
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar', peticion.url), 303);
  try {
    await consulta('select app.baja_usuario($1, $2)', [sesion.userId, 'solicitud desde Mi cuenta'], { rol: 'app' });
    await terminaSesion();
    return NextResponse.redirect(new URL('/?baja=hecha', peticion.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-error', peticion.url), 303);
  }
}
