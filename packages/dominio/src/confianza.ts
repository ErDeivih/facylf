/** Cuánto nos fiamos de un resultado que ha puesto la gente desde el campo.
 *  El resultado **oficial** siempre gana: si existe, esto no se usa. */

export interface Reporte {
  usuarioId: string;
  golesLocal: number;
  golesVisitante: number;
  /** Reputación del usuario en el momento del reporte. */
  reputacion: number;
  /** ¿Es delegado de uno de los dos clubes del partido? */
  delegado: boolean;
  creado: string;
}

export type NivelConfianza = 'sin-confirmar' | 'coincidente' | 'confirmado' | 'oficial';

export interface Veredicto {
  golesLocal: number | null;
  golesVisitante: number | null;
  confianza: number;
  nivel: NivelConfianza;
  etiqueta: string;
  /** Hay reportes que se contradicen y ninguno manda: la interfaz debe decirlo. */
  enDisputa: boolean;
}

/** Reputación por debajo de la cual un reporte deja de sumar confianza.
 *  No se le avisa al usuario: si le avisas, se hace otra cuenta. */
export const REPUTACION_MINIMA = -15;

const ETIQUETAS: Record<NivelConfianza, string> = {
  'sin-confirmar': 'Sin confirmar — lo ha puesto una persona',
  'coincidente': 'Coincide entre varias personas',
  'confirmado': 'Confirmado por la grada',
  'oficial': 'Resultado oficial',
};

export function evalua(
  reportes: Reporte[],
  oficial?: { golesLocal: number | null; golesVisitante: number | null },
): Veredicto {
  if (oficial && oficial.golesLocal !== null && oficial.golesVisitante !== null) {
    return {
      golesLocal: oficial.golesLocal, golesVisitante: oficial.golesVisitante,
      confianza: 100, nivel: 'oficial', etiqueta: ETIQUETAS.oficial, enDisputa: false,
    };
  }

  const validos = reportes.filter((r) => r.reputacion > REPUTACION_MINIMA);
  if (validos.length === 0) {
    return { golesLocal: null, golesVisitante: null, confianza: 0, nivel: 'sin-confirmar',
      etiqueta: ETIQUETAS['sin-confirmar'], enDisputa: false };
  }

  // un usuario, un voto: se queda su reporte más reciente
  const ultimo = new Map<string, Reporte>();
  for (const r of [...validos].sort((a, b) => a.creado.localeCompare(b.creado))) {
    ultimo.set(r.usuarioId, r);
  }

  const bloques = new Map<string, Reporte[]>();
  for (const r of ultimo.values()) {
    const k = `${r.golesLocal}-${r.golesVisitante}`;
    bloques.set(k, [...(bloques.get(k) ?? []), r]);
  }

  const orden = [...bloques.entries()].sort((a, b) => b[1].length - a[1].length);
  const [marcador, ganador] = orden[0]!;
  const contradictorio = orden.length > 1;

  const reputacion = Math.min(30, ganador.reduce((s, r) => s + Math.max(0, r.reputacion), 0));
  const confianza = Math.max(0, Math.min(100,
    35 * ganador.length + reputacion
    + (ganador.some((r) => r.delegado) ? 15 : 0)
    - (contradictorio ? 25 : 0),
  ));

  const nivel: NivelConfianza = confianza >= 70 ? 'confirmado'
    : confianza >= 35 ? 'coincidente' : 'sin-confirmar';
  const [gl, gv] = marcador.split('-').map(Number) as [number, number];

  return { golesLocal: gl, golesVisitante: gv, confianza, nivel,
    etiqueta: ETIQUETAS[nivel], enDisputa: contradictorio };
}

/** Ajuste de reputación cuando llega el resultado oficial. */
export function ajustaReputacion(reporte: Reporte, oficialL: number, oficialV: number): number {
  const acierta = reporte.golesLocal === oficialL && reporte.golesVisitante === oficialV;
  return acierta ? 2 : -5;
}
