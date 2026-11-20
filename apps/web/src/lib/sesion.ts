import { cookies } from 'next/headers';
import { cierraSesionPorToken, creaSesionPara, sesionPorToken } from './cuentas-db';

/**
 * Sesión de la web, en una cookie `httpOnly`.
 *
 * · La cookie (`facylf_sesion`) lleva el token aleatorio. En la base sólo está su SHA-256 en
 *   `app.sesion`, así que una copia de la base no permite suplantar a nadie.
 * · `httpOnly` impide leerla desde JavaScript; `SameSite=Lax` frena el envío en peticiones cruzadas
 *   (los formularios de entrada y favoritos comprueban además el `Origin` en el servidor); `Secure`
 *   se activa en producción (en local la web va por HTTP y con `Secure` no habría sesión).
 * · Caducidad de 7 días.
 *
 * A propósito NO se envuelve en `cache()` de React: en un route handler esa memoización no está
 * garantizada por petición y una sesión cacheada entre peticiones distintas sería un fallo grave. Se
 * consulta una vez por pantalla; el coste es una consulta por clave primaria.
 */

export const SESION_COOKIE = 'facylf_sesion';
export const DURACION_SESION_SEGUNDOS = 7 * 24 * 60 * 60;

export type Sesion = {
  userId: string;
  nombre: string | null;
  rol: string;
  paquete: string | null;
};

export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACION_SESION_SEGUNDOS,
  };
}

/**
 * La sesión de la petición actual, o `null`. Si la base no responde se trata como «sin sesión»: la
 * pantalla pedirá entrar y la entrada dirá que no se puede ahora mismo, sin inventar un usuario.
 */
export async function sesionActual(): Promise<Sesion | null> {
  const almacen = await cookies();
  const token = almacen.get(SESION_COOKIE)?.value;
  if (!token) return null;
  try {
    const fila = await sesionPorToken(token);
    if (!fila) return null;
    return {
      userId: fila.user_id,
      nombre: fila.nombre_visible,
      rol: fila.rol,
      paquete: fila.paquete,
    };
  } catch {
    return null;
  }
}

/** Crea la sesión en la base y escribe la cookie. Sólo desde un route handler o una action. */
export async function iniciaSesion(userId: string, passwordHash?: string): Promise<void> {
  const token = await creaSesionPara(userId, passwordHash);
  (await cookies()).set(SESION_COOKIE, token, opcionesCookieSesion());
}

/** Cierra la sesión de la base (si el token existe) y borra la cookie. */
export async function terminaSesion(): Promise<void> {
  const almacen = await cookies();
  const token = almacen.get(SESION_COOKIE)?.value;
  if (token) {
    try {
      await cierraSesionPorToken(token);
    } catch {
      // Si la base no responde, la cookie se borra igual: el navegador deja de enviarla.
    }
  }
  almacen.delete(SESION_COOKIE);
}
