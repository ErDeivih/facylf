import { NextResponse } from 'next/server';
import { ejecutaConsulta } from '@/consultas/adaptadores/postgres/conexion';
import { PERFIL_DE_LA_CUENTA, type FilaPerfilCuenta } from '@/consultas/mi-cuenta';
import { guardaPreferencias } from '@/lib/cuentas-db';
import { preferenciasDelFormulario } from '@/lib/preferencias-cuenta';
import { sesionActual } from '@/lib/sesion';
import { mismoOrigen } from '@/lib/seguridad';

export const dynamic = 'force-dynamic';

/**
 * Guarda las preferencias de aviso de la sesión.
 *
 * POST de formulario (sin JavaScript) con `Origin` comprobado. El usuario no viaja en el formulario:
 * sale de la cookie. Antes de escribir se leen las preferencias actuales para conservar `push`, que
 * todavía no tiene control en la pantalla, y para validar el formulario con las mismas reglas que la
 * función SQL. Cualquier fallo vuelve a `/mi-cuenta` con un aviso, sin decir que se ha guardado.
 */
export async function POST(peticion: Request): Promise<NextResponse> {
  const volver = (aviso: string) => NextResponse.redirect(new URL(`/mi-cuenta?aviso=${aviso}`, peticion.url), 303);

  if (!mismoOrigen(peticion)) return volver('origen');

  const sesion = await sesionActual();
  if (!sesion) {
    const url = new URL('/entrar', peticion.url);
    url.searchParams.set('volver', '/mi-cuenta');
    return NextResponse.redirect(url, 303);
  }

  let formulario: FormData;
  try {
    formulario = await peticion.formData();
  } catch {
    return volver('preferencias-error');
  }

  let actuales: FilaPerfilCuenta | undefined;
  try {
    const filas = await ejecutaConsulta<FilaPerfilCuenta>(PERFIL_DE_LA_CUENTA, [sesion.userId]);
    actuales = filas[0];
  } catch {
    return volver('preferencias-error');
  }
  if (!actuales) return volver('preferencias-error');

  const preferencias = preferenciasDelFormulario(formulario, actuales.preferencias ?? {
    en_app: true,
    push: false,
    correo: 'resumen',
    hora_resumen: '08:00:00',
    silencio_desde: null,
    silencio_hasta: null,
    eventos: [],
  });
  if (preferencias === null) return volver('preferencias-error');

  try {
    await guardaPreferencias(sesion.userId, preferencias);
  } catch {
    return volver('preferencias-error');
  }
  return volver('preferencias');
}
