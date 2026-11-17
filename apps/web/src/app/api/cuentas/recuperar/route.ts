import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { correoValido, normalizaCorreo } from '@/lib/cuentas';
import { ipDe, permite } from '@/lib/limites';
import { mismoOrigen } from '@/lib/seguridad';

/** Solicitud de recuperación. No revela si el correo existe y no guarda el correo en claro. */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return NextResponse.redirect(new URL('/recuperar?aviso=origen', peticion.url), 303);
  if (!permite(`recuperar:${ipDe(peticion)}`, 5, 15 * 60 * 1000)) return NextResponse.redirect(new URL('/recuperar?aviso=intentos', peticion.url), 303);
  const datos = await peticion.formData();
  const correo = normalizaCorreo(datos.get('correo'));
  if (!correoValido(correo)) return NextResponse.redirect(new URL('/recuperar?aviso=correo', peticion.url), 303);
  try {
    await consulta("insert into app.recuperacion_solicitud (correo_sha) values (app.sha_correo($1))", [correo], { rol: 'app' });
  } catch { return NextResponse.redirect(new URL('/recuperar?aviso=error', peticion.url), 303); }
  return NextResponse.redirect(new URL('/recuperar?aviso=enviado', peticion.url), 303);
}
