/**
 * El logotipo de la marca: un balón de fútbol dibujado como **líneas de campo** dentro de una
 * baldosa redondeada.
 *
 * Es un dibujo propio (05/11/2026): una cancha vista de frente —rectángulo, línea de medio campo y
 * círculo central— sobre la baldosa del acento del sistema. No copia ninguna marca y no necesita
 * texto dentro del dibujo.
 *
 * Detalles que no son casuales:
 *  · **28×28**, el tamaño de la cabecera; el favicon (`app/icon.svg`) es el mismo dibujo.
 *  · El relleno de la baldosa es `--accion` y las líneas son `currentColor`, así que el logotipo
 *    hereda el color del texto: funciona sobre la barra oscura en tema claro y en oscuro sin llevar
 *    ningún color literal.
 *  · Es **decorativo** (`aria-hidden`): la marca está escrita a su lado («Balompié») y el enlace de
 *    la cabecera lleva nombre accesible por ese texto. Un SVG que repitiera el nombre haría que un
 *    lector de pantalla lo dijera dos veces.
 */
export function Logotipo({ className = '' }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
    >
      <rect width="28" height="28" rx="7" className="fill-[var(--accion)]" />
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="4.5" y="4.5" width="19" height="19" rx="3.5" />
        <path d="M4.5 14h19" />
        <circle cx="14" cy="14" r="3.4" />
      </g>
    </svg>
  );
}
