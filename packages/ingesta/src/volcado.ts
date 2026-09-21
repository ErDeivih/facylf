/**
 * Vuelco del calendario parseado a las filas de la base de datos.
 *
 * Son funciones **puras**: no abren conexión ni escriben nada; sólo preparan las filas
 * y calculan qué ha cambiado. La conexión y el `upsert` los pone quien llama (cuando haya
 * proyecto de Supabase y credenciales). Así se puede probar sin base de datos.
 *
 * Esquema: `supabase/migrations/0002_equipos.sql` y `0003_partidos.sql`.
 */

import { clave, sufijoFilial } from '@facylf/dominio';
import type { Calendario } from './parsers/calendario.js';
import { hashBytes } from './vigilante.js';

export interface FilaEquipoVuelco {
  /** Tal cual lo escribe la federación, con sus comillas de filial. */
  nombre_fed: string;
  /** Nombre para mostrar; se le quitan las comillas del filial pero se conserva la letra. */
  nombre: string;
  filial: string | null;
  slug: string;
}

export interface FilaPartidoVuelco {
  jornada: number;
  fecha_jornada: string | null;
  local_slug: string;
  visitante_slug: string;
}

/** Clave única del equipo: la `clave` del dominio (base + `#filial`). Estable y sin
 *  ambigüedad entre filiales, que es lo que necesita una clave de base de datos. */
export function slugEquipo(nombreFed: string): string {
  return clave(nombreFed);
}

export function equiposDe(calendario: Calendario): FilaEquipoVuelco[] {
  const m = new Map<string, FilaEquipoVuelco>();
  for (const p of calendario.partidos) {
    for (const nombreFed of [p.local, p.visitante]) {
      const k = clave(nombreFed);
      if (m.has(k)) continue;
      const filial = sufijoFilial(nombreFed);
      m.set(k, {
        nombre_fed: nombreFed,
        nombre: nombreFed.replace(/["“”]/g, ''),
        filial,
        slug: k,
      });
    }
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function partidosDe(
  calendario: Calendario,
  fechaDeJornada: Map<number, string | null>,
): FilaPartidoVuelco[] {
  return calendario.partidos.map((p) => ({
    jornada: p.jornada,
    fecha_jornada: fechaDeJornada.get(p.jornada) ?? null,
    local_slug: clave(p.local),
    visitante_slug: clave(p.visitante),
  }));
}

/** Hash por jornada de los emparejamientos. Si no cambia, no se toca la base de datos
 *  y Realtime no despierta a nadie (ver skill `ingesta-federacion`). */
export function hashPorJornada(filas: FilaPartidoVuelco[]): Record<number, string> {
  const porJornada = new Map<number, FilaPartidoVuelco[]>();
  for (const f of filas) porJornada.set(f.jornada, [...(porJornada.get(f.jornada) ?? []), f]);
  const out: Record<number, string> = {};
  for (const [j, ps] of porJornada) {
    const s = ps
      .map((x) => `${x.fecha_jornada ?? ''}|${x.local_slug}|${x.visitante_slug}`)
      .sort()
      .join(';');
    out[j] = hashBytes(new TextEncoder().encode(s));
  }
  return out;
}

/** Jornadas cuyo contenido ha cambiado respecto al hash anterior. */
export function jornadasCambiadas(
  previo: Record<number, string>,
  actual: Record<number, string>,
): number[] {
  const todas = new Set<number>([...Object.keys(previo).map(Number), ...Object.keys(actual).map(Number)]);
  return [...todas]
    .filter((j) => previo[j] !== actual[j])
    .sort((a, b) => a - b);
}
