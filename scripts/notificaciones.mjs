#!/usr/bin/env node
/**
 * AVISOS A LOS USUARIOS (migración 0031): genera los avisos de lo que cada uno sigue y los entrega.
 *
 * 1. `app.genera_notificaciones()`: partido programado, cambio de fecha u hora, resultado, acta publicada,
 *    jornada completa del grupo seguido y lo que hizo el jugador seguido. Idempotente.
 * 2. Entrega:
 *    · en la aplicación: ya están en `app.notificacion` (la campana de la web las lee);
 *    · Web Push (móvil y escritorio, también con la web cerrada): con la librería `web-push` y las claves VAPID
 *      de .env (WEBPUSH_PUBLICA, WEBPUSH_PRIVADA, WEBPUSH_CONTACTO=mailto:…). Genera las claves una vez con
 *      `npx web-push generate-vapid-keys`. Una suscripción que responde 404/410 se borra (el usuario la quitó);
 *    · correo: «al momento» o «resumen» diario a la hora que elija el usuario, con `nodemailer` y SMTP_URL.
 *    Si una librería no está instalada, ese canal se salta y se dice; los demás siguen.
 * Respeta el horario de silencio de cada usuario (los push se quedan para después; la bandeja no).
 *
 *   node scripts/notificaciones.mjs              una pasada (tras el proyector; tarea cada 15 min)
 *   node scripts/notificaciones.mjs --resumen    sólo los correos de resumen (tarea cada hora en punto)
 * Rol: DATABASE_URL_PUBLICADOR. Para leer correos de usuarios hace falta leer auth.user (Better Auth): concede
 * `grant select (id, email, name) on auth."user" to facylf_publicador` cuando exista esa tabla.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile('.env'); } catch { /* entorno externo */ }
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireCanonico = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const requireWeb = createRequire(join(RAIZ, 'apps', 'web', 'package.json'));
const { Client } = requireCanonico('pg');
const opcional = (m) => { for (const r of [requireWeb, requireCanonico]) { try { return r(m); } catch { /* siguiente */ } } return null; };

const resumen = process.argv.includes('--resumen');
const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
if (!url || /facylf_admin/.test(url)) { console.error('✗ Falta DATABASE_URL_PUBLICADOR (y no puede ser admin).'); process.exit(2); }

const c = new Client({ connectionString: url, application_name: 'notificaciones' });
await c.connect();
await c.query(`set statement_timeout = '120s'`);
// Origen 'avisos' desde 0035; antes de aplicarla, el check de 0030 sólo admite los antiguos.
const anota = (nivel, tipo, mensaje, detalle = {}) => c.query(
  `insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ($1,'avisos',$2,$3,$4)`, [nivel, tipo, mensaje, detalle])
  .catch(() => c.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ($1,'vigilancia',$2,$3,$4)`,
    [nivel, tipo, mensaje, detalle]).catch(() => {}));
// Hora local de una zona en formato HH:MM, 00-23 (con 'es-ES' y hour12:false algunos ICU devuelven «24:00»).
const horaEn = (zona) => new Intl.DateTimeFormat('es-ES', { timeZone: zona || 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

const enSilencio = (p, zona = 'Europe/Madrid') => {
  if (!p?.silencio_desde || !p?.silencio_hasta) return false;
  const ahora = horaEn(zona);
  const [d, h] = [p.silencio_desde.slice(0, 5), p.silencio_hasta.slice(0, 5)];
  return d < h ? ahora >= d && ahora < h : ahora >= d || ahora < h;   // 23:00-08:00 cruza medianoche
};

async function pushes() {
  const webpush = opcional('web-push');
  if (!webpush || !process.env.WEBPUSH_PUBLICA || !process.env.WEBPUSH_PRIVADA) {
    console.log('· Web Push sin configurar (falta la librería web-push o las claves VAPID): se salta');
    return 0;
  }
  webpush.setVapidDetails(process.env.WEBPUSH_CONTACTO ?? 'mailto:admin@localhost', process.env.WEBPUSH_PUBLICA, process.env.WEBPUSH_PRIVADA);
  const { rows } = await c.query(`
    select n.id, n.user_id, n.titulo, n.cuerpo, n.url, pa.silencio_desde::text, pa.silencio_hasta::text, u.zona_horaria
      from app.notificacion n join app.preferencia_aviso pa on pa.user_id = n.user_id and pa.push
      join app.usuario u on u.user_id = n.user_id and u.activo
     where n.push_en is null and n.creada_en > now() - interval '2 days' order by n.id limit 500`);
  let enviados = 0; let fallidos = 0;
  for (const n of rows) {
    if (enSilencio(n, n.zona_horaria)) continue;
    const { rows: subs } = await c.query('select id, endpoint, p256dh, auth from app.suscripcion_push where user_id = $1', [n.user_id]);
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo, url: new URL(n.url ?? '/', WEB).href }), { TTL: 6 * 3600 });
        await c.query('update app.suscripcion_push set ultima_ok = now(), fallos = 0 where id = $1', [s.id]);
        enviados++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await c.query('delete from app.suscripcion_push where id = $1', [s.id]);
        else { await c.query('update app.suscripcion_push set fallos = fallos + 1 where id = $1', [s.id]); fallidos++; }
      }
    }
    await c.query('update app.notificacion set push_en = now() where id = $1', [n.id]);
  }
  if (fallidos) await anota('aviso', 'push_fallido', `${fallidos} envíos push fallidos`, { fallidos });
  return enviados;
}

async function correos(soloResumen) {
  const nodemailer = opcional('nodemailer');
  if (!nodemailer || !process.env.SMTP_URL) { console.log('· Correo sin configurar (nodemailer o SMTP_URL): se salta'); return 0; }
  const existeAuth = (await c.query(`select to_regclass('auth."user"') is not null ok`)).rows[0].ok;
  if (!existeAuth) { console.log('· Aún no hay tabla de usuarios de Better Auth: se salta el correo'); return 0; }
  const transporte = nodemailer.createTransport(process.env.SMTP_URL);
  const modo = soloResumen ? 'resumen' : 'al_momento';
  const { rows: usuarios } = await c.query(`
    select pa.user_id, au.email, pa.hora_resumen::text, u.zona_horaria
      from app.preferencia_aviso pa join app.usuario u on u.user_id = pa.user_id and u.activo
      join auth."user" au on au.id = pa.user_id
     where pa.correo = $1`, [modo]);
  let enviados = 0;
  for (const u of usuarios) {
    if (soloResumen) {
      const hora = horaEn(u.zona_horaria).slice(0, 2);
      if (hora !== u.hora_resumen.slice(0, 2)) continue;
    }
    const { rows: ns } = await c.query(`select id, titulo, cuerpo, url from app.notificacion
      where user_id = $1 and correo_en is null and creada_en > now() - interval '2 days' order by creada_en`, [u.user_id]);
    if (!ns.length) continue;
    const texto = ns.map((n) => `• ${n.titulo}${n.cuerpo ? ` — ${n.cuerpo}` : ''}\n  ${new URL(n.url ?? '/', WEB).href}`).join('\n');
    try {
      await transporte.sendMail({ from: process.env.SMTP_DE ?? 'facylf <no-responder@localhost>', to: u.email,
        subject: soloResumen ? `facylf · ${ns.length} novedades de lo que sigues` : ns[0].titulo,
        text: `${texto}\n\nCambia qué avisos recibes en ${new URL('/cuenta/avisos', WEB).href}` });
      await c.query('update app.notificacion set correo_en = now() where id = any($1)', [ns.map((n) => n.id)]);
      enviados++;
    } catch (e) { await anota('aviso', 'correo_fallido', e.message, { user: u.user_id.slice(0, 6) }); }
  }
  return enviados;
}

// Correos de CUENTA (0043: aprobada, caduca en 7 días / mañana): se mandan siempre, sin mirar las preferencias
// de avisos (son de servicio, no de novedades) y cada uno por separado.
async function correosDeCuenta() {
  const nodemailer = opcional('nodemailer');
  if (!nodemailer || !process.env.SMTP_URL) return 0;
  if (!(await c.query(`select to_regclass('auth."user"') is not null ok`)).rows[0].ok) return 0;
  const transporte = nodemailer.createTransport(process.env.SMTP_URL);
  const { rows } = await c.query(`
    select n.id, n.titulo, n.cuerpo, n.url, au.email, n.user_id
      from app.notificacion n join auth."user" au on au.id = n.user_id
     where n.tipo = 'cuenta' and n.correo_en is null and n.creada_en > now() - interval '2 days'
     order by n.creada_en limit 200`);
  let enviados = 0;
  for (const n of rows) {
    try {
      await transporte.sendMail({ from: process.env.SMTP_DE ?? 'facylf <no-responder@localhost>', to: n.email,
        subject: `facylf · ${n.titulo}`, text: `${n.cuerpo ?? ''}\n\n${new URL(n.url ?? '/', WEB).href}` });
      await c.query('update app.notificacion set correo_en = now() where id = $1', [n.id]);
      enviados++;
    } catch (e) { await anota('aviso', 'correo_fallido', e.message, { user: n.user_id.slice(0, 6), tipo: 'cuenta' }); }
  }
  return enviados;
}

try {
  if (!resumen) {
    const { rows: [g] } = await c.query('select app.genera_notificaciones() r');
    console.log(`Avisos: ${g.r.avisos} nuevos · ${g.r.partidos_vigilados} partidos vigilados · ${g.r.ms} ms${g.r.primera ? ' (primera pasada: sólo foto)' : ''}`);
    console.log(`Push enviados: ${await pushes()}`);
    // Avisos de caducidad (idempotentes: uno por usuario, fecha y plazo); sólo si 0043 está aplicada.
    if ((await c.query(`select to_regprocedure('app.avisa_caducidades()') is not null ok`)).rows[0].ok)
      console.log(`Avisos de caducidad: ${(await c.query('select app.avisa_caducidades() n')).rows[0].n}`);
    console.log(`Correos de cuenta: ${await correosDeCuenta()}`);
  }
  console.log(`Correos enviados: ${await correos(resumen)}`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  await anota('error', 'notificaciones_fallidas', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
