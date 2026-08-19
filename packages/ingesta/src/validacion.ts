import type { Partido } from '@fcylf/dominio';
import { clave } from '@fcylf/dominio';

export interface Problema { regla: string; detalle: string }

/**
 * Las cuatro comprobaciones que detectan casi cualquier fallo de un parser de
 * calendario. Se ejecutan **siempre** antes de escribir en la base de datos: si un
 * parseo devuelve 0 partidos donde antes devolvía 182, eso es un fallo, no un caso
 * vacío (ver CLAUDE.md).
 */
export function validaCalendario(partidos: Partido[]): Problema[] {
  const problemas: Problema[] = [];
  const equipos = [...new Set(partidos.flatMap((p) => [clave(p.local), clave(p.visitante)]))];
  const n = equipos.length;

  if (partidos.length === 0) {
    return [{ regla: 'no-vacio', detalle: 'el parser no ha devuelto ni un partido' }];
  }

  // 1. liga a doble vuelta: n * (n-1) partidos
  const esperados = n * (n - 1);
  if (partidos.length !== esperados) {
    problemas.push({ regla: 'total', detalle: `${partidos.length} partidos, se esperaban ${esperados} con ${n} equipos` });
  }

  // 2. ningún emparejamiento repetido con el mismo local
  const vistos = new Set<string>();
  for (const p of partidos) {
    const k = `${clave(p.local)}|${clave(p.visitante)}`;
    if (vistos.has(k)) problemas.push({ regla: 'duplicado', detalle: `${p.local} - ${p.visitante} aparece dos veces` });
    vistos.add(k);
  }

  // 3. nadie juega dos veces la misma jornada
  const porJornada = new Map<number, Partido[]>();
  for (const p of partidos) porJornada.set(p.jornada, [...(porJornada.get(p.jornada) ?? []), p]);
  for (const [j, ps] of porJornada) {
    const enJuego = new Set<string>();
    for (const p of ps) {
      for (const eq of [clave(p.local), clave(p.visitante)]) {
        if (enJuego.has(eq)) problemas.push({ regla: 'doble-partido', detalle: `jornada ${j}: ${eq} juega dos veces` });
        enJuego.add(eq);
      }
    }
  }

  // 4. todos juegan lo mismo: 2*(n-1) partidos
  const cuenta = new Map<string, number>();
  for (const p of partidos) {
    for (const eq of [clave(p.local), clave(p.visitante)]) cuenta.set(eq, (cuenta.get(eq) ?? 0) + 1);
  }
  for (const [eq, c] of cuenta) {
    if (c !== 2 * (n - 1)) problemas.push({ regla: 'partidos-por-equipo', detalle: `${eq} juega ${c} partidos, se esperaban ${2 * (n - 1)}` });
  }

  return problemas;
}

export function exigeCalendarioValido(partidos: Partido[]): void {
  const p = validaCalendario(partidos);
  if (p.length) {
    throw new Error(`calendario no válido:\n` + p.map((x) => `  · [${x.regla}] ${x.detalle}`).join('\n'));
  }
}
