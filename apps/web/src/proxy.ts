import { NextResponse, type NextRequest } from 'next/server';
import { CABECERA_RUTA } from '@/lib/tema';
import { ipDe } from '@/lib/limites';

/** Límite por IP y proceso: evita que un bot recorra el catálogo a base de peticiones seguidas. */
const VENTANA_MS = 60_000;
const golpes = new Map<string, number[]>();

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
export default function proxy(request: NextRequest) {
  const ip = ipDe(request);
  const esApi = request.nextUrl.pathname.startsWith('/api/');
  // Las páginas admiten navegación normal; el API es mucho más estrecho. Los estáticos no pasan por aquí.
  if (process.env.FACYLF_SIN_LIMITE !== '1' && limitado(`${esApi ? 'api' : 'web'}:${ip}`, esApi ? 40 : 180)) {
    return new NextResponse('Demasiadas peticiones. Espera un minuto.', {
      status: 429,
      headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const cabeceras = new Headers(request.headers);
  cabeceras.set(CABECERA_RUTA, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Sólo páginas: los estáticos de Next, el API y el icono no montan layout ni necesitan la ruta.
  matcher: ['/((?!_next/|icon\\.svg).*)'],
};
