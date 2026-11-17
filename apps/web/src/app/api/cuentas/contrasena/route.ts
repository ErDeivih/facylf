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
  if (!permite(`contrasena:${ipDe(peticion)}`, 10, 15 * 60 * 1000)) return atras(peticion, 'contrasena-error');
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar', peticion.url), 303);
  let datos: FormData;
  try { datos = await peticion.formData(); } catch { return atras(peticion, 'contrasena-error'); }
  const actual = String(datos.get('actual') ?? '');
  const nueva = String(datos.get('nueva') ?? '');
  const repetir = String(datos.get('repetir') ?? '');
  if (!contrasenaValida(nueva) || nueva !== repetir || actual.length === 0) return atras(peticion, 'contrasena-error');
  try {
    const [fila] = await consulta<{ hash_credencial: string | null }>(
      'select app.hash_credencial($1) as hash_credencial', [sesion.userId], { rol: 'app' });
    if (!fila?.hash_credencial || !(await verificaContrasena(actual, fila.hash_credencial))) return atras(peticion, 'contrasena-actual');
    const hash = await hashContrasena(nueva);
    await consulta('select app.cambia_contrasena($1, $2)', [sesion.userId, hash], { rol: 'app' });
    return atras(peticion, 'contrasena');
  } catch {
    return atras(peticion, 'contrasena-error');
  }
}

function atras(peticion: Request, aviso: string): NextResponse {
  return NextResponse.redirect(new URL(`/mi-cuenta?aviso=${aviso}`, peticion.url), 303);
}
