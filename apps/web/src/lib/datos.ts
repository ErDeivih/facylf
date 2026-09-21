import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reconstruyeTemporada, parseaCalendario, exigeCalendarioValido } from '@facylf/ingesta';
import type { Partido } from '@facylf/dominio';

/**
 * Lee de `descargas-federacion/` la primera temporada completa (calendario + resultados
 * por jornada) y la reconstruye con goles. Eso alimenta la clasificación, la evolución y
 * las gráficas de la web. Si aún no hay datos bajados, cae al fichero real de ejemplo.
 */
export interface Competicion {
  nombre: string;
  temporada: string;
  partidos: Partido[];
  equipos: string[];
  jornadas: number;
}

let cache: Competicion | null = null;

function primeraTemporada(carpeta: string): string | null {
  try {
    const n = readdirSync(carpeta).find((f) => /-calendario\.xlsx?$/i.test(f));
    if (!n) return null;
    return n.replace(/-calendario\.xlsx?$/i, '');
  } catch {
    return null;
  }
}

export function competicion(): Competicion {
  if (cache) return cache;

  const carpeta = join(process.cwd(), '..', '..', 'descargas-federacion');
  const slug = primeraTemporada(carpeta);

  if (slug) {
    const t = reconstruyeTemporada(slug, carpeta);
    cache = {
      nombre: slug,
      temporada: '—',
      partidos: t.partidos,
      equipos: [...new Set(t.partidos.flatMap((p) => [p.local, p.visitante]))].sort((a, b) => a.localeCompare(b, 'es')),
      jornadas: t.jornadas,
    };
    return cache;
  }

  // respaldo: el fichero real de ejemplo (fixtures, sin resultados todavía)
  const ruta = join(process.cwd(), '..', '..', 'datos-ejemplo', 'Calendario.xls');
  const c = parseaCalendario(readFileSync(ruta));
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

/** El equipo "mío" se puede elegir por slug cuando sea un equipo real de la competición. */
export const MI_EQUIPO = '';

export const aSlug = (n: string): string =>
  n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["“”']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
