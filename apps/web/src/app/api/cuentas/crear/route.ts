import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { altaCuenta, anotaEntrada, modoRegistro } from '@/lib/cuentas-db';
import { hashContrasena } from '@/lib/contrasenas';
import {
  avisoDeErrorRegistro, contrasenaValida, correoValido, nombreValido,
  normalizaCorreo, normalizaInvitacion, urlVolverSegura,
} from '@/lib/cuentas';
import { iniciaSesion } from '@/lib/sesion';
import { ipDe, permite } from '@/lib/limites';
import { mismoOrigen } from '@/lib/seguridad';

/**
 * Alta de cuenta.
 *
 * La contraseña se deriva en la web (scrypt) y `app.alta_cuenta` guarda usuario y credencial en UNA
 * transacción: si la invitación no vale, no queda usuario ni uso consumido. El modo sale de
 * `app.ajuste.registro_modo` (hoy `invitacion`); en `aprobacion` la cuenta nace pendiente y no se
 * abre sesión, y en `abierto` entra directamente.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return atras(peticion, 'origen', null);
  if (!permite(`crear:${ipDe(peticion)}`, 10, 60 * 60 * 1000)) return atras(peticion, 'intentos', null);

  let datos: FormData;
  try {
    datos = await peticion.formData();
  } catch {
    return atras(peticion, 'datos', null);
  }

  const nombre = typeof datos.get('nombre') === 'string' ? String(datos.get('nombre')).trim() : '';
  const correo = normalizaCorreo(datos.get('correo'));
  const contrasena = typeof datos.get('contrasena') === 'string' ? String(datos.get('contrasena')) : '';
  const codigo = normalizaInvitacion(datos.get('invitacion'));
  const destino = urlVolverSegura(datos.get('volver'));
  const acepto = datos.get('acepto');

  if (!nombreValido(nombre)) return atras(peticion, 'nombre', destino);
  if (!correoValido(correo)) return atras(peticion, 'correo', destino);
  if (!contrasenaValida(contrasena)) return atras(peticion, 'contrasena', destino);
  // El `required` del navegador no basta: la aceptación se comprueba también en el servidor.
  if (acepto === null || acepto === '') return atras(peticion, 'acepto', destino);

  try {
    const modo = await modoRegistro();
    if (modo === null) return atras(peticion, 'no-disponible', destino);
    if (modo === 'invitacion' && codigo === '') return atras(peticion, 'invitacion-requerida', destino);

    // En aprobación/abierto no se usa el código aunque llegue: el modo vigente manda.
    const codigoUsado = modo === 'invitacion' ? codigo : null;
    const userId = randomUUID();
    const passwordHash = await hashContrasena(contrasena);
    const estado = await altaCuenta({ userId, correo, passwordHash, codigo: codigoUsado, nombre });

    if (estado === 'activo') {
      await anotaEntrada(correo, true);
      await iniciaSesion(userId);
      return NextResponse.redirect(new URL(destino ?? '/mi-panel', peticion.url), 303);
    }
    return atras(peticion, 'registro-pendiente', destino);
  } catch (error) {
    const aviso = avisoDeErrorRegistro(error);
    if (aviso === 'no-disponible') {
      console.error('cuentas/crear: no se pudo crear la cuenta', error instanceof Error ? error.message : error);
    }
    return atras(peticion, aviso, destino);
  }
}

function atras(peticion: Request, aviso: string, volver: string | null): NextResponse {
  const url = new URL('/entrar', peticion.url);
  url.searchParams.set('aviso', aviso);
  if (volver) url.searchParams.set('volver', volver);
  return NextResponse.redirect(url, 303);
}
