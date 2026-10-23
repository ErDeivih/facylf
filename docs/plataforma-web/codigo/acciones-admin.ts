'use server';
/**
 * SERVER ACTIONS del panel: cuentas e invitaciones (migración 0043). Van a apps/web/src/app/admin/acciones.ts
 * en la fase C. Mismo patrón que acciones-usuario.ts, más:
 *  1. El administrador sale de la sesión y `exigeAcceso({ admin: true })` (acceso.ts): sin rol, 404; sin 2FA, a
 *     activarla. Las funciones SQL vuelven a comprobar el permiso (`administrar_usuarios`): doble cerrojo.
 *  2. Cada escritura va en una transacción que empieza con `set_config('facylf.usuario', <admin>, true)` para que
 *     la auditoría (0034) guarde quién hizo el cambio.
 *  3. Los errores con código de 0043 se traducen a castellano (MENSAJES); cualquier otro, mensaje genérico y
 *     al registro de errores.
 */
import { revalidatePath } from 'next/cache';
import { Pool } from 'pg';
import { exigeAcceso } from '@/lib/acceso';

const db = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 5, statement_timeout: 5000 });

const MENSAJES: Record<string, string> = {
  SIN_PERMISO: 'No tienes permiso para gestionar usuarios.',
  FALTA_MOTIVO: 'Escribe el motivo (lo verá el usuario).',
  NO_A_UNO_MISMO: 'No puedes bloquear ni rechazar tu propia cuenta.',
  ULTIMO_ADMINISTRADOR: 'Es el único administrador activo: nombra a otro antes.',
  SOLO_PENDIENTES: 'Sólo se puede rechazar una solicitud pendiente. Para una cuenta activa, usa «Bloquear».',
  USUARIO_NO_EXISTE: 'Ese usuario ya no existe.',
  USUARIO_DADO_DE_BAJA: 'Ese usuario se dio de baja: no se puede reactivar.',
  ESTADO_NO_VALIDO: 'Estado no válido.',
  PAQUETE_NO_EXISTE: 'Ese paquete no existe o está desactivado.',
  USOS_NO_VALIDOS: 'Los usos tienen que estar entre 1 y 500.',
  INVITACION_PERSONAL_DE_UN_USO: 'Una invitación para un correo concreto sólo puede usarse una vez.',
  CORREO_NO_VALIDO: 'Ese correo no es válido.',
};
type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string };

async function comoAdmin<T>(sql: string, params: (admin: string) => unknown[], rutas: string[]): Promise<Resultado<T>> {
  const { userId } = await exigeAcceso({ admin: true });
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('facylf.usuario', $1, true)`, [userId]);
    const { rows } = await c.query(sql, params(userId));
    await c.query('commit');
    for (const r of rutas) revalidatePath(r);
    return { ok: true, dato: (rows[0] ? Object.values(rows[0])[0] : null) as T };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    const codigo = Object.keys(MENSAJES).find((k) => String((e as Error).message).includes(k));
    if (!codigo) console.error('[admin]', e);
    return { ok: false, error: codigo ? MENSAJES[codigo] : 'No se ha podido guardar. Inténtalo otra vez.' };
  } finally {
    c.release();
  }
}

// ── Solicitudes y cuentas ────────────────────────────────────────────────────────────────────────────
export async function aprobar(userId: string, paquete: string | null) {
  // Aprueba, deja aviso en la bandeja del usuario; notificaciones.mjs le manda el correo «Tu cuenta está aprobada».
  return comoAdmin('select app.aprueba_usuario($2, $1, $3)', (a) => [a, userId, paquete], ['/admin', '/admin/usuarios']);
}
export async function rechazar(userId: string, motivo: string) {
  return comoAdmin(`select app.cambia_estado_usuario($1, $2, 'rechazado', $3)`, (a) => [a, userId, motivo], ['/admin/usuarios']);
}
export async function bloquear(userId: string, motivo: string) {
  // Corta sus sesiones al momento (borra las de Better Auth): la siguiente página ya le lleva a /cuenta/sin-acceso.
  return comoAdmin(`select app.cambia_estado_usuario($1, $2, 'bloqueado', $3)`, (a) => [a, userId, motivo], ['/admin/usuarios']);
}
export async function reactivar(userId: string) {
  return comoAdmin(`select app.cambia_estado_usuario($1, $2, 'activo')`, (a) => [a, userId], ['/admin/usuarios']);
}

// ── Invitaciones ─────────────────────────────────────────────────────────────────────────────────────
/**
 * Crea la invitación y, si es para un correo, se lo manda con el enlace /registro?codigo=… (el código no se
 * enseña entero en la lista del panel después: se copia en el momento de crearla).
 */
export async function crearInvitacion(datos: { paquete: string; usos: number; dias: number | null; correo?: string; nota?: string }) {
  const correo = datos.correo?.trim() || null;
  const r = await comoAdmin<string>('select app.crea_invitacion($1, $2, $3, $4, $5, $6)',
    (a) => [a, datos.paquete, datos.usos, datos.dias, correo, datos.nota?.trim() || null], ['/admin/invitaciones']);
  if (r.ok && correo) {
    const enlace = new URL(`/registro?codigo=${encodeURIComponent(r.dato)}`, process.env.WEB_URL).href;
    await enviaCorreo(correo, 'facylf · tu invitación',
      `Te han invitado a facylf, la plataforma de fútbol federado.\n\nCrea tu cuenta con este enlace (caduca en ${datos.dias ?? 'unos'} días):\n${enlace}\n\nLa invitación sólo vale para este correo.`)
      .catch((e) => console.error('[admin] correo de invitación', e));
  }
  return r;
}
export async function anularInvitacion(codigo: string) {
  return comoAdmin<boolean>('select app.anula_invitacion($1, $2)', (a) => [a, codigo], ['/admin/invitaciones']);
}

// ── Modo de registro ─────────────────────────────────────────────────────────────────────────────────
export async function modoDeRegistro(modo: 'invitacion' | 'aprobacion' | 'abierto') {
  if (!['invitacion', 'aprobacion', 'abierto'].includes(modo)) return { ok: false, error: 'Modo no válido.' } as const;
  return comoAdmin(`update app.ajuste set valor = $2 where clave = 'registro_modo' returning valor`, (a) => [a, modo], ['/admin', '/registro']);
}

async function enviaCorreo(para: string, asunto: string, texto: string) {
  if (!process.env.SMTP_URL) { console.log(`[correo a ${para}] ${asunto}\n${texto}`); return; }
  const nodemailer = await import('nodemailer');
  await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.SMTP_DE, to: para, subject: asunto, text: texto });
}

/*
 * Formularios del panel (microcopia, CONTENIDO-MICROCOPIA.md):
 *  · Rechazar / Bloquear abren un diálogo con un campo obligatorio «Motivo (lo verá el usuario)», 3-200 caracteres,
 *    y el botón dice lo que hace: «Rechazar solicitud» / «Bloquear y cerrar sus sesiones». Sin «¿Estás seguro?».
 *  · Nueva invitación: Paquete (desplegable), «Para un correo concreto (opcional)», Usos (1 si hay correo, bloqueado),
 *    Caduca en (7 / 14 / 30 días / sin caducidad), Nota interna. Al crear: el código grande con «Copiar» y, si había
 *    correo, «Enviada a a***@ejemplo.es».
 *  · Modo de registro: tres opciones con su consecuencia debajo: «Sólo con invitación (recomendado)», «Cualquiera
 *    puede pedir cuenta; un administrador la aprueba», «Abierto: cualquiera entra con el paquete Esencial».
 */
