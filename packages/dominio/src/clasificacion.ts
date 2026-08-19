import type {
  CriterioDesempate, FilaClasificacion, Parcial, Partido, Sancion, Signo,
} from './tipos.js';
import { clave } from './normaliza.js';

export const jugado = (p: Partido): boolean =>
  p.golesLocal !== null && p.golesVisitante !== null;

const vacio = (): Parcial => ({
  jugados: 0, ganados: 0, empatados: 0, perdidos: 0,
  golesFavor: 0, golesContra: 0, puntos: 0,
});

function anota(acc: Parcial, gf: number, gc: number): Signo {
  acc.jugados++; acc.golesFavor += gf; acc.golesContra += gc;
  if (gf > gc) { acc.ganados++; acc.puntos += 3; return 'G'; }
  if (gf === gc) { acc.empatados++; acc.puntos += 1; return 'E'; }
  acc.perdidos++; return 'P';
}

interface Acumulado extends Parcial {
  equipo: string;
  racha: Signo[];
  casa: Parcial;
  fuera: Parcial;
}

export interface OpcionesClasificacion {
  /** Puntos restados por el comité de competición. La federación los aplica y no
   *  vienen en el calendario: si la tabla no cuadra con la oficial, mira aquí. */
  sanciones?: Sancion[];
}

/**
 * Clasificación calculada desde los partidos. Victoria 3, empate 1, derrota 0.
 *
 * El desempate sigue el reglamento habitual de Castilla y León:
 *   1. puntos
 *   2. enfrentamiento directo entre los empatados (mini-grupo completo)
 *   3. diferencia general de goles
 *   4. goles a favor
 *   5. sorteo  → se marca `sorteoPendiente`, no se inventa un orden
 *
 * El paso 2 **sólo se aplica si todos los empatados ya se han enfrentado entre sí
 * todas las veces que marca el calendario**. A mitad de temporada no se aplica.
 */
export function calculaClasificacion(
  partidos: Partido[],
  opciones: OpcionesClasificacion = {},
): FilaClasificacion[] {
  const tabla = new Map<string, Acumulado>();
  const nombre = new Map<string, string>();

  const alta = (eq: string): Acumulado => {
    const k = clave(eq);
    nombre.set(k, eq);
    let a = tabla.get(k);
    if (!a) { a = { equipo: eq, racha: [], casa: vacio(), fuera: vacio(), ...vacio() }; tabla.set(k, a); }
    return a;
  };

  for (const p of partidos) { alta(p.local); alta(p.visitante); }

  const cronologico = [...partidos].filter(jugado).sort(
    (a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.jornada - b.jornada,
  );

  for (const p of cronologico) {
    const l = alta(p.local), v = alta(p.visitante);
    const gl = p.golesLocal!, gv = p.golesVisitante!;
    l.racha.push(anota(l, gl, gv)); anota(l.casa, gl, gv);
    v.racha.push(anota(v, gv, gl)); anota(v.fuera, gv, gl);
  }

  const sancionDe = new Map<string, number>();
  for (const s of opciones.sanciones ?? []) {
    sancionDe.set(clave(s.equipo), (sancionDe.get(clave(s.equipo)) ?? 0) + s.puntos);
  }

  const filas: FilaClasificacion[] = [...tabla.entries()].map(([k, a]) => {
    const sancion = sancionDe.get(k) ?? 0;
    return {
      posicion: 0,
      equipo: a.equipo,
      jugados: a.jugados, ganados: a.ganados, empatados: a.empatados, perdidos: a.perdidos,
      golesFavor: a.golesFavor, golesContra: a.golesContra,
      puntos: a.puntos - sancion,
      diferencia: a.golesFavor - a.golesContra,
      racha: a.racha, casa: a.casa, fuera: a.fuera,
      sancion,
      desempatePor: null,
      sorteoPendiente: false,
    };
  });

  filas.sort((x, y) => y.puntos - x.puntos || x.equipo.localeCompare(y.equipo, 'es'));

  const ordenada: FilaClasificacion[] = [];
  let i = 0;
  while (i < filas.length) {
    let j = i;
    while (j + 1 < filas.length && filas[j + 1]!.puntos === filas[i]!.puntos) j++;
    const grupo = filas.slice(i, j + 1);
    ordenada.push(...(grupo.length === 1 ? grupo : desempata(grupo, partidos)));
    i = j + 1;
  }

  ordenada.forEach((f, n) => { f.posicion = n + 1; });
  return ordenada;
}

/** ¿Se han enfrentado ya todos los del grupo entre sí las veces previstas? */
export function enfrentamientoCompleto(grupo: string[], partidos: Partido[]): boolean {
  const claves = new Set(grupo.map(clave));
  const entreEllos = partidos.filter(
    (p) => claves.has(clave(p.local)) && claves.has(clave(p.visitante)),
  );
  if (entreEllos.length === 0) return false;
  return entreEllos.every(jugado);
}

function desempata(grupo: FilaClasificacion[], partidos: Partido[]): FilaClasificacion[] {
  const nombres = grupo.map((f) => f.equipo);
  const usaDirecto = enfrentamientoCompleto(nombres, partidos);
  const mini = usaDirecto ? miniGrupo(nombres, partidos) : null;

  const orden = [...grupo].sort((a, b) => {
    if (mini) {
      const ma = mini.get(clave(a.equipo))!, mb = mini.get(clave(b.equipo))!;
      const d = mb.puntos - ma.puntos
        || (mb.golesFavor - mb.golesContra) - (ma.golesFavor - ma.golesContra)
        || mb.golesFavor - ma.golesFavor;
      if (d !== 0) return d;
    }
    return b.diferencia - a.diferencia
      || b.golesFavor - a.golesFavor
      || a.equipo.localeCompare(b.equipo, 'es');
  });

  for (let n = 0; n < orden.length; n++) {
    const a = orden[n]!, b = orden[n + 1];
    if (!b) { a.desempatePor = a.desempatePor ?? 'puntos'; continue; }
    a.desempatePor = criterioEntre(a, b, mini);
    if (a.desempatePor === 'sorteo') { a.sorteoPendiente = true; b.sorteoPendiente = true; }
  }
  return orden;
}

function criterioEntre(
  a: FilaClasificacion, b: FilaClasificacion,
  mini: Map<string, Parcial> | null,
): CriterioDesempate {
  if (mini) {
    const ma = mini.get(clave(a.equipo))!, mb = mini.get(clave(b.equipo))!;
    if (ma.puntos !== mb.puntos) return 'enfrentamiento-directo';
    if (ma.golesFavor - ma.golesContra !== mb.golesFavor - mb.golesContra) return 'enfrentamiento-directo';
    if (ma.golesFavor !== mb.golesFavor) return 'enfrentamiento-directo';
  }
  if (a.diferencia !== b.diferencia) return 'diferencia-general';
  if (a.golesFavor !== b.golesFavor) return 'goles-favor';
  return 'sorteo';
}

/** Mini-liga con sólo los partidos entre los equipos del grupo. */
export function miniGrupo(grupo: string[], partidos: Partido[]): Map<string, Parcial> {
  const claves = new Set(grupo.map(clave));
  const m = new Map<string, Parcial>();
  for (const eq of grupo) m.set(clave(eq), vacio());
  for (const p of partidos) {
    if (!jugado(p)) continue;
    const kl = clave(p.local), kv = clave(p.visitante);
    if (!claves.has(kl) || !claves.has(kv)) continue;
    anota(m.get(kl)!, p.golesLocal!, p.golesVisitante!);
    anota(m.get(kv)!, p.golesVisitante!, p.golesLocal!);
  }
  return m;
}

/** Equipos que aparecen en el calendario, en orden alfabético español. */
export function equiposDe(partidos: Partido[]): string[] {
  const vistos = new Map<string, string>();
  for (const p of partidos) { vistos.set(clave(p.local), p.local); vistos.set(clave(p.visitante), p.visitante); }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
