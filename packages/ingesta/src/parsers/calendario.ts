import type { Partido } from '@fcylf/dominio';
import { decodifica, lineas } from '../texto.js';

export interface Calendario {
  partidos: Partido[];
  equipos: string[];
  jornadas: number;
  /** Fecha oficial de cada jornada (siempre domingo, aunque se juegue el sábado). */
  fechaDeJornada: Map<number, string | null>;
}

/** La cabecera puede venir en una línea ("Jornada 1 (20-09-2026)") o partida en dos,
 *  según cómo colapse el HTML. Se aceptan las dos formas. */
const RE_JORNADA = /^Jornada\s+(\d+)\s*(?:\((\d{2})-(\d{2})-(\d{4})\))?$/i;
const RE_FECHA = /^\((\d{2})-(\d{2})-(\d{4})\)$/;

export function parseaCalendario(entrada: string | Buffer | Uint8Array): Calendario {
  const html = typeof entrada === 'string' ? entrada : decodifica(entrada);
  const ls = lineas(html);

  const partidos: Partido[] = [];
  const fechaDeJornada = new Map<number, string | null>();
  let jornada: number | null = null;
  let fecha: string | null = null;

  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]!;

    const mj = RE_JORNADA.exec(l);
    if (mj) {
      jornada = Number(mj[1]);
      if (mj[2]) {
        fecha = `${mj[4]}-${mj[3]}-${mj[2]}`;
      } else {
        const mf = RE_FECHA.exec(ls[i + 1] ?? '');
        fecha = mf ? `${mf[3]}-${mf[2]}-${mf[1]}` : null;
        if (mf) i++;
      }
      fechaDeJornada.set(jornada, fecha);
      continue;
    }

    if (l !== '-') continue;

    const local = ls[i - 1], visitante = ls[i + 1];
    if (jornada === null || !local || !visitante) continue;
    // un guión suelto sin equipos alrededor no es un partido
    if (RE_JORNADA.test(local) || RE_JORNADA.test(visitante) || RE_FECHA.test(visitante)) continue;

    partidos.push({ jornada, fecha, local, visitante, golesLocal: null, golesVisitante: null });
    i++;
  }

  const equipos = [...new Set(partidos.flatMap((p) => [p.local, p.visitante]))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  return { partidos, equipos, jornadas: fechaDeJornada.size, fechaDeJornada };
}
