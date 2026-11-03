import { datosFederacion, federacionDesde, listarTecnicosAdultos } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';
import { FiltroLista } from '@/componentes/FiltroLista';
import { SelectorFederacion } from '@/componentes/SelectorFederacion';

export const revalidate = 60;

export default async function Tecnicos({ searchParams }: { searchParams: Promise<{ federacion?: string }> }) {
  const federacion = federacionDesde((await searchParams).federacion);
  const tecnicos = listarTecnicosAdultos(1000, federacion);
  return (
    <>
      <h1 className="font-display text-2xl uppercase">Cuerpos técnicos</h1>
      <p className="mb-4 mt-2 text-sm text-[var(--texto-suave)]">Entrenadores, delegados y otros cargos de {datosFederacion(federacion).nombre} identificados en actas adultas.</p>
      <SelectorFederacion federacion={federacion} action="/tecnicos" />
      <Bloque titulo={`${tecnicos.length} técnicos y cargos`}>
        <FiltroLista etiqueta="Buscar técnico o cargo" entradas={tecnicos.map((t, i) => ({
          id: `${t.nombre}-${t.rol}-${i}`, titulo: t.nombre, subtitulo: `${t.rol} · ${t.temporadas} temporadas`,
          meta: `${t.partidos} partidos`, href: '/tecnicos',
        }))} />
      </Bloque>
    </>
  );
}
