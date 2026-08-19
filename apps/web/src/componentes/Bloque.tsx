export function Bloque({ titulo, pie, children }:
  { titulo: string; pie?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 border border-[#D6D6D4] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D6D4] bg-[#FAFBFA] px-4 py-3">
        <h2 className="font-display text-sm uppercase tracking-[0.11em]">{titulo}</h2>
        {pie && <p className="text-xs text-[#5C646C]">{pie}</p>}
      </header>
      {children}
    </section>
  );
}
