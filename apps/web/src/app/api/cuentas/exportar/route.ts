import { NextResponse } from 'next/server';
import { exportaMisDatos } from '@/lib/cuentas-db';
import { sesionActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/**
 * Descarga de los datos de la cuenta de la sesión.
 *
 * Es un GET de sólo lectura, pero no se cachea ni se comparte: la respuesta depende de la cookie y
 * lleva `Cache-Control: no-store`. Si no hay sesión, se manda a entrar en vez de devolver un vacío.
 */
export async function GET(peticion: Request): Promise<NextResponse> {
  const sesion = await sesionActual();
  if (!sesion) {
    const url = new URL('/entrar', peticion.url);
    url.searchParams.set('volver', '/mi-cuenta');
    return NextResponse.redirect(url, 303);
  }

  let datos: unknown;
  try {
    datos = await exportaMisDatos(sesion.userId);
  } catch {
    return NextResponse.json({ error: 'No se han podido preparar tus datos.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return new NextResponse(JSON.stringify(datos, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mis-datos-balompie.json"',
      'Cache-Control': 'no-store',
    },
  });
}
