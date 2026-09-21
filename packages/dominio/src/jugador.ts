/**
 * Identificación de jugadores a lo largo de las temporadas.
 *
 * Los nombres **no son únicos** (hay dos personas que se llaman igual). Para darle un ID
 * estable a cada jugador se usa esta regla de prioridad (la que pidió el usuario):
 *
 * El nombre normalizado es la clave de partida. Si hay homónimos, se puntúa en este orden:
 * provincia, club y equipo. El código federativo confirma coincidencias o separa dos personas.
 *
 * Es lógica pura: no depende de Supabase ni de Next. Se prueba sola.
 */

export interface ActuacionJugador {
  codigoJugador?: string | null;
  /** Nombre real (ya con consentimiento; el proyecto usa alias solo si no lo hay). */
  nombre: string;
  club: string | null;
  equipo?: string | null;
  provincia: string | null;
  temporada: string;
  dorsal?: number | null;
}

export interface JugadorIdentificado {
  id: string;
  nombre: string;
  clubes: string[];
  equipos: string[];
  provincias: string[];
  temporadas: string[];
  dorsales: number[];
}

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();

/** Hash determinista y estable (no criptográfico, basta para un id legible/estable). */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'j' + (h >>> 0).toString(36);
}

function creaJugador(actuaciones: ActuacionJugador[], semilla: string): JugadorIdentificado {
  return {
    id: hash(semilla),
    nombre: actuaciones[0]!.nombre,
    clubes: [...new Set(actuaciones.map((a) => a.club).filter((c): c is string => !!c))],
    equipos: [...new Set(actuaciones.map((a) => a.equipo).filter((e): e is string => !!e))],
    provincias: [...new Set(actuaciones.map((a) => a.provincia).filter((p): p is string => !!p))],
    temporadas: [...new Set(actuaciones.map((a) => a.temporada))],
    dorsales: [...new Set(actuaciones.map((a) => a.dorsal).filter((d): d is number => d != null))],
  };
}

/** Asigna un ID estable a cada jugador a partir de sus actuaciones (por temporada). */
export function identificaJugadores(actuaciones: ActuacionJugador[]): JugadorIdentificado[] {
  const porNombre = new Map<string, ActuacionJugador[]>();
  for (const a of actuaciones) {
    const k = norm(a.nombre);
    if (!k) continue;
    porNombre.set(k, [...(porNombre.get(k) ?? []), a]);
  }

  const out: JugadorIdentificado[] = [];
  for (const [, lista] of porNombre) {
    const grupos: ActuacionJugador[][] = [];
    for (const actuacion of [...lista].sort((a, b) => a.temporada.localeCompare(b.temporada))) {
      let mejor: { grupo: ActuacionJugador[]; puntos: number } | null = null;
      for (const grupo of grupos) {
        const codigos = new Set(grupo.map((a) => a.codigoJugador?.trim()).filter(Boolean));
        const codigo = actuacion.codigoJugador?.trim();
        if (codigo && codigos.size > 0 && !codigos.has(codigo)) continue;
        const provincias = new Set(grupo.map((a) => norm(a.provincia)).filter(Boolean));
        const clubes = new Set(grupo.map((a) => norm(a.club)).filter(Boolean));
        const equipos = new Set(grupo.map((a) => norm(a.equipo)).filter(Boolean));
        let puntos = codigo && codigos.has(codigo) ? 100 : 0;
        if (actuacion.provincia && provincias.has(norm(actuacion.provincia))) puntos += 30;
        if (actuacion.club && clubes.has(norm(actuacion.club))) puntos += 20;
        if (actuacion.equipo && equipos.has(norm(actuacion.equipo))) puntos += 10;
        if (grupo.some((a) => a.temporada === actuacion.temporada) && puntos < 100) puntos -= 50;
        if (puntos >= 30 && (!mejor || puntos > mejor.puntos)) mejor = { grupo, puntos };
      }
      if (mejor) mejor.grupo.push(actuacion);
      else grupos.push([actuacion]);
    }
    for (const grupo of grupos) {
      const provincia = [...new Set(grupo.map((a) => norm(a.provincia)).filter(Boolean))].sort()[0] ?? '';
      const club = [...new Set(grupo.map((a) => norm(a.club)).filter(Boolean))].sort()[0] ?? '';
      const equipo = [...new Set(grupo.map((a) => norm(a.equipo)).filter(Boolean))].sort()[0] ?? '';
      out.push(creaJugador(grupo, `${norm(grupo[0]!.nombre)}|${provincia}|${club}|${equipo}`));
    }
  }
  return out;
}

/** ID estable para una identidad ya resuelta por el proceso batch. */
export function idDeJugador(nombre: string, club: string | null, provincia: string | null,
  codigoJugador?: string | null, equipo?: string | null): string {
  if (codigoJugador?.trim()) return hash(`fed|${codigoJugador.trim()}`);
  const nombreN = norm(nombre);
  return hash(`${nombreN}|${norm(provincia)}|${norm(club)}|${norm(equipo)}`);
}
