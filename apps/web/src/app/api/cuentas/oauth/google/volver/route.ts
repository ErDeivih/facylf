import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { urlVolverSegura } from '@/lib/cuentas';
import { iniciaSesion } from '@/lib/sesion';

export const runtime = 'nodejs';

/**
 * Retorno de Google.
 *
 * Comprueba el `state` contra la cookie, canjea el código con PKCE, exige `email_verified`, y sólo
 * entonces crea o enlaza la cuenta. El correo no verificado no se usa para enlazar una cuenta con
 * contraseña: sería una vía de apropiación.
 */
const COOKIE_ESTADO = 'facylf_oauth_estado';
const COOKIE_VERIFICADOR = 'facylf_oauth_verificador';
const COOKIE_VOLVER = 'facylf_oauth_volver';

function baseUrl(peticion: Request): string {
  return (process.env.OAUTH_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? new URL(peticion.url).origin).replace(/\/$/, '');
}

function atras(peticion: Request, aviso: string): NextResponse {
  return NextResponse.redirect(new URL(`/entrar?aviso=${aviso}`, peticion.url));
}

export async function GET(peticion: Request): Promise<NextResponse> {
  const url = new URL(peticion.url);
  const codigo = url.searchParams.get('code');
  const estado = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error !== null || codigo === null || estado === null) return atras(peticion, 'oauth-error');

  const cookie = peticion.headers.get('cookie') ?? '';
  const obtener = (nombre: string): string | null => {
    const pieza = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${nombre}=`));
    return pieza ? decodeURIComponent(pieza.slice(nombre.length + 1)) : null;
  };
  if (obtener(COOKIE_ESTADO) !== estado) return atras(peticion, 'oauth-estado');

  const verificador = obtener(COOKIE_VERIFICADOR);
  const volver = urlVolverSegura(obtener(COOKIE_VOLVER));
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!verificador || !clientId || !clientSecret) return atras(peticion, 'oauth-no-configurado');

  try {
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${baseUrl(peticion)}/api/cuentas/oauth/google/volver`,
        grant_type: 'authorization_code',
        code_verifier: verificador,
      }),
      cache: 'no-store',
    });
    if (!token.ok) return atras(peticion, 'oauth-error');
    const datos = (await token.json()) as { access_token?: unknown };
    if (typeof datos.access_token !== 'string') return atras(peticion, 'oauth-error');

    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${datos.access_token}` },
      cache: 'no-store',
    });
    if (!info.ok) return atras(peticion, 'oauth-error');
    const perfil = (await info.json()) as {
      sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown;
    };
    if (typeof perfil.sub !== 'string' || typeof perfil.email !== 'string' || perfil.email_verified !== true) {
      return atras(peticion, 'oauth-correo');
    }

    const filas = await consulta<{ user_id: string }>(
      'select app.alta_cuenta_oauth($1, $2, $3, $4, $5) as user_id',
      [randomUUID(), 'google', perfil.sub, perfil.email, typeof perfil.name === 'string' ? perfil.name : null],
      { rol: 'app' },
    );
    const userId = filas[0]?.user_id;
    if (!userId) return atras(peticion, 'oauth-error');

    await iniciaSesion(userId);
    const respuesta = NextResponse.redirect(new URL(volver ?? '/mi-panel', peticion.url), 303);
    for (const nombre of [COOKIE_ESTADO, COOKIE_VERIFICADOR, COOKIE_VOLVER]) {
      respuesta.cookies.set(nombre, '', { path: '/api/cuentas/oauth', maxAge: 0 });
    }
    return respuesta;
  } catch (fallo) {
    console.error('oauth/google: no se pudo completar', fallo instanceof Error ? fallo.message : fallo);
    return atras(peticion, 'oauth-error');
  }
}
