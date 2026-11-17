import { NextResponse } from 'next/server';
import { anotaEntrada, credencialDe, esperaDeEntrada, limpiaSesiones } from '@/lib/cuentas-db';
import { hashContrasena, verificaContrasena } from '@/lib/contrasenas';
import { contrasenaValida, correoValido, estadoDeCredencial, normalizaCorreo, urlVolverSegura } from '@/lib/cuentas';
import { iniciaSesion } from '@/lib/sesion';
import { ipDe, permite } from '@/lib/limites';
import { limiteCompartido } from '@/lib/limites-db';
import { mismoOrigen } from '@/lib/seguridad';

/**
 * Entrada por correo y contraseña.
 *
 * Orden de las comprobaciones, y por qué:
 *  1. `Origin` (CSRF) y límite por IP en memoria.
 *  2. Freno por cuenta en la base (`app.espera_entrada`, 8 fallos / 15 min): se pregunta ANTES de
 *     verificar la contraseña, como documenta 0043.
 *  3. Si el correo no existe se hace igualmente una derivación scrypt de relleno, para que el tiempo
 *     de respuesta no delate si la cuenta existe. El mensaje es el mismo en los dos casos.
 *  4. Sólo después de acertar la contraseña se cuenta el estado (pendiente, bloqueado, caducado).
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return atras(peticion, 'origen', null);
  const ip = ipDe(peticion);
  if (!permite(`entrar:${ip}`, 40, 10 * 60 * 1000) || !(await limiteCompartido(`entrar:${ip}`, 80, 600))) return atras(peticion, 'intentos', null);

  let datos: FormData;
  try {
    datos = await peticion.formData();
  } catch {
    return atras(peticion, 'datos', null);
  }
  const correo = normalizaCorreo(datos.get('correo'));
  const contrasena = typeof datos.get('contrasena') === 'string' ? String(datos.get('contrasena')) : '';
  const destino = urlVolverSegura(datos.get('volver'));

  if (!correoValido(correo) || contrasena.length === 0 || !contrasenaValida(contrasena)) {
    return atras(peticion, 'credenciales', destino);
  }

  try {
    const espera = await esperaDeEntrada(correo);
    if (espera > 0) return atras(peticion, 'intentos', destino);

    const credencial = await credencialDe(correo);
    let correcta = false;
    if (credencial) {
      correcta = await verificaContrasena(contrasena, credencial.password_hash);
    } else {
      // Misma derivación que una verificación real: el tiempo no distingue correo inexistente.
      await hashContrasena(contrasena);
    }

    if (!correcta || !credencial) {
      await anotaEntrada(correo, false);
      return atras(peticion, 'credenciales', destino);
    }
    await anotaEntrada(correo, true);

    const estado = estadoDeCredencial(credencial);
    if (estado === 'pendiente') return atras(peticion, 'pendiente', destino);
    if (estado === 'bloqueada') return atras(peticion, 'bloqueada', destino);
    if (estado === 'caducada') return atras(peticion, 'caducada', destino);

    await limpiaSesiones();
    await iniciaSesion(credencial.user_id);
    return NextResponse.redirect(new URL(destino ?? '/mi-panel', peticion.url), 303);
  } catch (error) {
    // Sin traza al usuario. El detalle se queda en el registro del servidor.
    console.error('cuentas/entrar: no se pudo completar la entrada', error instanceof Error ? error.message : error);
    return atras(peticion, 'no-disponible', destino);
  }
}

function atras(peticion: Request, aviso: string, volver: string | null): NextResponse {
  const url = new URL('/entrar', peticion.url);
  url.searchParams.set('aviso', aviso);
  if (volver) url.searchParams.set('volver', volver);
  return NextResponse.redirect(url, 303);
}
