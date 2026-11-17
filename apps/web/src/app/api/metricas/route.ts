import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ipDe, permite } from '@/lib/limites';

/** Registro de una vista de página. Sin cookies, sin IP y sin identificar a nadie. */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!permite(`metricas:${ipDe(peticion)}`, 60, 10 * 60 * 1000)) return new NextResponse(null, { status: 429 });
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
