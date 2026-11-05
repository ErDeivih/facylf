import type { Route } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CABECERA_RUTA } from '@/lib/tema';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { decisionAccesoAdmin } from './admin';
import { sesionActual, type Sesion } from './sesion';

/**
 * Guardia del panel de administración.
 *
 * · Sin sesión: se va a `/entrar` conservando la ruta (`volver`), que luego vuelve aquí si el alta o la
 *   entrada acaban bien.
 * · Con sesión pero sin rol `administrador` o sin la capacidad `administrar_usuarios`: **404**, no
 *   panel ni datos. No se usa 403 porque un 403 confirmaría que la zona existe; el 404 es la respuesta
 *   honesta y no revela nada. La decisión está en `lib/admin.ts` y se prueba aparte.
 * · La comprobación se hace en servidor, en cada página, y vuelve a preguntar a `app.puede`; no se
 *   acepta ningún `user_id` de la URL.
 *
 * La doble verificación (2FA) no está implementada todavía: se dice en la pantalla y en
 * ADMINISTRACION.md, no se simula.
 */
export async function exigeAdministrador(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) {
    const rutaCruda = (await headers()).get(CABECERA_RUTA);
    const volver = rutaCruda?.startsWith('/admin') ? rutaCruda : '/admin';
    redirect(`/entrar?volver=${encodeURIComponent(volver)}` as Route);
  }

  const decision = decisionAccesoAdmin(sesion, await puedeAdministrar(sesion.userId));
  if (decision !== 'ok') notFound();
  return sesion;
}

/** ¿Tiene esta cuenta la capacidad de administrar usuarios? Cualquier fallo se trata como «no». */
export async function puedeAdministrar(userId: string): Promise<boolean> {
  try {
    const filas = await consulta<{ puede: boolean }>(
      'select app.puede($1, $2) as puede',
      [userId, 'administrar_usuarios'],
      { rol: 'app' },
    );
    return filas[0]?.puede === true;
  } catch {
    return false;
  }
}
