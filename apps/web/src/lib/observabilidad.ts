/**
 * Observabilidad de la web (migración 0030). Tres piezas, sin dependencias externas:
 *
 *  1. `midiendo(consulta, fn)`: envuelve CADA ejecución de una Consulta nombrada. Acumula en memoria los
 *     tiempos por consulta y minuto y los vuelca a `ops.consulta_minuto` una vez por minuto (una sola
 *     sentencia, sin bloquear la petición). Así la pantalla «Salud» y la vigilancia ven p50/p95/máx y cuántas
 *     pasan de su `presupuestoMs`.
 *  2. `anotaError(tipo, error, contexto)`: errores de servidor a `ops.evento_app` (nivel error), con el id de
 *     petición, la ruta como patrón (/jugador/[id]) y el usuario como hash. NUNCA nombres de jugadores.
 *  3. `registraWebVital(ruta, metrica, valor)`: lo llama /api/web-vitals (el cliente manda LCP, INP, CLS con
 *     `navigator.sendBeacon`); se agrega en memoria y se vuelca como p75 diario a `ops.web_vital`.
 *
 * Conexión: un Pool con el rol facylf_app (puede INSERTAR en ops; no puede leer nada sensible). Si la base
 * no responde, se descarta lo acumulado en silencio: la observabilidad nunca tumba la web.
 *
 * Integración (DeepSeek, fase 3 del plan):
 *   · apps/web/src/consultas/ejecuta.ts (o donde se llame a pool.query con una Consulta):
 *       return midiendo(consulta, () => pool.query(consulta.sql, params));
 *   · app/global-error.tsx y los route handlers: `anotaError('pagina_500', e, { ruta, peticionId })`.
 *   · middleware.ts: genera `x-peticion-id` (crypto.randomUUID()) y lo pasa por cabecera.
 *   · app/api/salud/route.ts: `select 1` con timeout 2 s + versión de migración; 200 o 503. Sin datos.
 *   · app/api/web-vitals/route.ts: valida {ruta, metrica, valor} y llama a registraWebVital.
 *   · app/layout.tsx (cliente): `useReportWebVitals` de next/web-vitals → sendBeacon('/api/web-vitals').
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

type Muestra = { ms: number[]; errores: number; sobre: number; presupuesto: number | null };
const porMinuto = new Map<string, Map<string, Muestra>>();     // minuto ISO → consulta → muestras
const vitales = new Map<string, number[]>();                    // `${dia}|${ruta}|${metrica}` → valores
let pool: Pool | null = null;
let temporizador: NodeJS.Timeout | null = null;

export function configuraObservabilidad(p: Pool) {
  pool = p;
  if (!temporizador) {
    temporizador = setInterval(() => { void vuelca(); }, 60_000);
    temporizador.unref?.();
  }
}

const minutoDe = (d = new Date()) => { const m = new Date(d); m.setSeconds(0, 0); return m.toISOString(); };
const percentil = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.ceil((p / 100) * o.length) - 1))];
};

export async function midiendo<T>(consulta: { nombre: string; presupuestoMs?: number }, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  let fallo = false;
  try {
    return await fn();
  } catch (e) {
    fallo = true;
    await anotaError('consulta_fallida', e, { consulta: consulta.nombre });
    throw e;
  } finally {
    const ms = Math.round(performance.now() - t);
    const min = minutoDe();
    const tabla = porMinuto.get(min) ?? new Map<string, Muestra>();
    porMinuto.set(min, tabla);
    const m = tabla.get(consulta.nombre) ?? { ms: [], errores: 0, sobre: 0, presupuesto: consulta.presupuestoMs ?? null };
    m.ms.push(ms);
    if (fallo) m.errores++;
    if (consulta.presupuestoMs && ms > consulta.presupuestoMs) m.sobre++;
    tabla.set(consulta.nombre, m);
  }
}

export function hashUsuario(id: string | null | undefined) {
  return id ? createHash('sha256').update(`facylf:${id}`).digest('hex').slice(0, 16) : null;
}

export async function anotaError(tipo: string, error: unknown, contexto: { ruta?: string; peticionId?: string; usuarioId?: string; [k: string]: unknown } = {}) {
  if (!pool) return;
  const e = error instanceof Error ? error : new Error(String(error));
  const { ruta, peticionId, usuarioId, ...resto } = contexto;
  try {
    await pool.query(
      `insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle, peticion_id, usuario, ruta) values ('error','web',$1,$2,$3,$4,$5,$6)`,
      [tipo, e.message.slice(0, 500), { pila: e.stack?.split('\n').slice(0, 6).join('\n'), ...resto }, peticionId ?? null, hashUsuario(usuarioId), ruta ?? null],
    );
  } catch { /* la observabilidad nunca tumba la web */ }
}

export function registraWebVital(ruta: string, metrica: 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP', valor: number) {
  if (!/^\/[\w\-/[\]]*$/.test(ruta) || !Number.isFinite(valor) || valor < 0) return;   // patrón de ruta, nunca ids
  const clave = `${new Date().toISOString().slice(0, 10)}|${ruta}|${metrica}`;
  const xs = vitales.get(clave) ?? [];
  if (xs.length < 5000) xs.push(valor);
  vitales.set(clave, xs);
}

async function vuelca() {
  if (!pool) return;
  const ahora = minutoDe();
  const filas: unknown[][] = [];
  for (const [min, tabla] of porMinuto) {
    if (min === ahora) continue;                       // el minuto en curso se vuelca en la siguiente vuelta
    for (const [consulta, m] of tabla) {
      filas.push([min, consulta, m.ms.length, percentil(m.ms, 50), percentil(m.ms, 95), Math.max(...m.ms), m.errores, m.sobre, m.presupuesto]);
    }
    porMinuto.delete(min);
  }
  try {
    for (const f of filas) {
      await pool.query(
        `insert into ops.consulta_minuto (minuto, consulta, n, ms_p50, ms_p95, ms_max, errores, sobre_presupuesto, presupuesto_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (minuto, consulta) do update set n = ops.consulta_minuto.n + excluded.n,
           ms_p95 = greatest(ops.consulta_minuto.ms_p95, excluded.ms_p95), ms_max = greatest(ops.consulta_minuto.ms_max, excluded.ms_max),
           errores = ops.consulta_minuto.errores + excluded.errores, sobre_presupuesto = ops.consulta_minuto.sobre_presupuesto + excluded.sobre_presupuesto`, f);
    }
    for (const [clave, xs] of vitales) {
      const [dia, ruta, metrica] = clave.split('|');
      await pool.query(
        `insert into ops.web_vital (dia, ruta, metrica, p75, n) values ($1,$2,$3,$4,$5)
         on conflict (dia, ruta, metrica) do update set p75 = excluded.p75, n = excluded.n`, [dia, ruta, metrica, percentil(xs, 75), xs.length]);
      if (dia !== new Date().toISOString().slice(0, 10)) vitales.delete(clave);   // el día ya cerró
    }
  } catch { /* se pierde un minuto de métricas; no pasa nada */ }
}
