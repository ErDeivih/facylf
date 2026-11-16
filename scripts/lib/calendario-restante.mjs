/*
 * calendario-restante.mjs — qué partidos le quedan a una liga cuando el calendario futuro no está cargado.
 *
 * El canónico sólo tiene fila de partido para las jornadas que la federación ya ha publicado con acta o
 * resultado (más algún aplazado). Simular «lo que queda» con esas filas es simular tres partidos y dar
 * por terminada una liga que va por la jornada 10 de 34: cada equipo sale con el 100 % en su puesto de
 * hoy. Aquí se deduce el resto del calendario a partir de dos datos que sí existen: los equipos del
 * grupo y las jornadas previstas.
 *
 * Sólo se deduce cuando el formato es inequívoco (liga a una o a dos vueltas). Con cualquier otra forma
 * —fases, eliminatorias, triangulares, grupos con cruces— se devuelve `null` y el llamante no publica
 * una estimación: es preferible no tener proyección a tener una inventada.
 */

/** Jornadas de una liga de `n` equipos a una vuelta (con descanso si son impares). */
const jornadasDeUnaVuelta = (n) => (n % 2 === 0 ? n - 1 : n);

/**
 * Formato de la liga según equipos y jornadas previstas.
 * @returns {'doble' | 'simple' | null}
 */
export function formatoDeLiga(equipos, jornadasPrevistas) {
  if (!Number.isInteger(equipos) || equipos < 3) return null;
  if (!Number.isInteger(jornadasPrevistas) || jornadasPrevistas <= 0) return null;
  const vuelta = jornadasDeUnaVuelta(equipos);
  if (jornadasPrevistas === 2 * vuelta) return 'doble';
  if (jornadasPrevistas === vuelta) return 'simple';
  return null;
}

/** Partidos que tiene la liga completa. */
export function partidosTotales(equipos, formato) {
  const pares = (equipos * (equipos - 1)) / 2;
  return formato === 'doble' ? 2 * pares : pares;
}

/**
 * Partidos que faltan por crear, dados los que ya existen (jugados o pendientes).
 *
 * @param {{ equipos: readonly string[], existentes: readonly { local: string, visitante: string }[],
 *           formato: 'doble' | 'simple' }} entrada
 * @returns {{ local: string, visitante: string, campoNeutral: boolean }[] | null}
 *   `null` si lo que existe no encaja con el formato (un cruce repetido, un equipo ajeno al grupo): en
 *   ese caso el grupo no es la liga que parecía y no se deduce nada.
 */
export function partidosQueFaltan({ equipos, existentes, formato }) {
  const dentro = new Set(equipos);
  const vistos = new Set();
  for (const p of existentes) {
    if (!dentro.has(p.local) || !dentro.has(p.visitante) || p.local === p.visitante) return null;
    const clave = formato === 'doble'
      ? `${p.local}>${p.visitante}`
      : [p.local, p.visitante].sort().join('~');
    if (vistos.has(clave)) return null;
    vistos.add(clave);
  }
  const faltan = [];
  for (let i = 0; i < equipos.length; i += 1) {
    for (let j = 0; j < equipos.length; j += 1) {
      if (i === j) continue;
      const a = equipos[i];
      const b = equipos[j];
      if (formato === 'doble') {
        if (!vistos.has(`${a}>${b}`)) faltan.push({ local: a, visitante: b, campoNeutral: false });
      } else if (i < j && !vistos.has([a, b].sort().join('~'))) {
        // A una vuelta no se sabe quién será el local: se simula sin ventaja de casa.
        faltan.push({ local: a, visitante: b, campoNeutral: true });
      }
    }
  }
  return faltan;
}
