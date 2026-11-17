import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { mismoOrigen } from '@/lib/seguridad';
import { sesionActual } from '@/lib/sesion';

/** Nombre visible y zona horaria de la cuenta. El user_id sale de la cookie. */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return NextResponse.redirect(new URL('/mi-cuenta?aviso=origen', peticion.url), 303);
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar', peticion.url), 303);
  const datos = await peticion.formData();
  const nombre = String(datos.get('nombre') ?? '').trim();
  const zona = String(datos.get('zona') ?? 'Europe/Madrid');
  if (nombre.length < 1 || nombre.length > 60) return NextResponse.redirect(new URL('/mi-cuenta?aviso=perfil-error', peticion.url), 303);
  try {
    await consulta('select app.guarda_perfil($1, $2, $3)', [sesion.userId, nombre, zona], { rol: 'app' });
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=perfil', peticion.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=perfil-error', peticion.url), 303);
  }
}
