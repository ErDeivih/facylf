/**
 * QUÉ VE CADA USUARIO SEGÚN SU ESTADO (0043). Va a apps/web/src/lib/acceso.ts en la fase C.
 *
 * `exigeAcceso()` se llama en el layout de las páginas privadas (todas menos /entrar, /registro, /recuperar y
 * /cuenta/*). Hace UNA consulta por petición (`app.estado_acceso`, por clave primaria, < 1 ms) y redirige:
 *
 *   estado          a dónde                          qué se enseña (CONTENIDO-MICROCOPIA.md)
 *   ok              sigue
 *   sin_alta        cierra sesión → /entrar?aviso=sin_alta   «Tu cuenta no está dada de alta. Pide una invitación.»
 *   pendiente       /cuenta/pendiente                «Tu solicitud está pendiente. Te avisaremos por correo al aprobarla.»
 *   rechazado       /cuenta/sin-acceso               «Tu solicitud no se ha aprobado.» + motivo
 *   bloqueado       /cuenta/sin-acceso               «Tu acceso está suspendido.» + motivo + contacto
 *   baja            cierra sesión → /entrar?aviso=baja      «Esta cuenta se dio de baja.»
 *   caducado        /cuenta/caducado                 «Tu paquete venció el dd/mm/aaaa. Pide la renovación.» (puede ver su cuenta y exportar sus datos)
 *   requiere_2fa    /cuenta/seguridad?obligatorio=1  «Los administradores tienen que activar la verificación en dos pasos.»
 *
 * Además, si quedan 7 días o menos para caducar, `diasParaCaducar` permite pintar una franja discreta arriba.
 * Las páginas de /admin piden además `rol === 'administrador'` (si no, 404: no se revela que existe).
 */
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { Pool } from 'pg';
import { auth } from '@/lib/auth';

const db = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 10, statement_timeout: 2000 });

export type Acceso = { userId: string; rol: 'administrador' | 'usuario'; paquete: string | null; diasParaCaducar: number | null };

/** Una vez por petición aunque la llamen el layout y varias páginas (cache de React). */
export const exigeAcceso = cache(async (opciones?: { admin?: boolean }): Promise<Acceso> => {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect('/entrar');
  const { rows } = await db.query<{ estado: string; rol: Acceso['rol']; paquete: string | null; motivo: string | null; dias_para_caducar: number | null }>(
    'select * from app.estado_acceso($1, $2)', [sesion.user.id, (sesion.user as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false]);
  const e = rows[0];
  switch (e?.estado) {
    case 'ok': break;
    case 'pendiente': redirect('/cuenta/pendiente');
    case 'rechazado': case 'bloqueado': redirect('/cuenta/sin-acceso');
    case 'caducado': redirect('/cuenta/caducado');
    case 'requiere_2fa': redirect('/cuenta/seguridad?obligatorio=1');
    case 'baja': case 'sin_alta': default:
      await auth.api.signOut({ headers: await headers() }).catch(() => {});
      redirect(`/entrar?aviso=${e?.estado ?? 'sin_alta'}`);
  }
  if (opciones?.admin && e.rol !== 'administrador') notFound();
  return { userId: sesion.user.id, rol: e.rol, paquete: e.paquete, diasParaCaducar: e.dias_para_caducar };
});

/** Para /cuenta/sin-acceso y /cuenta/caducado: el motivo y la fecha, sin redirigir. */
export async function estadoDeMiCuenta() {
  const sesion = await auth.api.getSession({ headers: await headers() });
  if (!sesion) redirect('/entrar');
  const { rows } = await db.query('select * from app.estado_acceso($1, true)', [sesion.user.id]);
  return rows[0] as { estado: string; motivo: string | null; dias_para_caducar: number | null };
}

/*
 * Recorrido de registro (lo que prueban m43 y e2e/usuarios.spec.ts):
 *  1. /registro?codigo=XXXX-… → formulario (nombre, correo, contraseña ≥ 10, código ya relleno).
 *  2. Better Auth crea la cuenta → gancho → app.alta_usuario(id, código, nombre, correo):
 *       activo   → correo de verificación → al confirmar, entra.
 *       pendiente→ correo de verificación → /cuenta/pendiente; el administrador lo ve el primero en Usuarios
 *                  (con «días esperando»; a los 3 días la vigilancia avisa).
 *       error    → la cuenta se deshace y el formulario enseña: INVITACION_NO_EXISTE «Ese código no existe o se anuló»,
 *                  INVITACION_CADUCADA «El código ha caducado: pide otro», INVITACION_AGOTADA «Ese código ya se usó»,
 *                  INVITACION_DE_OTRO_CORREO «Este código es para otro correo», REGISTRO_SOLO_CON_INVITACION
 *                  «Por ahora sólo se entra con invitación».
 *  3. Aprobación → app.aprueba_usuario → aviso en su bandeja + correo (notificaciones.mjs, tipo 'cuenta').
 *  4. Recuperar contraseña: /recuperar siempre responde «Si el correo existe, te hemos enviado un enlace» (no revela
 *     cuentas); el enlace caduca en 1 hora (Better Auth) y al cambiarla se cierran las demás sesiones.
 */
