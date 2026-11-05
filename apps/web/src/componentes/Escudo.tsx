import { colorDeEquipo, siglas } from '@/lib/pantalla-competicion';

/**
 * Escudo de club. Con imagen real si la hay; si no, MARCADOR DE POSICIÓN, no identidad.
 *
 * SISTEMA-DISENO §5: cuando no hay imagen del escudo se pintan las iniciales sobre un color derivado
 * del identificador. Ese color no es el del club ni se presenta como tal: es un distintivo estable que
 * permite seguir una fila al desplazar la tabla. Por eso es decorativo (`aria-hidden`): el nombre del
 * equipo va al lado como texto, y un lector de pantalla no necesita oír «escudo».
 *
 * Tamaño fijo (22×24, el del prototipo) en los DOS casos, para no provocar salto de layout cuando
 * llegan los escudos de verdad: la imagen se pinta en la misma caja que el marcador.
 *
 * La imagen no viene del portal de la federación: la sirve `/api/escudo/club/<clubId>` desde el binario
 * guardado en el canónico (`core.club_asset`). Así una visita a la ficha no genera una petición al
 * portal, y un cambio de URL en la federación no deja el escudo roto.
 *
 * `clubId` y `tieneEscudo` salen de la consulta de la pantalla (`club_id`, `tiene_escudo`). Si no
 * llegan —o `tieneEscudo` es `false`/`null`— se pinta el marcador de siempre: no se pide una imagen que
 * la base ya ha dicho que no existe.
 */
export function Escudo({ equipoId, nombre, clubId, tieneEscudo }: {
  equipoId: number;
  nombre: string;
  /** El club canónico del equipo-temporada, si la consulta lo trae. */
  clubId?: number | null;
  /** Si ese club tiene escudo vigente guardado. `null` es «no se sabe» y se pinta el marcador. */
  tieneEscudo?: boolean | null;
}) {
  if (clubId != null && clubId > 0 && tieneEscudo === true) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen de una ruta interna con caché propia, no del optimizador de Next.
      <img
        src={`/api/escudo/club/${clubId}`}
        width={22}
        height={24}
        alt=""
        aria-hidden="true"
        data-escudo="real"
        loading="eager"
        decoding="async"
        className="h-[24px] w-[22px] flex-none object-contain"
      />
    );
  }
  return (
    <svg
      width={22}
      height={24}
      viewBox="0 0 36 40"
      aria-hidden="true"
      focusable="false"
      data-escudo="determinista"
      className="h-[24px] w-[22px] flex-none"
    >
      <path d="M18 1 34 7v12c0 10-7 17-16 20C9 36 2 29 2 19V7Z" fill={colorDeEquipo(equipoId)} />
      {/* Sombra de la mitad derecha del escudo del prototipo, con el tono fuerte del producto. */}
      <path d="M18 1 34 7v12c0 10-7 17-16 20Z" className="fill-[var(--fondo-fuerte)]" fillOpacity={0.15} />
      <text
        x={18}
        y={21}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={700}
        letterSpacing={-0.3}
        className="fill-[var(--texto-fuerte)]"
      >
        {siglas(nombre)}
      </text>
    </svg>
  );
}
