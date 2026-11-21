import { NextResponse, type NextRequest } from 'next/server';
import { CABECERA_RUTA } from '@/lib/tema';
import { ipDe } from '@/lib/limites';
import { limiteRedis } from '@/lib/limite-redis';

/** Límite por IP y proceso: evita que un bot recorra el catálogo a base de peticiones seguidas. */
const VENTANA_MS = 60_000;
const golpes = new Map<string, number[]>();

/** Rutas de la web anterior que ya no se publican: se redirigen antes de tocar SQLite. */
const LEGADO: Record<string, string> = {
  '/equipos': '/explorar/competiciones',
  '/jugadores': '/explorar/ojeo',
  '/tecnicos': '/explorar/estadisticas',
  '/arbitros-campos': '/explorar/estadisticas',
  '/partidos': '/explorar/proximas',
  '/estadisticas': '/explorar/estadisticas',
  '/federaciones': '/explorar/competiciones',
  '/competiciones': '/explorar/competiciones',
};

function destinoLegado(ruta: string): string | null {
  if (LEGADO[ruta]) return LEGADO[ruta]!;
  if (/^\/(equipo|club|competicion|jugador)\//.test(ruta)) return '/explorar';
  return null;
}

function limitado(ip: string, maximo: number): boolean {
  const ahora = Date.now();
  const previos = (golpes.get(ip) ?? []).filter((t) => t > ahora - VENTANA_MS);
  if (previos.length >= maximo) { golpes.set(ip, previos); return true; }
  previos.push(ahora); golpes.set(ip, previos);
  return false;
}

/**
 * Deja la ruta de la petición en una cabecera de petición para que el layout raíz sepa en qué
 * pantalla está.
 *
 * Hace falta porque el layout raíz no recibe la ruta por props y, sin embargo, la decisión del tema
 * depende de ella: en las rutas migradas (`/explorar…`) se respeta la cookie; en las viejas se fuerza
 * claro y no se pinta el control.
 *
 * Next 16 renombró la convención `middleware.ts` a `proxy.ts` (y la función `middleware` a `proxy`);
 * este fichero usa el nombre nuevo para no quedarse con el aviso de deprecación.
 */
export default async function proxy(request: NextRequest) {
  const legado = destinoLegado(request.nextUrl.pathname);
  if (legado !== null) return NextResponse.redirect(new URL(legado, request.url), 308);
  const ip = ipDe(request);
  const esApi = request.nextUrl.pathname.startsWith('/api/');
  // `/api/v1` tiene su propio límite (300/min) y devuelve errores JSON versionados; el proxy no debe
  // cortarlo antes con un 429 de texto plano.
  const esApiV1 = request.nextUrl.pathname.startsWith('/api/v1');
  // Un formulario de cuentas no necesita más de 1 MB. El límite evita que un cuerpo enorme se
  // convierta en memoria del proceso antes de que el route handler pueda validarlo.
  const longitud = Number(request.headers.get('content-length') ?? '0');
  if (esApi && request.method !== 'GET' && Number.isFinite(longitud) && longitud > 1_000_000) {
    return new NextResponse('Cuerpo demasiado grande.', {
      status: 413,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  // Las páginas admiten navegación normal; el API es mucho más estrecho. Los estáticos no pasan por aquí.
  if (process.env.FACYLF_SIN_LIMITE !== '1' && !esApiV1) {
    const clave = `${esApi ? 'api' : 'web'}:${ip}`;
    const maximo = esApi ? 40 : 180;
    const redis = await limiteRedis(clave, maximo, 60);
    const bloqueado = redis === null ? limitado(clave, maximo) : !redis;
    if (bloqueado) {
      return new NextResponse('Demasiadas peticiones. Espera un minuto.', {
        status: 429,
        headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }
  const cabeceras = new Headers(request.headers);
  cabeceras.set(CABECERA_RUTA, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Sólo páginas: los estáticos de Next, el API y el icono no montan layout ni necesitan la ruta.
  matcher: ['/((?!_next/|icon\\.svg).*)'],
};
