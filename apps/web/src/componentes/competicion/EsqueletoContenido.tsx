/**
 * Esqueleto de carga de la pantalla de competición (pantalla 2).
 *
 * SISTEMA-DISENO §5: el esqueleto tiene las MISMAS dimensiones que el contenido real y nunca un spinner
 * centrado, que desplaza la página al resolverse. Por eso las filas de la clasificación son tantas como
 * equipos tiene el grupo (`filas`, que se conoce antes del suspenso) y la jornada y los goleadores pintan
 * las ocho filas que enseña el contenido real.
 *
 * Los `data-esqueleto` no son decoración: la prueba de la pantalla comprueba con ellos que el número de
 * filas es el del grupo y no un número fijo.
 */
export function EsqueletoContenido({ filas }: { filas: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  const cuantas = Math.max(1, Math.trunc(filas));
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-start gap-[18px]">
      <span className="sr-only">Cargando la clasificación, la jornada y los goleadores…</span>
      <div className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <div className="px-4 py-3.5"><div className={`h-5 w-40 ${bloque}`} /></div>
        {/* Cabecera de columnas, leyenda de zonas y nota al pie: sin ellas el esqueleto se queda corto
            y la página salta al llegar el contenido (medido por el QA: ~220 px). */}
        <div className="flex h-[33px] items-center gap-4 border-t border-[var(--fondo-sutil)] px-4">
          <div className={`h-3 w-6 ${bloque}`} />
          <div className={`h-3 flex-1 ${bloque}`} />
          <div className={`h-3 w-28 ${bloque}`} />
        </div>
        <div className="px-4">
          {Array.from({ length: cuantas }, (_, i) => (
            <div key={i} data-esqueleto="clasificacion"
              className="flex h-[var(--fila-densa)] items-center gap-2.5 border-t border-[var(--fondo-sutil)]">
              <div className={`size-4 ${bloque}`} />
              <div className={`h-4 flex-1 ${bloque}`} />
              <div className={`h-4 w-24 ${bloque}`} />
              <div className={`h-4 w-8 ${bloque}`} />
            </div>
          ))}
        </div>
        <div className="flex h-[44px] items-center gap-4 border-t border-[var(--fondo-sutil)] px-4">
          <div className={`h-3 w-20 ${bloque}`} />
          <div className={`h-3 w-16 ${bloque}`} />
        </div>
        <div className="h-[74px] border-t border-[var(--fondo-sutil)] px-4 py-3">
          <div className={`h-3 w-full ${bloque}`} />
          <div className={`mt-2 h-3 w-2/3 ${bloque}`} />
        </div>
      </div>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px]">
        <div className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <div className="px-4 py-3.5"><div className={`h-5 w-28 ${bloque}`} /></div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} data-esqueleto="jornada"
              className="flex min-h-11 items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-3.5">
              <div className={`h-4 flex-1 ${bloque}`} />
              <div className={`h-5 w-[58px] ${bloque}`} />
              <div className={`h-4 flex-1 ${bloque}`} />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
          <div className="px-4 py-3.5"><div className={`h-5 w-24 ${bloque}`} /></div>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} data-esqueleto="goleadores"
              className="flex min-h-11 items-center gap-2.5 border-t border-[var(--fondo-sutil)] px-4">
              <div className={`h-4 flex-1 ${bloque}`} />
              <div className={`h-4 w-8 ${bloque}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
