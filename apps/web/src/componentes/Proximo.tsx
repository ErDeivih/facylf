import type { ProximoPartido } from '@fcylf/dominio';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const fechaCorta = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export function Proximo({ p }: { p: ProximoPartido | null }) {
  if (!p) {
    return (
      <div className="bg-pizarra px-4 py-6 text-[#A6A9AD]">
        <p className="font-display uppercase tracking-[0.1em]">
          No queda ningún partido por jugar en el calendario cargado.
        </p>
      </div>
    );
  }
  const cuenta = p.diasRestantes === 0 ? ['HOY', 'se juega']
    : p.diasRestantes === 1 ? ['1', 'día'] : [String(p.diasRestantes), 'días'];
  return (
    <div className="flex flex-wrap items-center gap-6 bg-pizarra px-4 py-6 text-[#F7F7F6]">
      <div className="min-w-[100px] border-r border-white/15 pr-5 text-center">
        <div className="font-display text-5xl font-light leading-none text-club">{cuenta[0]}</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#A6A9AD]">{cuenta[1]}</div>
      </div>
      <div className="flex-1">
        <p className="font-display text-2xl leading-tight">
          {!p.enCasa && <span className="font-light text-[#7C8085]">en campo de </span>}
          {p.rival}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.1em] text-[#AFB2B6]">
          <span className={`border px-2 py-0.5 ${p.enCasa ? 'border-[#8E2B31] text-[#F4A0A6]' : 'border-[#5A636C] text-[#C3CAD1]'}`}>
            {p.enCasa ? 'En casa' : 'Fuera'}
          </span>
          <span>{p.partido.fecha && fechaCorta(p.partido.fecha)}</span>
          <span className="text-[#7C8085]">
            (fecha de la jornada: los juveniles suelen jugar el sábado)
          </span>
        </p>
      </div>
      <div className="text-right font-display text-xs uppercase tracking-[0.16em] text-[#7C8085]">
        Jornada
        <b className="block text-4xl font-light leading-none text-[#F7F7F6]">{p.partido.jornada}</b>
      </div>
    </div>
  );
}
