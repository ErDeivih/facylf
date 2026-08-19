/** Fechas en ISO (yyyy-mm-dd) y nada más. Sin Date con zona horaria: aquí un
 *  partido del sábado tiene que seguir siendo del sábado en cualquier servidor. */

export type Iso = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function aUTC(iso: Iso): Date {
  const m = RE.exec(iso);
  if (!m) throw new Error(`fecha no válida: ${iso}`);
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
}

export const aIso = (d: Date): Iso => d.toISOString().slice(0, 10);

export const sumaDias = (iso: Iso, n: number): Iso => {
  const d = aUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
};

/** 0 = domingo, 6 = sábado (como getUTCDay). */
export const diaSemana = (iso: Iso): number => aUTC(iso).getUTCDay();

export const esFinDeSemana = (iso: Iso): boolean => [0, 6].includes(diaSemana(iso));

/** Sábado de la semana a la que pertenece la fecha (el sábado anterior o el mismo). */
export function sabadoDe(iso: Iso): Iso {
  const d = diaSemana(iso);
  return sumaDias(iso, d === 6 ? 0 : -(d + 1));
}

export const diasEntre = (a: Iso, b: Iso): number =>
  Math.round((aUTC(b).getTime() - aUTC(a).getTime()) / 86_400_000);
