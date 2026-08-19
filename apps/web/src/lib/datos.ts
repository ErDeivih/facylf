import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseaCalendario } from '@fcylf/ingesta';
import { exigeCalendarioValido } from '@fcylf/ingesta';
import type { Partido } from '@fcylf/dominio';

/**
 * Fase 0: los datos salen del fichero real de la federación que hay en
 * `datos-ejemplo/`. Cuando el worker esté conectado, esta función lee de Supabase y
 * el resto de la web no se entera.
 */
export interface Competicion {
  nombre: string;
  temporada: string;
  partidos: Partido[];
  equipos: string[];
  jornadas: number;
}

let cache: Competicion | null = null;

export function competicion(): Competicion {
  if (cache) return cache;
  const ruta = join(process.cwd(), '..', '..', 'datos-ejemplo', 'Calendario.xls');
  const c = parseaCalendario(readFileSync(ruta));
  // si el parser devuelve algo raro, la web no arranca: mejor eso que enseñar mentiras
  exigeCalendarioValido(c.partidos);
  cache = {
    nombre: '1ª División Provincial de Juveniles, Primera · Salamanca',
    temporada: '2026/27',
    partidos: c.partidos,
    equipos: c.equipos,
    jornadas: c.jornadas,
  };
  return cache;
}

export const MI_EQUIPO = 'C.D. Munibar Pizarrales "B"';

export const aSlug = (n: string): string =>
  n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["“”']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
