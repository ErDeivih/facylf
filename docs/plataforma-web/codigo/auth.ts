/**
 * Cuentas de usuario con Better Auth (migraciones 0027 y 0031). Esqueleto listo para la fase C del plan. Vive en docs/plataforma-web/codigo/ para no romper la compilación
 * mientras better-auth no esté instalado: en la fase C se mueve a apps/web/src/lib/auth.ts.
 *
 * Decisiones:
 *  · Tablas de Better Auth en el esquema `auth` (pool con `search_path=auth`), separadas de `app` (lo nuestro:
 *    rol, paquete, favoritos, avisos). La web conecta como `facylf_app` (0027 le da `create on schema auth`).
 *    Crear las tablas: `npx @better-auth/cli migrate` una vez, con DATABASE_URL_APP.
 *  · Correo + contraseña con verificación de correo; enlace mágico opcional; 2FA (TOTP) obligatorio para
 *    administradores (lo exige la web al entrar en /admin si `twoFactorEnabled` es falso).
 *  · Registro según `app.ajuste.registro_modo` (invitación / aprobación / abierto): el formulario de alta manda
 *    `codigoInvitacion`; el gancho `after` llama a `app.alta_usuario`, y si lanza error se borra la cuenta.
 *  · Límites SÓLO en entrar, registrarse y recuperar contraseña (5/min por IP); el resto de rutas (consultar la
 *    sesión, que se hace en cada página) con el límite general holgado. Sesiones de 30 días renovadas al usar.
 *  · Cada entrada fallida o registro rechazado va a ops.evento_app (origen 'auth', 0035): la vigilancia avisa si
 *    hay 10 en 15 minutos (posible ataque de contraseñas).
 *  · Contraseñas: mínimo 10 caracteres; Better Auth las guarda con scrypt.
 *  · 0043: además del límite por IP, FRENO POR CUENTA: antes de comprobar la contraseña se pregunta
 *    `app.espera_entrada(correo)` (8 fallos seguidos en 15 min → 15 min de espera) y después de cada intento se
 *    anota con `app.anota_entrada(correo, ok)`. En la base sólo queda el resumen SHA-256 del correo. El mensaje
 *    es el mismo exista o no la cuenta (no se puede averiguar quién está registrado).
 *  · 0043: el alta pasa el correo a `app.alta_usuario` (las invitaciones personales sólo valen para su correo).
 *  · Qué ve cada usuario según su estado (pendiente, rechazado, bloqueado, caducado, admin sin 2FA): acceso.ts.
 *
 * Dependencias a instalar en apps/web: better-auth, pg (ya está), nodemailer (correo de verificación).
 */
import { betterAuth } from 'better-auth';
import { twoFactor, magicLink } from 'better-auth/plugins';
import { createAuthMiddleware, APIError } from 'better-auth/api';   // comprobar la ruta de import con la versión instalada
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_APP,      // rol facylf_app
  options: '-c search_path=auth',
  max: 5,
});
const app = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 5 });

async function enviaCorreo(para: string, asunto: string, texto: string) {
  // nodemailer con SMTP_URL; en desarrollo, a la consola.
  if (!process.env.SMTP_URL) { console.log(`[correo a ${para}] ${asunto}\n${texto}`); return; }
  const nodemailer = await import('nodemailer');
  await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.SMTP_DE, to: para, subject: asunto, text: texto });
}

export const auth = betterAuth({
  appName: 'facylf',
  baseURL: process.env.WEB_URL,
  secret: process.env.BETTER_AUTH_SECRET,               // 32+ bytes aleatorios; nunca en el repositorio
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => enviaCorreo(user.email, 'facylf · cambiar la contraseña', `Para cambiarla: ${url}`),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => enviaCorreo(user.email, 'facylf · confirma tu correo', `Confirma tu cuenta: ${url}`),
  },
  user: {
    additionalFields: {
      // Llega del formulario de alta; no se devuelve nunca al cliente.
      codigoInvitacion: { type: 'string', required: false, input: true, returned: false },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true, window: 60, max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 3 },
      '/forget-password': { window: 300, max: 3 },
      '/sign-in/magic-link': { window: 300, max: 3 },
      '/two-factor/verify-totp': { window: 60, max: 5 },
    },
  },
  hooks: {
    // Freno por cuenta (0043): antes de mirar la contraseña.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const correo = String((ctx.body as { email?: string } | undefined)?.email ?? '');
      const { rows } = await app.query('select app.espera_entrada($1) as s', [correo]);
      const s = Number(rows[0]?.s ?? 0);
      if (s > 0) throw new APIError('TOO_MANY_REQUESTS',
        { message: `Demasiados intentos. Vuelve a probar dentro de ${Math.ceil(s / 60)} minutos o cambia la contraseña.` });
    }),
    // Rastro de entradas fallidas para la vigilancia (nunca el correo entero ni la contraseña).
    after: createAuthMiddleware(async (ctx) => {
      const r = ctx.context.returned;
      if (ctx.path === '/sign-in/email') {
        const correo = String((ctx.body as { email?: string } | undefined)?.email ?? '');
        await app.query('select app.anota_entrada($1, $2)', [correo, !(r instanceof APIError)]).catch(() => {});
      }
      if (!(r instanceof APIError) || !/^\/(sign-in|sign-up|two-factor|forget-password)/.test(ctx.path)) return;
      const correo = String((ctx.body as { email?: string } | undefined)?.email ?? '');
      await app.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ('aviso', 'auth', $1, $2, $3)`,
        [ctx.path.replace(/^\//, '').replace(/\//g, '_') + '_fallido', r.message?.slice(0, 200) ?? 'error',
         { dominio: correo.split('@')[1] ?? null, ip: ctx.headers?.get('x-forwarded-for')?.split(',')[0]?.trim().replace(/\.\d+$/, '.0') ?? null }])
        .catch(() => {});
    }),
  },
  plugins: [
    twoFactor({ issuer: 'facylf' }),
    magicLink({ sendMagicLink: async ({ email, url }) => enviaCorreo(email, 'facylf · enlace para entrar', `Entra con: ${url}`) }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const codigo = (user as { codigoInvitacion?: string }).codigoInvitacion ?? null;
          try {
            await app.query('select app.alta_usuario($1, $2, $3, $4)', [user.id, codigo, user.name ?? null, user.email]);
          } catch (e) {
            // Registro no permitido (sin invitación, caducada, agotada): se deshace el alta.
            await pool.query('delete from "user" where id = $1', [user.id]);
            throw e;
          }
        },
      },
    },
  },
});

/** Permiso de la sesión actual (lo usan las páginas y las consultas). */
export async function puede(userId: string | undefined, capacidad: string): Promise<boolean> {
  if (!userId) return false;
  const { rows } = await app.query('select app.puede($1, $2) as ok', [userId, capacidad]);
  return rows[0]?.ok === true;
}
