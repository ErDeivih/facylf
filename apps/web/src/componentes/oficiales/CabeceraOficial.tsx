/**
 * Cabecera de una ficha de oficial (árbitro, entrenador o delegado).
 *
 * Misma pieza que las cabeceras de las fichas de jugador/equipo/club: iniciales de la persona sobre un
 * círculo (no hay foto: las fotos de personas no se publican), el nombre publicado tal cual y la figura
 * que ejerce. No lleva estrella de favorito: los favoritos guardados son de club, equipo y jugador, y
 * fingir uno que no se puede guardar sería una promesa falsa.
 */
export function CabeceraOficial({ nombre, rol, lineas }: {
  nombre: string;
  /** «Árbitro principal», «Entrenador», «Delegado de equipo»… */
  rol: string;
  lineas?: readonly string[];
}) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <span aria-hidden="true"
        className="flex size-16 flex-none items-center justify-center rounded-full bg-[var(--fondo-sutil)] text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto-suave)]">
        {iniciales(nombre)}
      </span>
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">{nombre}</h1>
        <p className="m-0">
          <span className="inline-flex items-center rounded-full bg-[var(--accion-suave)] px-2.5 py-0.5 text-etiqueta font-semibold text-[var(--texto)]">
            {rol}
          </span>
        </p>
        {lineas && lineas.length > 0 && (
          <p className="m-0 text-nota text-[var(--texto-suave)]">{lineas.join(' · ')}</p>
        )}
      </div>
    </section>
  );
}

/** Iniciales del círculo: dos letras como mucho, sin partículas. Sin nombre, un punto. */
function iniciales(nombre: string): string {
  const particulas = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'da', 'do', 'dos', 'das', 'van', 'von', 'di', 'le']);
  const palabras = (nombre ?? '')
    .split(/[\s,.'’()/-]+/)
    .filter((p) => p.length > 1 && !particulas.has(p.toLocaleLowerCase('es')) && /[a-z0-9áéíóúüñ]/i.test(p));
  return palabras.slice(0, 2).map((p) => p[0]!.toLocaleUpperCase('es')).join('') || '·';
}
