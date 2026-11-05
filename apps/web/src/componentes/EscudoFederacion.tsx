import { siglas } from '@/lib/pantalla-competicion';

/**
 * Escudo de la federación para la cabecera de competición (56×56, el `size-14` del prototipo).
 *
 * Sustituye a la insignia con las siglas del nombre de la competición —el «LN» de Liga Nacional—, que
 * no decía de quién es la competición: la federación es la dueña. Con escudo guardado se pinta la
 * imagen que sirve `/api/escudo/federacion/<codigo>` desde `core.federation_asset`; sin él, el marcador
 * de siempre con las siglas del nombre de la federación sobre el color de acción del sistema de diseño
 * (el mismo tono que usaba la insignia de la competición, para que la cabecera no cambie de peso).
 *
 * Es decorativo (`aria-hidden`): la federación también se nombra en el texto de la cabecera y de la
 * miga; un lector de pantalla no necesita oír «escudo» dos veces.
 *
 * `tieneEscudo` viene de `grupo-por-id` (`federacion_tiene_escudo`). Un `null` es «no se sabe» y se
 * pinta el marcador: nunca se pide una imagen que la base no tiene.
 */
export function EscudoFederacion({ codigo, nombre, tieneEscudo }: {
  codigo: string;
  nombre: string;
  tieneEscudo?: boolean | null;
}) {
  if (tieneEscudo === true && codigo !== '') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen de una ruta interna con caché propia, no del optimizador de Next.
      <img
        src={`/api/escudo/federacion/${encodeURIComponent(codigo)}`}
        width={56}
        height={56}
        alt=""
        aria-hidden="true"
        data-escudo="real"
        loading="lazy"
        decoding="async"
        className="size-14 flex-none rounded-[var(--radius-tarjeta)] object-contain"
      />
    );
  }
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 56 56"
      aria-hidden="true"
      focusable="false"
      data-escudo="determinista"
      className="size-14 flex-none"
    >
      <rect width={56} height={56} rx={12} fill="var(--accion)" />
      <text
        x={28}
        y={29}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={18}
        fontWeight={800}
        letterSpacing={-0.5}
        className="fill-[var(--texto-inverso)]"
      >
        {siglas(nombre)}
      </text>
    </svg>
  );
}
