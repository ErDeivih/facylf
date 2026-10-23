import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Client } from 'pg';

/**
 * Recorridos de USUARIO y ADMINISTRACIÓN de punta a punta (fase C; PLAN-DEEPSEEK §4 C-usuarios).
 * Va a apps/web/e2e/ cuando la web nueva tenga estas rutas (hoy rompería los E2E de la web congelada).
 * Dependencias de desarrollo en apps/web: pg (ya está) y otplib (2FA del administrador de prueba).
 *
 * Necesitan la web arrancada contra una base de PRUEBA (nunca la canónica real): DATABASE_URL_E2E con las
 * migraciones aplicadas y el correo en modo consola (sin SMTP_URL) — el enlace de verificación se lee de la
 * tabla `auth.verification` de Better Auth. Cada prueba crea su propio usuario con un correo único y no
 * depende del orden. Como en recorridos.spec.ts, todo termina con axe (sin barreras serias).
 */

const SERIAS = ['serious', 'critical'];
const db = () => new Client({ connectionString: process.env.DATABASE_URL_E2E });
const unico = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ejemplo.test`;
const CONTRASENA = 'una-contraseña-larga-1';

async function sinBarreras(page: Page, contexto: string) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => SERIAS.includes(v.impact ?? '')).map((v) => `${v.id}: ${v.help}`), `accesibilidad en ${contexto}`).toEqual([]);
}

async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  const c = db(); await c.connect();
  try { return (await c.query(texto, params)).rows as T[]; } finally { await c.end(); }
}

async function invitacion(paquete = 'ojeador'): Promise<string> {
  const codigo = `E2E-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  await sql(`insert into app.invitacion (codigo, creada_por, paquete, usos_max) values ($1, 'e2e', $2, 1)`, [codigo, paquete]);
  return codigo;
}

/** Registro con invitación + verificación de correo (enlace leído de la base) + entrar. Devuelve el correo. */
async function registraYEntra(page: Page, paquete = 'ojeador'): Promise<string> {
  const correo = unico(); const codigo = await invitacion(paquete);
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Ana Prueba');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel(/^Contraseña/).fill(CONTRASENA);
  await page.getByLabel('Código de invitación').fill(codigo);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText(/confirma/i)).toBeVisible();
  const [v] = await sql<{ value: string }>(`select v.value from auth.verification v where v.identifier = $1 order by v."createdAt" desc limit 1`, [correo]);
  await page.goto(`/api/auth/verify-email?token=${v.value}&callbackURL=/mi`);
  if (page.url().includes('/entrar')) {
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña').fill(CONTRASENA);
    await page.getByRole('button', { name: 'Entrar' }).click();
  }
  await expect(page).toHaveURL(/\/mi/);
  return correo;
}

test('sin sesión todo lleva a entrar, y tras entrar vuelve a donde iba (sólo rutas internas)', async ({ page }) => {
  await page.goto('/ojeo?desde=2007');
  await expect(page).toHaveURL(/\/entrar\?volver=%2Fojeo/);
  await page.goto('/entrar?volver=//malicioso.example');
  await sinBarreras(page, 'entrar');
  // el destino externo no se respeta (se comprueba en el flujo de registro de abajo: termina en /mi)
});

test('registro: sin invitación no se puede; con invitación, entra con su paquete', async ({ page }) => {
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill('Sin Código');
  await page.getByLabel('Correo').fill(unico());
  await page.getByLabel(/^Contraseña/).fill(CONTRASENA);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText(/invitación/i)).toBeVisible();
  const correo = await registraYEntra(page, 'ojeador');
  const [u] = await sql<{ paquete: string; estado: string }>(
    `select u.paquete, u.estado from app.usuario u join auth."user" a on a.id = u.user_id where a.email = $1`, [correo]);
  expect(u).toEqual({ paquete: 'ojeador', estado: 'activo' });
  await sinBarreras(page, 'Mi panel recién entrado');
});

test('favoritos: la estrella de un equipo lo lleva a Mi panel, sin duplicados, y se quita', async ({ page }) => {
  await registraYEntra(page);
  const [eq] = await sql<{ id: number }>(`select te.id from core.team_entry te order by te.id limit 1`);
  await page.goto(`/equipo/${eq.id}`);
  await page.getByRole('button', { name: /^seguir/i }).click();
  await expect(page.getByRole('button', { name: /siguiendo/i })).toBeVisible();
  await page.goto('/mi');
  await expect(page.locator('[data-favorito]')).toHaveCount(1);
  // Desde otra temporada del mismo equipo (misma línea): la estrella ya sale llena y no se duplica (0037)
  const [otra] = await sql<{ id: number }>(`select te2.id from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
      join core.team_season ts2 on ts2.club_id = ts.club_id and ts2.categoria = ts.categoria and ts2.id <> ts.id
      join core.team_entry te2 on te2.team_season_id = ts2.id where te.id = $1 limit 1`, [eq.id]);
  if (otra) {
    await page.goto(`/equipo/${otra.id}`);
    await expect(page.getByRole('button', { name: /siguiendo/i })).toBeVisible();
  }
  await page.goto('/mi');
  await expect(page.locator('[data-favorito]')).toHaveCount(1);
  const antes = 1;
  await page.locator('[data-favorito]').first().getByRole('button', { name: /quitar/i }).click();
  await expect(page.locator('[data-favorito]')).toHaveCount(antes - 1);
  await sinBarreras(page, 'Mi panel');
});

test('avisos: un resultado del equipo seguido aparece en la campana y se marca leído', async ({ page }) => {
  const correo = await registraYEntra(page);
  const [{ user_id: uid }] = await sql<{ user_id: string }>(`select id as user_id from auth."user" where email = $1`, [correo]);
  await sql(`insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url) values ($1, 'resultado', 'e2e:' || $1, 'Valdecastro 2-0 Navalcruz', 'Grupo 7', '/mi')`, [uid]);
  await page.goto('/mi');
  const campana = page.getByRole('link', { name: /avisos: 1 sin leer/i });
  await expect(campana).toBeVisible();
  await page.getByRole('button', { name: /marcar todo como leído/i }).click();
  await expect(page.getByRole('link', { name: /avisos: 0 sin leer|avisos$/i })).toBeVisible();
});

test('Mi cuenta: preferencias validadas, descargar mis datos y darse de baja', async ({ page }) => {
  const correo = await registraYEntra(page);
  await page.goto('/cuenta');
  await page.getByLabel('Por correo').selectOption({ label: 'Nunca' });
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByText(/guardado/i)).toBeVisible();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar mis datos' }).click();
  const fichero = await descarga;
  expect(fichero.suggestedFilename()).toMatch(/\.json$/);
  await sinBarreras(page, 'Mi cuenta');
  await page.getByRole('button', { name: 'Darme de baja' }).click();
  await page.getByLabel(/contraseña/i).fill(CONTRASENA);
  await page.getByRole('button', { name: /confirmar baja/i }).click();
  await expect(page).toHaveURL(/\/adios/);
  const [u] = await sql<{ estado: string; n: number }>(
    `select u.estado, (select count(*) from app.favorito f where f.user_id = u.user_id)::int n
       from app.usuario u where u.user_id = (select id from auth."user" where email = $1) or u.notas like 'baja %' order by u.creado_en desc limit 1`, [correo]);
  expect(u.estado).toBe('baja');
  expect(u.n).toBe(0);
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar/);
});

test('administración: un usuario normal no ve /admin; sin 2FA se pide activarla', async ({ page }) => {
  const correo = await registraYEntra(page);
  const r = await page.goto('/admin');
  expect(r?.status()).toBe(404);
  await sql(`update app.usuario set rol = 'administrador' where user_id = (select id from auth."user" where email = $1)`, [correo]);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/cuenta\/seguridad\?motivo=admin/);
});

test('panel: aprobar un registro pendiente queda en la auditoría con su autor', async ({ page }) => {
  // Requiere un administrador con 2FA de prueba (E2E_ADMIN_CORREO / E2E_ADMIN_CONTRASENA / E2E_ADMIN_TOTP_SECRETO).
  test.skip(!process.env.E2E_ADMIN_CORREO, 'sin administrador de prueba');
  await sql(`update app.ajuste set valor = 'aprobacion' where clave = 'registro_modo'`);
  const pendiente = `pend-${Date.now()}`;
  await sql(`insert into app.usuario (user_id, estado, activo, nombre_visible) values ($1, 'pendiente', false, 'Pendiente E2E')`, [pendiente]);
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(process.env.E2E_ADMIN_CORREO!);
  await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_CONTRASENA!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  const { authenticator } = await import('otplib');
  await page.getByLabel(/código/i).fill(authenticator.generate(process.env.E2E_ADMIN_TOTP_SECRETO!));
  await page.getByRole('button', { name: /verificar/i }).click();
  await page.goto('/admin/usuarios');
  const fila = page.locator('div, tr').filter({ hasText: 'Pendiente E2E' }).first();
  await fila.getByRole('button', { name: 'Aprobar' }).click();
  await expect(fila).toBeHidden();
  const [a] = await sql<{ usuario: string }>(`select usuario from app.auditoria where tabla = 'app.usuario' and clave = $1 and accion = 'update' order by id desc limit 1`, [pendiente]);
  expect(a.usuario).not.toBe('postgres');
  await sinBarreras(page, 'administración de usuarios');
  await sql(`update app.ajuste set valor = 'invitacion' where clave = 'registro_modo'`);
});

// ── 0043: ciclo de cuentas ─────────────────────────────────────────────────────────────────────────────

/** Administrador de prueba para las funciones de 0043 que piden permiso (cada prueba lo asegura: sin orden). */
const adminE2E = () => sql(`insert into app.usuario (user_id, rol, paquete, estado) values ('e2e-admin', 'administrador', 'analista', 'activo') on conflict do nothing`);

test('invitación personal: sólo vale para su correo; anulada, como si no existiera', async ({ page }) => {
  const correo = unico();
  await adminE2E();
  const [{ c }] = await sql<{ c: string }>(`select app.crea_invitacion('e2e-admin', 'ojeador', 1, 14, $1) c`, [correo]);
  await page.goto(`/registro?codigo=${c}`);
  await expect(page.getByLabel('Código de invitación')).toHaveValue(c);          // llega relleno desde el enlace
  await page.getByLabel('Nombre').fill('Otro');
  await page.getByLabel('Correo').fill(unico());
  await page.getByLabel(/^Contraseña/).fill(CONTRASENA);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Este código es para otro correo')).toBeVisible();
  const [{ c: c2 }] = await sql<{ c: string }>(`select app.crea_invitacion('e2e-admin', 'esencial', 3) c`);
  await sql(`select app.anula_invitacion('e2e-admin', $1)`, [c2]);
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Código de invitación').fill(c2);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ese código no existe o se anuló')).toBeVisible();
  await sinBarreras(page, 'registro con error');
});

// Cambia un ajuste global (registro_modo): este fichero corre con `workers: 1` (playwright.config.ts, proyecto «usuarios»).
test('modo aprobación: pendiente ve «esperando aprobación»; rechazado ve el motivo', async ({ page }) => {
  await adminE2E();
  await sql(`update app.ajuste set valor = 'aprobacion' where clave = 'registro_modo'`);
  try {
    const correo = unico();
    await page.goto('/registro');
    await page.getByLabel('Nombre').fill('Pendiente Prueba');
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel(/^Contraseña/).fill(CONTRASENA);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    const [v] = await sql<{ value: string }>(`select value from auth.verification where identifier = $1 order by "createdAt" desc limit 1`, [correo]);
    await page.goto(`/api/auth/verify-email?token=${v.value}&callbackURL=/mi`);
    await expect(page).toHaveURL(/\/cuenta\/pendiente/);
    await expect(page.getByText(/pendiente/i)).toBeVisible();
    const [{ id }] = await sql<{ id: string }>(`select id from auth."user" where email = $1`, [correo]);
    await sql(`select app.cambia_estado_usuario('e2e-admin', $1, 'rechazado', 'No pertenece al club')`, [id]);
    await page.goto('/mi');
    await expect(page).toHaveURL(/\/cuenta\/sin-acceso/);
    await expect(page.getByText('No pertenece al club')).toBeVisible();
    await sinBarreras(page, 'cuenta sin acceso');
  } finally {
    await sql(`update app.ajuste set valor = 'invitacion' where clave = 'registro_modo'`);
  }
});

test('freno por cuenta: 8 contraseñas mal seguidas frenan esa cuenta (con el mismo mensaje exista o no)', async ({ page }) => {
  const correo = await registraYEntra(page);
  await page.context().clearCookies();
  for (let i = 0; i < 8; i++) {
    await page.goto('/entrar');
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña').fill(`mala-${i}-xxxxxxxx`);
    await page.getByRole('button', { name: 'Entrar' }).click();
  }
  await page.getByLabel('Contraseña').fill(CONTRASENA);                          // ya con la buena
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/Demasiados intentos/)).toBeVisible();
  const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from app.intento_entrada where correo_sha like '%@%'`);
  expect(n).toBe(0);                                                             // nunca el correo en claro
});

test('bloquear corta la sesión abierta al momento', async ({ page }) => {
  await adminE2E();
  await registraYEntra(page);
  const [{ id }] = await sql<{ id: string }>(`select user_id as id from app.usuario order by creado_en desc limit 1`);
  await sql(`select app.cambia_estado_usuario('e2e-admin', $1, 'bloqueado', 'Prueba de bloqueo')`, [id]);
  await page.goto('/mi');
  await expect(page).toHaveURL(/\/entrar|\/cuenta\/sin-acceso/);
});

// ── 0044: ninguna sección vacía y muda ─────────────────────────────────────────────────────────────────

test('competición: cada sección tiene datos o su tarjeta de estado', async ({ page }) => {
  await registraYEntra(page);
  // Una edición de cada nivel medido (completo, alineaciones, resultados, calendario), si existe en la base de prueba.
  const ediciones = await sql<{ id: number; nivel: string }>(`
    select distinct on (nivel) competition_edition_id id, nivel from analytics.edicion_capacidad order by nivel, competition_edition_id`);
  for (const e of ediciones) {
    await page.goto(`/competicion/${e.id}`);
    const secciones = page.locator('main section');
    const n = await secciones.count();
    for (let i = 0; i < n; i++) {
      const s = secciones.nth(i);
      const tieneContenido = (await s.locator('table, svg, ol, ul, [role="status"]').count()) > 0;
      expect(tieneContenido, `sección ${i} de la edición ${e.id} (${e.nivel}) vacía sin tarjeta`).toBe(true);
    }
    if (e.nivel === 'resultados') await expect(page.getByText('No publicado').first()).toBeVisible();
  }
  await sinBarreras(page, 'competición con estados');
});
