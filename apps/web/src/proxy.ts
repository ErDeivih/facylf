import { NextResponse, type NextRequest } from 'next/server';
import { CABECERA_RUTA } from '@/lib/tema';

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
  const cabeceras = new Headers(request.headers);
  cabeceras.set(CABECERA_RUTA, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Sólo páginas: los estáticos de Next, el API y el icono no montan layout ni necesitan la ruta.
  matcher: ['/((?!_next/|api/|icon\\.svg).*)'],
};
