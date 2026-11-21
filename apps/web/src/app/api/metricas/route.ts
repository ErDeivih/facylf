import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ipDe, permite } from '@/lib/limites';
import { limiteCompartido } from '@/lib/limites-db';
import { mismoOrigen } from '@/lib/seguridad';

/** Registro de una vista de página. Sin cookies, sin IP y sin identificar a nadie. */
export async function POST(peticion: Request): Promise<NextResponse> {
  // Analítica sin CSRF: una web ajena no debe poder inflar las vistas de nuestras rutas.
  // `sendBeacon` no manda `Origin`; en ese caso se acepta `Sec-Fetch-Site: same-origin` o un
  // `Referer` del mismo host.
  const sitio = peticion.headers.get('sec-fetch-site');
  const deMismoSitio = sitio === 'same-origin'
    || (sitio === null && (() => {
      const referer = peticion.headers.get('referer');
      if (!referer) return false;
      try {
        return new URL(referer).host === peticion.headers.get('host');
      } catch {
        return false;
      }
    })());
  if (!mismoOrigen(peticion) && !deMismoSitio) return new NextResponse(null, { status: 403 });
  const ip = ipDe(peticion);
  if (!permite(`metricas:${ip}`, 60, 10 * 60 * 1000) || !(await limiteCompartido(`metricas:${ip}`, 120, 600))) return new NextResponse(null, { status: 429 });
  let cuerpo: { ruta?: unknown; referrer?: unknown } = {};
  try { cuerpo = await peticion.json(); } catch { return new NextResponse(null, { status: 204 }); }
  const ruta = typeof cuerpo.ruta === 'string' ? cuerpo.ruta.slice(0, 300) : '';
  if (!ruta.startsWith('/') || ruta.startsWith('/api') || ruta.startsWith('/mi-') || ruta.startsWith('/admin')) {
    return new NextResponse(null, { status: 204 });
  }
  const referrer = typeof cuerpo.referrer === 'string' ? cuerpo.referrer.slice(0, 500) : null;
  try {
    await consulta('insert into app.evento_web (ruta, referrer) values ($1, $2)', [ruta, referrer], { rol: 'app' });
  } catch { /* la observabilidad nunca rompe la página */ }
  return new NextResponse(null, { status: 204 });
}
