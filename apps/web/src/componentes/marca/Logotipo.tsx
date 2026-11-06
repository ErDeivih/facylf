/**
 * El logotipo de la marca: un monograma **FP** de Fondo Popular dentro de una baldosa redondeada.
 *
 * Es un dibujo propio (06/11/2026), sin copiar ninguna marca. El nombre va escrito al lado; el dibujo
 * no repite el nombre completo y por eso es decorativo (`aria-hidden`).
 *
 * **28×28**, el tamaño de la cabecera; el favicon (`app/icon.svg`) es el mismo dibujo. La baldosa usa
 * `--accion` y el monograma `currentColor`, así funciona en claro y oscuro sin color literal.
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
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 19.5V8.5h5.5M8 13.5h4" />
        <path d="M16 19.5V8.5h3.1a3.7 3.7 0 0 1 0 7.4H16" />
      </g>
      <circle cx="21.6" cy="19.4" r="1.2" fill="currentColor" />
    </svg>
  );
}
