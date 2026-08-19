import type { Partido } from './tipos.js';
import { jugado } from './clasificacion.js';
import { mismoEquipo } from './normaliza.js';
import { aIso, diasEntre, sabadoDe, sumaDias, type Iso } from './fechas.js';
import { festivoEn, type Festivo } from './festivos.js';

export interface FinDeSemana {
  sabado: Iso;
  domingo: Iso;
  /** Partidos de nuestro equipo ese fin de semana. */
  propios: Partido[];
  /** Partidos de cualquier equipo del grupo ese fin de semana. */
  liga: Partido[];
  festivo: Festivo | null;
}

export type MotivoDescanso =
  | 'jornada-sin-nosotros'
  | 'liga-no-empezada'
  | 'temporada-terminada'
  | 'paron';

export interface Descanso extends FinDeSemana {
  motivo: MotivoDescanso;
}

/** Todos los fines de semana entre dos fechas, con lo que pasa en cada uno.
 *  Las jornadas NO son semanas consecutivas: en 26 jornadas hay 8 findes sin liga. */
export function finesDeSemana(
  partidos: Partido[],
  equipo: string,
  inicio: Iso,
  fin: Iso,
  festivos?: readonly Festivo[],
): FinDeSemana[] {
  const out: FinDeSemana[] = [];
  let sab = sabadoDe(inicio);
  if (sab < inicio) sab = sumaDias(sab, 7);
  while (sab <= fin) {
    const dom = sumaDias(sab, 1);
    const enFinde = (p: Partido) => p.fecha === sab || p.fecha === dom;
    out.push({
      sabado: sab,
      domingo: dom,
      liga: partidos.filter(enFinde),
      propios: partidos.filter((p) => enFinde(p) && esDe(p, equipo)),
      // el festivo que explica el parón puede caer entre semana (Reyes, Semana Santa)
      festivo: [-2, -1, 0, 1, 2, 3, 4]
        .map((n) => festivoEn(sumaDias(sab, n), festivos))
        .find(Boolean) ?? null,
    });
    sab = sumaDias(sab, 7);
  }
  return out;
}

export const esDe = (p: Partido, equipo: string): boolean =>
  mismoEquipo(p.local, equipo) || mismoEquipo(p.visitante, equipo);

export function descansos(
  partidos: Partido[], equipo: string, inicio: Iso, fin: Iso, festivos?: readonly Festivo[],
): Descanso[] {
  const conFecha = partidos.map((p) => p.fecha).filter((f): f is Iso => !!f).sort();
  const primera = conFecha[0], ultima = conFecha[conFecha.length - 1];
  return finesDeSemana(partidos, equipo, inicio, fin, festivos)
    .filter((w) => w.propios.length === 0)
    .map((w) => ({
      ...w,
      motivo: w.liga.length ? 'jornada-sin-nosotros'
        : primera && w.domingo < primera ? 'liga-no-empezada'
        : ultima && w.sabado > ultima ? 'temporada-terminada'
        : 'paron',
    }));
}

export interface ProximoPartido {
  partido: Partido;
  enCasa: boolean;
  rival: string;
  diasRestantes: number;
}

/** El siguiente partido del equipo a partir de `hoy` (ISO). */
export function proximoPartido(
  partidos: Partido[], equipo: string, hoy: Iso = aIso(new Date()),
): ProximoPartido | null {
  const p = partidos
    .filter((x) => esDe(x, equipo) && !jugado(x) && x.fecha && x.fecha >= hoy)
    .sort((a, b) => a.fecha!.localeCompare(b.fecha!) || a.jornada - b.jornada)[0];
  if (!p) return null;
  const enCasa = mismoEquipo(p.local, equipo);
  return { partido: p, enCasa, rival: enCasa ? p.visitante : p.local, diasRestantes: diasEntre(hoy, p.fecha!) };
}
