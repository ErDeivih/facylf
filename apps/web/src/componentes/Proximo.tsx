import type { ProximoPartido } from '@facylf/dominio';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const fechaCorta = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export function Proximo({ p }: { p: ProximoPartido | null }) {
  if (!p) {
    return (
      <div className="bg-pizarra px-4 py-6 text-[var(--texto-tenue)]">
        <p className="font-display">
          No queda ningún partido por jugar en el calendario cargado.
        </p>
      </div>
    );
  }
  const cuenta = p.diasRestantes === 0 ? ['HOY', 'se juega']
    : p.diasRestantes === 1 ? ['1', 'día'] : [String(p.diasRestantes), 'días'];
  return (
    <div className="flex flex-wrap items-center gap-6 bg-pizarra px-4 py-6 text-[var(--texto-inverso)]">
      <div className="min-w-[100px] border-r border-[var(--borde-fuerte)] pr-5 text-center">
        <div className="font-display text-5xl font-light leading-none text-[var(--accion)]">{cuenta[0]}</div>
        <div className="mt-1 text-xs text-[var(--texto-tenue)]">{cuenta[1]}</div>
      </div>
      <div className="flex-1">
        <p className="font-display text-2xl leading-tight">
          {!p.enCasa && <span className="font-light text-[var(--texto-suave)]">en campo de </span>}
          {p.rival}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--texto-tenue)]">
          <span className={`border px-2 py-0.5 ${p.enCasa ? 'border-[var(--derrota)] text-[var(--derrota)]' : 'border-[var(--borde-fuerte)] text-[var(--texto-inverso)]'}`}>
            {p.enCasa ? 'En casa' : 'Fuera'}
          </span>
          <span>{p.partido.fecha && fechaCorta(p.partido.fecha)}</span>
          <span className="text-[var(--texto-suave)]">
            (fecha de la jornada: los juveniles suelen jugar el sábado)
          </span>
        </p>
      </div>
      <div className="text-right font-display text-xs text-[var(--texto-suave)]">
        Jornada
        <b className="block text-4xl font-light leading-none text-[var(--texto-inverso)]">{p.partido.jornada}</b>
      </div>
    </div>
  );
}
