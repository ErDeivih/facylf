import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Inicio del flujo OAuth con Google.
 *
 * Sin `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no se inventa un botón que falle: se vuelve a /entrar
 * con un aviso. El estado y el verificador PKCE viven en cookies httpOnly de diez minutos; la URL de
 * retorno se fija en el servidor y no se acepta desde la petición.
 */
const COOKIE_ESTADO = 'facylf_oauth_estado';
const COOKIE_VERIFICADOR = 'facylf_oauth_verificador';
const COOKIE_VOLVER = 'facylf_oauth_volver';
const COOKIE_REAUTH = 'facylf_oauth_reauth';
const VIDA_SEGUNDOS = 600;

function baseUrl(peticion: Request): string {
  return (process.env.OAUTH_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? new URL(peticion.url).origin).replace(/\/$/, '');
}

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/cuentas/oauth',
    maxAge: VIDA_SEGUNDOS,
  };
}

export async function GET(peticion: Request, { params }: { params: Promise<{ proveedor: string }> }): Promise<NextResponse> {
  const { proveedor } = await params;
  if (proveedor !== 'google') return new NextResponse(null, { status: 404 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/entrar?aviso=oauth-no-configurado', peticion.url));
  }

  const estado = randomBytes(24).toString('base64url');
  const verificador = randomBytes(48).toString('base64url');
  const reto = createHash('sha256').update(verificador).digest('base64url');
  const redireccion = `${baseUrl(peticion)}/api/cuentas/oauth/google/volver`;
  const volver = new URL(peticion.url).searchParams.get('volver') ?? '';
  const reauth = new URL(peticion.url).searchParams.get('reauth') === '1';

  const destino = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  destino.searchParams.set('client_id', clientId);
  destino.searchParams.set('redirect_uri', redireccion);
  destino.searchParams.set('response_type', 'code');
  destino.searchParams.set('scope', 'openid email profile');
  destino.searchParams.set('state', estado);
  destino.searchParams.set('code_challenge', reto);
  destino.searchParams.set('code_challenge_method', 'S256');
  destino.searchParams.set('prompt', 'select_account');

  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.set(COOKIE_ESTADO, estado, opcionesCookie());
  respuesta.cookies.set(COOKIE_VERIFICADOR, verificador, opcionesCookie());
  respuesta.cookies.set(COOKIE_VOLVER, volver, opcionesCookie());
  respuesta.cookies.set(COOKIE_REAUTH, reauth ? '1' : '0', opcionesCookie());
  return respuesta;
}
