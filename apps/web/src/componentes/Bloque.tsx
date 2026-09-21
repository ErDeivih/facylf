export function Bloque({ titulo, pie, children }:
  { titulo: React.ReactNode; pie?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 border border-[var(--borde)] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3">
        <h2 className="font-display text-sm uppercase tracking-[0.11em]">{titulo}</h2>
        {pie && <p className="text-xs text-[var(--texto-suave)]">{pie}</p>}
      </header>
      {children}
    </section>
  );
}
