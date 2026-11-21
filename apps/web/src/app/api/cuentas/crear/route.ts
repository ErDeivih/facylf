import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { altaCuenta } from '@/lib/cuentas-db';
import { hashContrasena } from '@/lib/contrasenas';
import {
  avisoDeErrorRegistro, contrasenaValida, correoValido, nombreValido,
  normalizaCorreo, urlVolverSegura,
} from '@/lib/cuentas';
import { ipDe, permite } from '@/lib/limites';
import { limiteCompartido } from '@/lib/limites-db';
import { mismoOrigen } from '@/lib/seguridad';

/**
 * Alta de cuenta (`POST /api/cuentas/crear`).
 *
 * El registro está abierto: no hay código de invitación y no se consume ninguna. La contraseña se
 * deriva en la web (scrypt) y `app.alta_cuenta` guarda usuario y credencial en UNA transacción. Si la
 * base no está en modo `abierto` (por ejemplo, alguien lo cerró desde administración), se responde
 * «El registro no está abierto ahora mismo.» sin detalle técnico.
 *
 * La cuenta nace activa con el paquete por defecto (hoy `esencial`), que es lo mismo que tiene
 * cualquier usuario: sirve para favoritos y para lo público, no para administración.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  if (!mismoOrigen(peticion)) return atras(peticion, 'origen', null);
  const ip = ipDe(peticion);
  if (!permite(`crear:${ip}`, 10, 60 * 60 * 1000) || !(await limiteCompartido(`crear:${ip}`, 20, 3600))) return atras(peticion, 'intentos', null);

  let datos: FormData;
  try {
    datos = await peticion.formData();
  } catch {
    return atras(peticion, 'datos', null);
  }

  const nombre = typeof datos.get('nombre') === 'string' ? String(datos.get('nombre')).trim() : '';
  const correo = normalizaCorreo(datos.get('correo'));
  const contrasena = typeof datos.get('contrasena') === 'string' ? String(datos.get('contrasena')) : '';
  const destino = urlVolverSegura(datos.get('volver'));
  const acepto = datos.get('acepto');

  if (!nombreValido(nombre)) return atras(peticion, 'nombre', destino);
  if (!correoValido(correo)) return atras(peticion, 'correo', destino);
  if (!contrasenaValida(contrasena)) return atras(peticion, 'contrasena', destino);
  // El `required` del navegador no basta: la aceptación se comprueba también en el servidor.
  if (acepto === null || acepto === '') return atras(peticion, 'acepto', destino);

  try {
    const userId = randomUUID();
    const passwordHash = await hashContrasena(contrasena);
    // Sin código de invitación: la cuenta se crea con el modo vigente de `app.ajuste`.
    await altaCuenta({ userId, correo, passwordHash, codigo: null, nombre });

    // La respuesta es la misma exista o no el correo: no se crea sesión automáticamente y no se
    // distingue desde fuera si la cuenta era nueva. El alta no inicia sesión; se entra después.
    return atras(peticion, 'registro-neutral', destino);
  } catch (error) {
    const aviso = avisoDeErrorRegistro(error);
    if (aviso === 'no-disponible') {
      console.error('cuentas/crear: no se pudo crear la cuenta', error instanceof Error ? error.message : error);
    }
    // Un correo ya registrado recibe la misma respuesta neutra que un alta correcta.
    return atras(peticion, aviso === 'registro' ? 'registro-neutral' : aviso, destino);
  }
}

function atras(peticion: Request, aviso: string, volver: string | null): NextResponse {
  const url = new URL('/crear-cuenta', peticion.url);
  url.searchParams.set('aviso', aviso);
  if (volver) url.searchParams.set('volver', volver);
  return NextResponse.redirect(url, 303);
}
