/**
 * El logotipo de la marca: una **C** de Cantera con un balón en su abertura.
 *
 * Es un dibujo propio (05/11/2026): la inicial del producto en trazo grueso y redondeado, con un
 * balón pequeño que cierra la lectura de fútbol. El nombre va escrito al lado; el dibujo no repite
 * letras ni copia ninguna marca.
 *
 * Detalles que no son casuales:
 *  · **28×28**, el tamaño de la cabecera; el favicon (`app/icon.svg`) es el mismo dibujo.
 *  · El relleno de la baldosa es `--accion` y el trazo es `currentColor`, así que el logotipo hereda
 *    el color del texto: funciona sobre la barra oscura en tema claro y en oscuro sin color literal.
 *  · Es **decorativo** (`aria-hidden`): la marca está escrita a su lado («Cantera») y el enlace de
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
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M19.2 8.4a8 8 0 1 0 0 11.2" />
        <circle cx="19.4" cy="14" r="2.15" fill="currentColor" stroke="none" />
        <path d="M17.7 12.4h3.4" stroke="var(--accion)" strokeWidth="0.9" />
        <path d="M19.4 11.8v4.4" stroke="var(--accion)" strokeWidth="0.9" />
      </g>
    </svg>
  );
}
