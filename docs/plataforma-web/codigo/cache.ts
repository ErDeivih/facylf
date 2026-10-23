/**
 * CACHÉ DE LA WEB POR ETIQUETAS (migración 0036, ops.invalidacion). Va a apps/web/src/lib/cache.ts en la fase C.
 *
 * Idea: cada consulta del catálogo se guarda en la caché de Next con las etiquetas de lo que enseña
 * ('grupo:12', 'equipo:345', 'persona:789'…). Mientras el proyector no toque ese grupo, la página sale de la
 * caché sin tocar PostgreSQL. Cuando lo toca, apunta las etiquetas en ops.invalidacion y avisa a la web
 * (POST /api/revalidar); la web las consume y llama a revalidateTag. Si la web estaba parada, las recoge al
 * arrancar y cada minuto (instrumentation.ts).
 *
 * Reglas:
 *  · Lo PÚBLICO (fichas, clasificaciones, actas, rankings) se cachea por etiqueta, sin tiempo: sólo cambia
 *    cuando cambia el dato. Lo del USUARIO (Mi panel, avisos, ojeo con nombres de menores) nunca se cachea
 *    entre usuarios: va con el user_id en la clave o sin caché.
 *  · Los nombres de menores dependen del permiso: la consulta cacheada devuelve el nombre ya oculto
 *    (p_ver_menores = false); quien tenga permiso pide la versión sin caché.
 *  · Nada de caché en /admin (datos vivos).
 */
import { revalidateTag, unstable_cache } from 'next/cache';
import type { Consulta } from '@/consultas/contratos';
import { ejecuta } from '@/lib/db';            // el ejecutor existente (mide tiempos con observabilidad.ts)

/** Etiquetas de una consulta según sus parámetros. Se declaran junto a cada consulta del catálogo. */
export type Etiquetador = (params: readonly unknown[]) => string[];

export const ETIQUETAS: Record<string, Etiquetador> = {
  'club-por-id': ([club]) => [`club:${club}`],
  'equipos-del-club': ([club]) => [`club:${club}`],
  'evolucion-del-club': ([club]) => [`club:${club}`],
  'equipo-por-id': ([te]) => [`equipo:${te}`],
  'plantilla-del-equipo': ([te]) => [`equipo:${te}`],
  'partidos-del-equipo': ([te]) => [`equipo:${te}`],
  'curva-del-equipo': ([te]) => [`equipo:${te}`],
  'goles-por-tramo': ([te]) => [`equipo:${te}`],
  'persona-por-id': ([p]) => [`persona:${p}`],
  'trayectoria-de-persona': ([p]) => [`persona:${p}`],
  'trayectoria-unificada': ([p]) => [`persona:${p}`],
  'minutos-por-equipo': ([p]) => [`persona:${p}`],
  'comparador-jugadores': ([ps]) => (ps as number[]).map((p) => `persona:${p}`),
  'zonas-del-grupo': ([g]) => [`grupo:${g}`],
  'partidos-de-grupo': ([fed, g]) => [`federacion:${fed}`, `grupo-externo:${fed}:${g}`],
  'clasificación-del-grupo': ([fed, g]) => [`federacion:${fed}`, `grupo-externo:${fed}:${g}`],
  'goles-de-partidos': ([fed, g]) => [`federacion:${fed}`, `grupo-externo:${fed}:${g}`],
  'sanciones-inferidas': ([e]) => [`edicion:${e}`],
  'arbitros': ([, e]) => [e ? `edicion:${e}` : 'rankings'],
  'uso-de-cantera': ([e]) => [`edicion:${e}`],
  'ranking-goleadores': () => ['rankings'],
  'comparacion-de-ligas': () => ['rankings'],
  'ojeo-jugadores': ([fed]) => ['ojeo', fed ? `federacion:${fed}` : 'rankings'],
  'busqueda-por-nombre': () => ['busqueda'],
  'cobertura-por-federacion': () => ['rankings'],
};

/** Consulta cacheada: misma firma que ejecuta(), con etiquetas. Si la consulta no tiene etiquetador, no se cachea. */
export async function consultaCacheada<F>(c: Consulta<F>, params: readonly unknown[]): Promise<F[]> {
  const etiquetador = ETIQUETAS[c.nombre];
  if (!etiquetador) return ejecuta(c, params);
  const tags = ['todo', ...etiquetador(params)];
  return unstable_cache(() => ejecuta(c, params), [c.nombre, JSON.stringify(params)], { tags })();
}

/** Consume las etiquetas pendientes de ops.invalidacion y refresca. Devuelve cuántas. */
export async function consumeInvalidaciones(): Promise<number> {
  const filas = await ejecuta<{ etiqueta: string }>(
    { nombre: 'consume-invalidaciones', descripcion: '', plan: 'agregado', presupuestoMs: 200, columnas: ['etiqueta'],
      sql: 'select etiqueta from ops.consume_invalidaciones(2000) etiqueta' }, []);
  const vistas = new Set(filas.map((f) => f.etiqueta));
  for (const t of vistas) revalidateTag(t);
  return vistas.size;
}

/*
 * ── apps/web/src/app/api/revalidar/route.ts ─────────────────────────────────────────────────────────────
 *
 *   import { NextResponse } from 'next/server';
 *   import { consumeInvalidaciones } from '@/lib/cache';
 *   export async function POST(req: Request) {
 *     if (req.headers.get('authorization') !== `Bearer ${process.env.REVALIDAR_SECRETO}`) return new NextResponse(null, { status: 401 });
 *     return NextResponse.json({ refrescadas: await consumeInvalidaciones() });
 *   }
 *
 * ── apps/web/src/instrumentation.ts (además de lo que ya haya) ──────────────────────────────────────────
 *
 *   export async function register() {
 *     if (process.env.NEXT_RUNTIME !== 'nodejs') return;
 *     const { consumeInvalidaciones } = await import('@/lib/cache');
 *     const tic = () => consumeInvalidaciones().catch(() => {});
 *     tic(); setInterval(tic, 60_000).unref();
 *   }
 *
 * .env: REVALIDAR_SECRETO (32 bytes aleatorios, el mismo en el proyector) y WEB_URL en el entorno del proyector.
 */
