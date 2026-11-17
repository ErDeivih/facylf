import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { hashContrasena, verificaContrasena } from '@/lib/contrasenas';
import { contrasenaValida } from '@/lib/cuentas';
import { ipDe, permite } from '@/lib/limites';
import { mismoOrigen } from '@/lib/seguridad';
import { sesionActual } from '@/lib/sesion';

/** Cambio de contraseña de la cuenta con sesión. La identidad sale de la cookie, nunca del formulario. */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return atras(peticion, 'origen');
  if (!permite(`contrasena:${ipDe(peticion)}`, 10, 15 * 60 * 1000)) return atras(peticion, 'intentos');
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar', peticion.url), 303);
  let datos: FormData;
  try { datos = await peticion.formData(); } catch { return atras(peticion, 'datos'); }
  const actual = String(datos.get('actual') ?? '');
  const nueva = String(datos.get('nueva') ?? '');
  const repetir = String(datos.get('repetir') ?? '');
  if (!contrasenaValida(nueva) || nueva !== repetir || actual.length === 0) return atras(peticion, 'datos');
  try {
    const filas = await consulta<{ password_hash: string }>(
      'select password_hash from app.credencial where user_id = $1', [sesion.userId], { rol: 'app' });
    if (!filas[0] || !(await verificaContrasena(actual, filas[0].password_hash))) return atras(peticion, 'actual');
    const hash = await hashContrasena(nueva);
    await consulta('update app.credencial set password_hash = $2, actualizado_en = now() where user_id = $1',
      [sesion.userId, hash], { rol: 'app' });
    return atras(peticion, 'hecho');
  } catch {
    return atras(peticion, 'error');
  }
}

function atras(peticion: Request, aviso: string): NextResponse {
  return NextResponse.redirect(new URL(`/mi-cuenta?aviso=${aviso}`, peticion.url), 303);
}
