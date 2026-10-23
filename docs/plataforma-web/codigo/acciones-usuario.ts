'use server';
/**
 * SERVER ACTIONS de la cuenta (migración 0037). Van a apps/web/src/app/(cuenta)/acciones.ts en la fase C.
 *
 * Reglas que cumplen todas:
 *  1. El usuario sale SIEMPRE de la sesión (`sesion()`), nunca de un parámetro del cliente.
 *  2. Cada escritura de un usuario es una función SQL de 0037 que valida y comprueba la propiedad
 *     (un usuario no puede tocar favoritos ni avisos de otro: lo garantiza el `where user_id = …`).
 *  3. Errores con código (DEMASIADOS_FAVORITOS, ZONA_NO_VALIDA…) → mensaje en castellano para la interfaz.
 *  4. Tras escribir, `revalidatePath` de lo que el usuario ve (Mi panel, la ficha donde pulsó la estrella).
 *  5. Ninguna acción de usuario se cachea entre usuarios (cache.ts sólo cachea lo público).
 */
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Pool } from 'pg';
import { auth } from '@/lib/auth';

const db = new Pool({ connectionString: process.env.DATABASE_URL_APP, max: 10, statement_timeout: 5000 });

const MENSAJES: Record<string, string> = {
  DEMASIADOS_FAVORITOS: 'Has llegado al máximo de favoritos. Quita alguno para guardar más.',
  ETIQUETA_NO_VALIDA: 'El nombre del favorito tiene que tener entre 1 y 80 caracteres.',
  BUSQUEDA_NO_VALIDA: 'Esa búsqueda no se puede guardar.',
  EQUIPO_NO_EXISTE: 'Ese equipo ya no existe.',
  NOMBRE_NO_VALIDO: 'El nombre tiene que tener entre 1 y 60 caracteres.',
  ZONA_NO_VALIDA: 'Esa zona horaria no existe.',
  CORREO_NO_VALIDO: 'Opción de correo no válida.',
  EVENTO_NO_VALIDO: 'Tipo de aviso no válido.',
  ENDPOINT_NO_VALIDO: 'Este navegador no permite avisos seguros.',
  ULTIMO_ADMINISTRADOR: 'Eres el único administrador: nombra a otro antes de darte de baja.',
};
type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string };

async function sesion(): Promise<string> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user?.id) redirect('/entrar');
  return s.user.id;
}

async function ejecuta<T>(sql: string, params: unknown[]): Promise<Resultado<T>> {
  try {
    const { rows } = await db.query(sql, params);
    return { ok: true, dato: (rows[0] ? Object.values(rows[0])[0] : null) as T };
  } catch (e) {
    const codigo = Object.keys(MENSAJES).find((k) => String((e as Error).message).includes(k));
    if (!codigo) console.error('[cuenta]', e);                 // lo recoge observabilidad.ts (anotaError)
    return { ok: false, error: codigo ? MENSAJES[codigo] : 'No se ha podido guardar. Inténtalo otra vez.' };
  }
}

// ── Favoritos ────────────────────────────────────────────────────────────────────────────────────────
export type TipoFavorito = 'equipo' | 'club' | 'competicion' | 'grupo' | 'jugador' | 'arbitro' | 'temporada' | 'busqueda';

/** La estrella de una ficha. `ruta` = la página donde se pulsó (para refrescarla). */
export async function guardarFavorito(tipo: TipoFavorito, entidad: number | null, etiqueta: string, ruta: string, clave?: string) {
  const u = await sesion();
  const r = await ejecuta<number>('select app.guarda_favorito($1, $2, $3, $4, $5)', [u, tipo, entidad, etiqueta, clave ?? null]);
  if (r.ok) { revalidatePath('/mi'); revalidatePath(ruta); }
  return r;
}
export async function quitarFavorito(id: number, ruta?: string) {
  const u = await sesion();
  const r = await ejecuta<boolean>('select app.quita_favorito($1, $2)', [u, id]);
  revalidatePath('/mi'); if (ruta) revalidatePath(ruta);
  return r;
}
export async function reordenarFavoritos(ids: number[]) {
  const u = await sesion();
  const r = await ejecuta<number>('select app.reordena_favoritos($1, $2::bigint[])', [u, ids]);
  revalidatePath('/mi');
  return r;
}
export async function avisarDeFavorito(id: number, avisar: boolean) {
  const u = await sesion();
  return ejecuta('select app.avisar_favorito($1, $2, $3)', [u, id, avisar]);
}

// ── Avisos ───────────────────────────────────────────────────────────────────────────────────────────
export async function marcarLeidos(ids?: number[]) {
  const u = await sesion();
  const r = await ejecuta<number>('select app.marca_leidos($1, $2::bigint[])', [u, ids ?? null]);
  revalidatePath('/mi');
  return r;
}
/** Suscripción del navegador a Web Push (la llama push-cliente.ts tras pedir permiso). */
export async function guardarSuscripcionPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, agente: string) {
  const u = await sesion();
  return ejecuta('select app.guarda_suscripcion_push($1, $2, $3, $4, $5)', [u, sub.endpoint, sub.keys.p256dh, sub.keys.auth, agente]);
}

// ── Perfil y preferencias ────────────────────────────────────────────────────────────────────────────
export async function guardarPerfil(nombre: string, zona: string) {
  const u = await sesion();
  const r = await ejecuta('select app.guarda_perfil($1, $2, $3)', [u, nombre, zona]);
  revalidatePath('/cuenta');
  return r;
}
export type Preferencias = Partial<{ en_app: boolean; push: boolean; correo: 'nunca' | 'al_momento' | 'resumen'; hora_resumen: string;
  silencio_desde: string | null; silencio_hasta: string | null; eventos: string[] }>;
export async function guardarPreferencias(p: Preferencias) {
  const u = await sesion();
  const r = await ejecuta('select app.guarda_preferencias($1, $2::jsonb)', [u, JSON.stringify(p)]);
  revalidatePath('/cuenta/avisos');
  return r;
}

// ── Derechos sobre los datos ─────────────────────────────────────────────────────────────────────────
/** Descargar mis datos: la página /cuenta/datos llama a esto y ofrece el JSON como fichero. */
export async function exportarMisDatos() {
  const u = await sesion();
  return ejecuta<Record<string, unknown>>('select app.exporta_mis_datos($1)', [u]);
}
/** Darse de baja: confirma con la contraseña en el formulario (Better Auth la comprueba al borrar). */
export async function darmeDeBaja(contrasena: string, motivo?: string) {
  const u = await sesion();
  const r = await ejecuta('select app.baja_usuario($1, $2)', [u, motivo ?? null]);
  if (!r.ok) return r;
  // Borra la cuenta de acceso (correo, contraseña, sesiones). Si falla, la de app ya quedó anonimizada e inactiva.
  await auth.api.deleteUser({ headers: await headers(), body: { password: contrasena } }).catch((e) => console.error('[baja]', e));
  redirect('/adios');
}
