/**
 * Predicción de un partido: tipos y textos de la ficha.
 *
 * La web NO calcula el modelo: lee los porcentajes ya guardados en `analytics.poisson_partido` y la
 * media de la liga en `analytics.poisson_liga` (migración 0061). Aquí sólo se formatea y se explica.
 */

export type PrediccionDePartido = {
  prob_local: number;
  prob_empate: number;
  prob_visitante: number;
  marcador_probable: string;
  prob_marcador: number;
  /** Media de goles por partido de la liga (local + visitante). */
  media_total: number;
  /** media_local / media_visitante de la liga. */
  ventaja_casa: number;
  /** Partidos con marcador con los que se estimó la liga. */
  partidos_liga: number;
};

/** Porcentaje compacto para la lista de la jornada: 60 %. */
export function porcentajeCorto(valor: number): string {
  return `${Math.round(Number(valor))} %`;
}

/** Porcentaje en español, con un decimal: 59,8 %. */
export function formateaPorcentaje(valor: number): string {
  return `${Number(valor).toFixed(1).replace('.', ',')} %`;
}

function numero(valor: number, decimales: number): string {
  return Number(valor).toFixed(decimales).replace('.', ',');
}

/**
 * Una línea con lo que dice el modelo y con qué datos de la liga. Sin jerga técnica y sin prometer
 * acierto: es una expectativa, no una apuesta.
 */
export function lineaDePrediccion({ local, visitante, media_total, ventaja_casa, partidos_liga }: {
  local: string; visitante: string;
  media_total: number; ventaja_casa: number; partidos_liga: number;
}): string {
  return `${local} recibe a ${visitante}: el modelo da estos porcentajes con ${numero(media_total, 2)} goles `
    + `por partido en la liga (${partidos_liga} partidos) y una ventaja de casa de ${numero(ventaja_casa, 2)}.`;
}
