import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reconstruyeTemporada, estructuraDe, type Ambito } from '@facylf/ingesta';
import type { Partido } from '@facylf/dominio';

/**
 * Capa de datos multi-competición de la web.
 *
 * Lee todas las competiciones descargadas en `descargas-federacion/` (los `*-calendario.xls`
 * y sus jornadas), las reconstruye y las complementa con la metadata del `catalogo.json`.
 *
 * Etiqueta por ámbito:
 *  - Provincial → se etiqueta la provincia (1ª/2ª/3ª por provincia).
 *  - Regional / Nacional / Fase de ascenso → nivel **Castilla y León** (sin provincia).
 */

export interface InfoCompeticion {
  slug: string;
  nombre: string;
  grupo: string | null;
  categoria: string | null;
  ambito: Ambito;
  provincia: string | null; // 'Castilla y León' para regional/nacional, o la provincia
  temporada: string | null;
  pj: number;
  conResultado: number;
  equipos: number;
  jornadas: number;
}

const CARPETA = join(process.cwd(), '..', '..', 'descargas-federacion');

interface CatalogoEntry {
  slug: string;
  nombre?: string;
  grupo?: string;
  categoria?: string;
  codDelegacion?: string;
  codTemporada?: string;
}

let catalogoCache: CatalogoEntry[] = [];

function catalogo(): CatalogoEntry[] {
  if (catalogoCache.length) return catalogoCache;
  try {
    catalogoCache = JSON.parse(readFileSync(join(CARPETA, 'catalogo.json'), 'utf8')) as CatalogoEntry[];
  } catch {
    catalogoCache = [];
  }
  return catalogoCache;
}

const PROVINCIAS: Record<string, string> = {
  '1000': 'Castilla y León',
  '1002': 'Ávila', '1003': 'Burgos', '1004': 'León', '1005': 'Palencia',
  '1006': 'Salamanca', '1007': 'Segovia', '1008': 'Soria', '1009': 'Valladolid',
  '1010': 'Zamora', '9636101': 'El Bierzo',
};

/** Etiqueta de ámbito: provincial → provincia; regional/nacional/fase → Castilla y León. */
function etiquetaProvincia(meta: CatalogoEntry | undefined, nombre: string): string | null {
  const amb = estructuraDe(nombre).ambito;
  if (amb === 'provincial' || amb === 'fase-ascenso') {
    return (meta?.codDelegacion && PROVINCIAS[meta.codDelegacion]) || null;
  }
  return 'Castilla y León'; // regional y nacional son de nivel CCyL
}

/** Nombre completo grupo+provincia que la federación usa (p. ej. "Primera - Salamanca"). */
function nombreGrupo(meta: CatalogoEntry | undefined): string | null {
  const g = meta?.grupo;
  if (!g) return null;
  return g;
}

export function listarCompeticiones(): InfoCompeticion[] {
  const cat = catalogo();
  let slugs: string[];
  try {
    slugs = readdirSync(CARPETA)
      .filter((f) => /-calendario\.xlsx?$/i.test(f))
      .map((f) => f.replace(/-calendario\.xlsx?$/i, ''));
  } catch {
    slugs = [];
  }
  return slugs.map((slug) => {
    const meta = cat.find((c) => c.slug === slug);
    const nombre = meta?.nombre ?? slug;
    let pj = 0, conResultado = 0, equipos = 0, jornadas = 0;
    try {
      const t = reconstruyeTemporada(slug, CARPETA);
      pj = t.partidos.length;
      conResultado = t.conResultado;
      jornadas = t.jornadas;
      equipos = new Set(t.partidos.flatMap((p: Partido) => [p.local, p.visitante])).size;
    } catch { /* aún no bajada del todo */ }
    return {
      slug,
      nombre,
      grupo: nombreGrupo(meta),
      categoria: meta?.categoria ?? null,
      ambito: estructuraDe(nombre).ambito,
      provincia: etiquetaProvincia(meta, nombre),
      temporada: meta?.codTemporada ?? null,
      pj, conResultado, equipos, jornadas,
    };
  }).sort((a, b) => (a.provincia ?? '').localeCompare(b.provincia ?? 'es') || (a.nombre ?? '').localeCompare(b.nombre ?? 'es'));
}

export function competicionDe(slug: string): InfoCompeticion & { partidos: Partido[] } {
  const meta = catalogo().find((c) => c.slug === slug);
  const nombre = meta?.nombre ?? slug;
  const t = reconstruyeTemporada(slug, CARPETA);
  return {
    slug,
    nombre,
    grupo: nombreGrupo(meta),
    categoria: meta?.categoria ?? null,
    ambito: estructuraDe(nombre).ambito,
    provincia: etiquetaProvincia(meta, nombre),
    temporada: meta?.codTemporada ?? null,
    pj: t.partidos.length,
    conResultado: t.conResultado,
    equipos: new Set(t.partidos.flatMap((p: Partido) => [p.local, p.visitante])).size,
    jornadas: t.jornadas,
    partidos: t.partidos,
  };
}
