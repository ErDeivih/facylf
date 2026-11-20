import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { sha256Hex, verificaContrasena } from '@/lib/contrasenas';
import { sesionActual, terminaSesion, SESION_COOKIE } from '@/lib/sesion';
import { mismoOrigen } from '@/lib/seguridad';
import { ipDe, permite } from '@/lib/limites';

/**
 * Baja de cuenta: borra favoritos/preferencias/avisos y anonimiza el perfil (0037).
 *
 * Una sesión válida no basta: la baja es irreversible. Se exige escribir BAJA y, si la cuenta tiene
 * contraseña local, volver a introducirla. Las cuentas creadas con OAuth no tienen contraseña local;
 * para ellas queda la confirmación explícita y el mismo límite por IP.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return NextResponse.redirect(new URL('/mi-cuenta?aviso=origen', peticion.url), 303);
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar', peticion.url), 303);
  if (!permite(`baja:${ipDe(peticion)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-intentos', peticion.url), 303);
  }

  let datos: FormData;
  try {
    datos = await peticion.formData();
  } catch {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-error', peticion.url), 303);
  }
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== 'BAJA') {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-confirmacion', peticion.url), 303);
  }

  try {
    const filas = await consulta<{ password_hash: string | null }>(
      'select app.hash_credencial($1) as password_hash',
      [sesion.userId],
      { rol: 'app' },
    );
    if (filas[0]?.password_hash) {
      const contrasena = String(datos.get('contrasena') ?? '');
      if (contrasena.length === 0 || !(await verificaContrasena(contrasena, filas[0].password_hash))) {
        return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-credencial', peticion.url), 303);
      }
    }

    // Cuenta OAuth sin contraseña local: no basta la sesión. Hace falta una reautenticación con
    // Google hecha en los últimos quince minutos y marcada en esta misma sesión.
    if (!filas[0]?.password_hash) {
      const oauth = await consulta<{ existe: boolean }>(
        'select exists(select 1 from app.oauth_identidad where user_id = $1) as existe',
        [sesion.userId], { rol: 'app' },
      );
      if (oauth[0]?.existe) {
        const token = (await cookies()).get(SESION_COOKIE)?.value;
        const reciente = token
          ? await consulta<{ ok: boolean }>(
            "select coalesce((select reautenticada_en > now() - interval '15 minutes' from app.sesion where token_sha = $1 and user_id = $2), false) as ok",
            [sha256Hex(token), sesion.userId], { rol: 'app' },
          )
          : [];
        if (!reciente[0]?.ok) {
          return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-reauth', peticion.url), 303);
        }
      }
    }

    await consulta('select app.baja_usuario($1, $2)', [sesion.userId, 'solicitud desde Mi cuenta'], { rol: 'app' });
    await terminaSesion();
    return NextResponse.redirect(new URL('/?baja=hecha', peticion.url), 303);
  } catch {
    return NextResponse.redirect(new URL('/mi-cuenta?aviso=baja-error', peticion.url), 303);
  }
}
