/*
 * ── EL FORMATO DE UN PARTIDO: CUÁNTOS JUEGAN Y CUÁNTO DURA ─────────────────────────────────────────────
 *
 * Una sola fuente para todo el generador de informes. Antes vivía copiado en cinco sitios con dos
 * criterios distintos: `alineacion_disponible` ya leía la modalidad de la edición (7, 8 u 11), pero el
 * cuadre de minutos daba por hecho 11 jugadores siempre, así que un alevín de fútbol 8 salía
 * «descuadrado» en todos sus partidos.
 *
 * Reglas:
 *   · La modalidad publicada en la edición manda: futbol7 → 7, futbol8 → 8, futbol11 → 11.
 *   · Si no está publicada, se usa el mismo supuesto que ya aplicaba el motor (categorías de base → 7,
 *     el resto → 11) y se marca `formatoDeclarado = false`, para que quien lo enseñe pueda decirlo.
 *   · Fútbol sala y playa: los cambios son ilimitados y rotativos, así que los minutos NO se pueden
 *     derivar de las entradas y salidas del acta. La duración es NULL y los minutos salen NULL
 *     («no calculables»), nunca una cifra calculada sobre 90.
 *   · La duración es la reglamentaria por categoría, sin tiempo añadido.
 */

const simple = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const BASE = /^(alevin|benjamin|prebenjamin)$/;
const SIN_MINUTOS = new Set(['sala', 'playa']);

/** Minutos reglamentarios por categoría. */
export function duracionCategoria(categoria) {
  const c = simple(categoria);
  if (c.includes('prebenjamin')) return 40;
  if (c.includes('benjamin')) return 50;
  if (c.includes('alevin')) return 60;
  if (c.includes('infantil')) return 70;
  if (c.includes('cadete')) return 80;
  return 90;
}

/** Formato de una edición (o de cualquier objeto con `modalidad` y `categoria`). */
export function formatoPartido({ modalidad, categoria } = {}) {
  const m = simple(modalidad);
  if (SIN_MINUTOS.has(m)) {
    return { modalidad: m, jugadores: 5, duracion: null, formatoDeclarado: true, minutosCalculables: false };
  }
  const declarado = { futbol7: 7, futbol8: 8, futbol11: 11 }[m];
  return {
    modalidad: m || 'desconocida',
    jugadores: declarado ?? (BASE.test(simple(categoria)) ? 7 : 11),
    duracion: duracionCategoria(categoria),
    formatoDeclarado: declarado !== undefined,
    minutosCalculables: true,
  };
}

/*
 * Los mismos criterios, como fragmentos SQL. `ce` es el alias de `core.competition_edition`.
 * `modalidad` y `categoria` son vocabularios cerrados en el canónico (migración 0002), así que la
 * comparación es exacta; `core.normaliza_nombre` cubre literales que llegaran con tilde.
 */
export function jugadoresSql(ce) {
  return `(case ${ce}.modalidad when 'futbol7' then 7 when 'futbol8' then 8 when 'futbol11' then 11
    when 'sala' then 5 when 'playa' then 5
    else case when core.normaliza_nombre(${ce}.categoria) in ('alevin','benjamin','prebenjamin') then 7 else 11 end end)`;
}

export function duracionSql(ce) {
  return `(case when ${ce}.modalidad in ('sala','playa') then null::int
    when core.normaliza_nombre(${ce}.categoria) like '%prebenjamin%' then 40
    when core.normaliza_nombre(${ce}.categoria) like '%benjamin%' then 50
    when core.normaliza_nombre(${ce}.categoria) like '%alevin%' then 60
    when core.normaliza_nombre(${ce}.categoria) like '%infantil%' then 70
    when core.normaliza_nombre(${ce}.categoria) like '%cadete%' then 80
    else 90 end)`;
}
