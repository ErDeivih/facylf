/**
 * Bloque con cabecera: la unidad de contenido de las fichas.
 *
 * `id` permite enlazar el bloque (por ejemplo desde el resumen de una competición) y hace que el
 * destino del enlace no quede tapado por la cabecera pegajosa. `nivel` existe porque un bloque dentro
 * de una ficha ya tiene un `h1` de página encima: saltar de `h1` a `h2` está bien, pero dos bloques
 * anidados no deben repetir el mismo nivel.
 */
export function Bloque({ titulo, pie, children, id, nivel = 2 }:
  {
    titulo: React.ReactNode;
    pie?: string;
    children: React.ReactNode;
    id?: string;
    nivel?: 2 | 3;
  }) {
  const Encabezado = nivel === 3 ? 'h3' : 'h2';
  return (
    <section id={id} className="mb-6 border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--borde)] bg-[var(--fondo-sutil)] px-4 py-3">
        <Encabezado className="font-display text-[0.875rem] uppercase tracking-[0.11em]">{titulo}</Encabezado>
        {pie && <p className="text-xs text-[var(--texto-suave)]">{pie}</p>}
      </header>
      {children}
    </section>
  );
}
