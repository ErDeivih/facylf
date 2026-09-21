import type { Partido } from '@facylf/dominio';
import { clave } from '@facylf/dominio';

export interface Problema {
  regla: string;
  detalle: string;
  /** `critico`: el calendario está mal (0 partidos, duplicado real). `aviso`: estructura
   *  distinta de la típica liga redonda (equipos impares, jornadas variables) — no fatal. */
  nivel: 'critico' | 'aviso';
}

/**
 * Comprobaciones que detectan casi cualquier fallo de un parser de calendario.
 *
 * Se ejecutan **siempre** antes de escribir en la base de datos: si un parseo devuelve 0
 * partidos donde antes devolvía 182, eso es un fallo (ver CLAUDE.md). Los avisos de
 * estructura (total, partidos-por-equipo) se marcan como `aviso` porque las ligas
 * provinciales de equipos impares o con abandonos no cuadran con la fórmula de la liga
 * redonda, y no por eso están mal.
 */
export function validaCalendario(partidos: Partido[]): Problema[] {
  const problemas: Problema[] = [];
  const equipos = [...new Set(partidos.flatMap((p) => [clave(p.local), clave(p.visitante)]))];
  const n = equipos.length;

  if (partidos.length === 0) {
    return [{ regla: 'no-vacio', detalle: 'el parser no ha devuelto ni un partido', nivel: 'critico' }];
  }

  // 1. liga a doble vuelta: n * (n-1) partidos (solo como aviso)
  const esperados = n * (n - 1);
  if (partidos.length !== esperados) {
    problemas.push({ regla: 'total', nivel: 'aviso', detalle: `${partidos.length} partidos, se esperaban ${esperados} con ${n} equipos` });
  }

  // 2. ningún emparejamiento repetido con el mismo local (esto sí es un fallo del parser)
  const vistos = new Set<string>();
  for (const p of partidos) {
    const k = `${clave(p.local)}|${clave(p.visitante)}`;
    if (vistos.has(k)) problemas.push({ regla: 'duplicado', nivel: 'critico', detalle: `${p.local} - ${p.visitante} aparece dos veces` });
    vistos.add(k);
  }

  // 3. nadie juega dos veces la misma jornada
  const porJornada = new Map<number, Partido[]>();
  for (const p of partidos) porJornada.set(p.jornada, [...(porJornada.get(p.jornada) ?? []), p]);
  for (const [j, ps] of porJornada) {
    const enJuego = new Set<string>();
    for (const p of ps) {
      for (const eq of [clave(p.local), clave(p.visitante)]) {
        if (enJuego.has(eq)) problemas.push({ regla: 'doble-partido', nivel: 'critico', detalle: `jornada ${j}: ${eq} juega dos veces` });
        enJuego.add(eq);
      }
    }
  }

  // 4. todos juegan lo mismo: 2*(n-1) partidos (solo como aviso)
  const cuenta = new Map<string, number>();
  for (const p of partidos) {
    for (const eq of [clave(p.local), clave(p.visitante)]) cuenta.set(eq, (cuenta.get(eq) ?? 0) + 1);
  }
  for (const [eq, c] of cuenta) {
    if (c !== 2 * (n - 1)) problemas.push({ regla: 'partidos-por-equipo', nivel: 'aviso', detalle: `${eq} juega ${c} partidos, se esperaban ${2 * (n - 1)}` });
  }

  return problemas;
}

/** Sólo falla si hay un problema crítico; los avisos de estructura no detienen el proceso. */
export function exigeCalendarioValido(partidos: Partido[]): void {
  const criticos = validaCalendario(partidos).filter((p) => p.nivel === 'critico');
  if (criticos.length) {
    throw new Error(`calendario no válido:\n` + criticos.map((x) => `  · [${x.regla}] ${x.detalle}`).join('\n'));
  }
}
