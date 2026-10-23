/**
 * Puerta de entrada de cada petición (Next 16: apps/web/src/proxy.ts; en Next 15 se llamaba middleware.ts).
 *
 * La plataforma es PRIVADA: sin sesión sólo se ve /entrar, /registro, /recuperar, /legal y lo técnico.
 * Aquí sólo se mira si hay cookie de sesión (rápido, sin base de datos). La comprobación de verdad — sesión
 * válida, usuario activo, permiso de la página — la hace cada página en el servidor con auth.api.getSession()
 * y app.puede(); el proxy sólo evita pintar páginas a quien ni siquiera ha entrado.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLICAS = [/^\/entrar/, /^\/registro/, /^\/recuperar/, /^\/verificar/, /^\/legal/, /^\/adios/,
  /^\/api\/auth\//, /^\/api\/salud$/, /^\/api\/revalidar$/, /^\/sw\.js$/, /^\/manifest/, /^\/icono/, /^\/insignia/, /^\/_next\//, /^\/favicon/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLICAS.some((r) => r.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(req)) {
    const url = new URL('/entrar', req.url);
    url.searchParams.set('volver', pathname + search);        // tras entrar, vuelve a donde iba
    // /entrar sólo acepta `volver` si empieza por «/» y no por «//» ni «/\» (si no, cualquiera podría usar el
    // enlace para mandar a la gente a otra web tras entrar): `const destino = /^\/(?![\/\\])/.test(v) ? v : '/mi'`.
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // Cabeceras de seguridad para todo lo privado
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');       // privada: ningún buscador la indexa
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

/*
 * En cada página protegida (ejemplo /admin/layout.tsx):
 *
 *   const s = await auth.api.getSession({ headers: await headers() });
 *   if (!s) redirect('/entrar?volver=/admin');
 *   if (!(await puede(s.user.id, 'administrar_usuarios'))) notFound();          // no revela que existe
 *   if (!s.user.twoFactorEnabled) redirect('/cuenta/seguridad?motivo=admin');   // 2FA obligatorio en /admin
 *   await db.query('select app.registra_visita($1)', [s.user.id]);              // último acceso (máx. 1 escritura / 5 min)
 *
 * Y en las de datos con menores: `const verMenores = await puede(uid, 'ver_menores_nombres')`, que se pasa como
 * parámetro a la consulta (nunca se cachea la versión con nombres; ver cache.ts).
 */
