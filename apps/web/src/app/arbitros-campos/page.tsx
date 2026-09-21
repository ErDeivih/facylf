import { datosFederacion, facetasPartidos, federacionDesde } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { SelectorFederacion } from '@/componentes/SelectorFederacion';

export const revalidate = 60;

export default async function ArbitrosCampos({ searchParams }: { searchParams: Promise<{ federacion?: string }> }) {
  const federacion = federacionDesde((await searchParams).federacion);
  const { arbitros, campos } = facetasPartidos(federacion);
  return (
    <>
      <h2 className="font-display text-2xl uppercase">Árbitros y campos</h2>
      <p className="mb-4 mt-2 text-sm text-[#5C646C]">Recuentos de {datosFederacion(federacion).nombre} construidos a partir de las jornadas ya interpretadas.</p>
      <SelectorFederacion federacion={federacion} action="/arbitros-campos" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Bloque titulo={`Árbitros (${arbitros.length})`}><ol>{arbitros.map((a, i) => <li key={a.nombre} className="flex border-t border-[#EDF0ED] px-4 py-2 text-sm first:border-t-0"><span className="w-8 font-display text-[#5C646C]">{i + 1}</span><span className="flex-1">{a.nombre}</span><span>{a.partidos} partidos</span></li>)}</ol></Bloque>
        <Bloque titulo={`Campos (${campos.length})`}><ol>{campos.map((c, i) => <li key={c.nombre} className="flex border-t border-[#EDF0ED] px-4 py-2 text-sm first:border-t-0"><span className="w-8 font-display text-[#5C646C]">{i + 1}</span><span className="flex-1">{c.nombre}</span><span>{c.partidos} partidos</span></li>)}</ol></Bloque>
      </div>
    </>
  );
}
