import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { puedeAdministrar } from '@/lib/admin-servidor';
import { sesionActual } from '@/lib/sesion';
import { mismoOrigen } from '@/lib/seguridad';

/** Marca una solicitud de recuperación como atendida. Sólo administración. */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return new NextResponse(null, { status: 403 });
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.redirect(new URL('/entrar?volver=%2Fadmin%2Frecuperaciones', peticion.url), 303);
  if (!(await puedeAdministrar(sesion.userId))) return new NextResponse(null, { status: 404 });

  const datos = await peticion.formData().catch(() => null);
  const id = Number(datos?.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.redirect(new URL('/admin/recuperaciones', peticion.url), 303);
  }
  try {
    await consulta(
      'update app.recuperacion_solicitud set atendida_en = now() where id = $1 and atendida_en is null',
      [id], { rol: 'app' },
    );
  } catch {
    return NextResponse.redirect(new URL('/admin/recuperaciones', peticion.url), 303);
  }
  return NextResponse.redirect(new URL('/admin/recuperaciones', peticion.url), 303);
}
