import { colorDeEquipo, siglas } from '@/lib/pantalla-competicion';

/**
 * Escudo de club como MARCADOR DE POSICIÓN, no como identidad.
 *
 * SISTEMA-DISENO §5: cuando no hay imagen del escudo se pintan las iniciales sobre un color derivado
 * del identificador. Ese color no es el del club ni se presenta como tal: es un distintivo estable que
 * permite seguir una fila al desplazar la tabla. Por eso es decorativo (`aria-hidden`): el nombre del
 * equipo va al lado como texto, y un lector de pantalla no necesita oír «escudo».
 *
 * El tamaño es fijo (22×24, el del prototipo) para no provocar salto de layout cuando lleguen los
 * escudos de verdad.
 */
export function Escudo({ equipoId, nombre }: { equipoId: number; nombre: string }) {
  return (
    <svg
      width={22}
      height={24}
      viewBox="0 0 36 40"
      aria-hidden="true"
      focusable="false"
      data-escudo="determinista"
      className="flex-none"
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
