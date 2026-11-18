/**
 * Descensos directos del reglamento oficial de Castilla y León 2025/26.
 *
 * No incluye arrastres: dependen de los movimientos entre divisiones y, sin esos datos,
 * se devuelve `null` para que la interfaz diga «pendiente» en vez de inventar un número.
 */
export type ContextoReglamento = {
  federacion: string;
  categoria: string;
  division: string;
  grupo: string;
  equipos: number;
};

/** Letra del grupo («Grupo A», «A», «Grupo B»…) o null. */
function letra(grupo: string): 'A' | 'B' | null {
  const m = grupo.match(/(?:grupo\s*)?([AB])\b/i);
  return m ? (m[1]!.toUpperCase() as 'A' | 'B') : null;
}

export function descensosDirectos(c: ContextoReglamento): number | null {
  if (c.federacion !== 'castilla-leon') return null;
  const { categoria, division, equipos } = c;
  if (categoria === 'aficionados' && division === 'tercera-federacion') return 3;
  if (categoria === 'aficionados' && division === 'primera-regional') {
    const l = letra(c.grupo);
    return l === 'A' ? 4 : l === 'B' ? 3 : null;
  }
  if (categoria === 'juvenil' && division === 'liga-nacional') return 2;
  if (categoria === 'juvenil' && division === 'primera-regional') {
    const l = letra(c.grupo);
    return l === 'A' ? 4 : l === 'B' ? 3 : null;
  }
  if ((categoria === 'cadete' || categoria === 'infantil') && division.endsWith('regional')) return 3;
  if (categoria === 'aficionados' || categoria === 'juvenil' || categoria === 'cadete' || categoria === 'infantil') {
    if (division.includes('provincial')) {
      if (equipos >= 16) return 3;
      if (equipos >= 12) return 2;
      if (equipos >= 6) return 1;
    }
  }
  return null;
}

/** ¿El grupo puede perder un descenso si gana el play-off? */
export function grupoConPlayoff(c: ContextoReglamento): boolean {
  return c.federacion === 'castilla-leon'
    && (c.categoria === 'aficionados' || c.categoria === 'juvenil')
    && c.division === 'primera-regional';
}
