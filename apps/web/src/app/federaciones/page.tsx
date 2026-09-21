import Link from 'next/link';
import type { Route } from 'next';
import { FEDERACIONES_LOCALES, resumenFederacionesLocal, type EstadoFederacionLocal } from '@/lib/repositorio-local';

export const revalidate = 60;

/** Portal oficial de cada federación (procedencia del dato). */
const PORTALES: Record<string, string> = {
  'castilla-leon': 'https://www.rfcylf.es/pnfg/',
  galicia: 'https://www.futgal.es/pnfg/',
  asturias: 'https://www.asturfutbol.es/pnfg/',
  cantabria: 'https://www.rfcf.es/pnfg/',
  aragon: 'https://www.futbolaragon.com/pnfg/',
  rioja: 'https://www.frfutbol.com/pnfg/',
  extremadura: 'https://www.fexfutbol.com/pnfg/',
  navarra: 'https://www.futnavarra.es/pnfg/',
  euskadi: 'https://www.euskadifutbol.eus/pnfg/',
  'castilla-la-mancha': 'https://www.ffcm.es/pnfg/',
  andalucia: 'https://www.rfaf.es/pnfg/',
  murcia: 'https://www.ffrm.es/pnfg/',
  canarias: 'https://www.federacioncanariafutbol.es/pnfg/',
  ceuta: 'https://www.rffce.es/pnfg/',
  madrid: 'https://www.rffm.es/competicion/resultados-y-jornadas',
  valencia: 'https://ffcv.es/competiciones/',
  // Sin entrada aquí, la tarjeta de la federación enseñaba un enlace «Fuente oficial» que no llevaba
  // a ninguna parte (`href="#"`).
  cataluna: 'https://www.fcf.cat/ca/competicio',
  baleares: 'https://www.ffib.es/Fed/',
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

function Barra({ etiqueta, valor, texto }: { etiqueta: string; valor: number; texto: string }) {
  const color = valor >= 100 ? 'bg-[#1F7A46]' : valor >= 50 ? 'bg-club' : 'bg-[#C6892B]';
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-[#5C646C]">
        <span className="uppercase tracking-wider">{etiqueta}</span><b className="tabular-nums">{texto}</b>
      </div>
      <div className="mt-0.5 h-1.5 bg-[#EDF0ED]"><div className={`h-full ${color}`} style={{ width: `${Math.min(100, valor)}%` }} /></div>
    </div>
  );
}

function Cobertura({ f }: { f: EstadoFederacionLocal }) {
  return (
    <div className="p-3">
      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] text-[#5C646C]">
        <p><b className="block font-display text-lg tabular-nums">{f.competiciones.toLocaleString('es-ES')}</b>competiciones</p>
        <p><b className="block font-display text-lg tabular-nums">{f.grupos.toLocaleString('es-ES')}</b>grupos</p>
        <p><b className="block font-display text-lg tabular-nums">{f.partidos.toLocaleString('es-ES')}</b>partidos</p>
      </div>
      <Barra etiqueta="Catálogo (grupos descubiertos)" valor={f.avanceDescubrimiento}
        texto={`${f.gruposDescubiertos.toLocaleString('es-ES')}/${(f.gruposDescubiertos + f.gruposPorDescubrir).toLocaleString('es-ES')}`} />
      <Barra etiqueta="Jornadas descargadas" valor={pct(f.jornadas, f.jornadasEsperadas)}
        texto={`${f.jornadas.toLocaleString('es-ES')}/${f.jornadasEsperadas.toLocaleString('es-ES')} · ${pct(f.jornadas, f.jornadasEsperadas)}%`} />
      <Barra etiqueta="Actas analizadas" valor={pct(f.actasProcesadas, f.actas)}
        texto={`${f.actasProcesadas.toLocaleString('es-ES')}/${f.actas.toLocaleString('es-ES')} · ${pct(f.actasProcesadas, f.actas)}%`} />
      <Barra etiqueta="Cola de recolección" valor={pct(f.hechos, f.hechos + f.pendientes)}
        texto={`${f.hechos.toLocaleString('es-ES')}/${(f.hechos + f.pendientes).toLocaleString('es-ES')}`} />
      <p className="mt-2 text-[11px] text-[#8A8E91] tabular-nums">
        {f.temporadas} temporadas · {f.jornadas} jornadas · actas correctas {f.actasCorrectas.toLocaleString('es-ES')} ·
        a revisar {f.actasRevisar.toLocaleString('es-ES')} · grupos completos {f.gruposCompletos.toLocaleString('es-ES')}
      </p>
    </div>
  );
}

export default function Federaciones() {
  const federaciones = resumenFederacionesLocal();
  const totales = federaciones.reduce((a, f) => ({
    competiciones: a.competiciones + f.competiciones,
    grupos: a.grupos + f.grupos,
    partidos: a.partidos + f.partidos,
    jornadas: a.jornadas + f.jornadas,
    actas: a.actas + f.actas,
    actasProcesadas: a.actasProcesadas + f.actasProcesadas,
  }), { competiciones: 0, grupos: 0, partidos: 0, jornadas: 0, actas: 0, actasProcesadas: 0 });

  return <>
    <h2 className="font-display text-3xl uppercase">Federaciones</h2>
    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#5C646C]">
      {federaciones.length} bases independientes · datos de los portales oficiales de cada territorial
    </p>

    <div className="my-5 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-3 lg:grid-cols-6">
      {[['Competiciones', totales.competiciones], ['Grupos', totales.grupos], ['Partidos', totales.partidos],
        ['Jornadas', totales.jornadas], ['Actas', totales.actas], ['Actas analizadas', totales.actasProcesadas]].map(([t, v]) => (
        <div key={String(t)} className="bg-white p-3">
          <p className="font-display text-xl tabular-nums">{Number(v).toLocaleString('es-ES')}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#5C646C]">{t}</p>
        </div>
      ))}
    </div>

    <p className="mb-5 border-l-4 border-club bg-white p-3 text-[12px] leading-5 text-[#5C646C]">
      La cobertura se muestra desglosada a propósito: un catálogo al 100% no implica que el contenido
      histórico esté completo. Cada ficha de competición indica su propia cobertura para no comparar
      datos parciales como si fueran definitivos. Fuente: portales federativos oficiales; sin datos inventados.
    </p>

    <div className="grid gap-4 lg:grid-cols-2">
      {federaciones.map((f) => (
        <section key={f.codigo} className="border border-[#D6D6D4] bg-white">
          <header className="flex items-baseline justify-between gap-2 border-b border-[#EDF0ED] px-3 py-2">
            <h3 className="font-display text-lg uppercase">{f.nombre}</h3>
            <span className="text-[11px] text-[#8A8E91]">{f.fase}</span>
          </header>
          <Cobertura f={f} />
          <footer className="flex items-center justify-between gap-2 border-t border-[#EDF0ED] px-3 py-2">
            <a href={PORTALES[f.codigo] ?? '#'} target="_blank" rel="noreferrer"
              className="text-[11px] text-[#8A8E91] hover:text-club">Fuente oficial ↗</a>
            <Link className="boton-secundario" href={`/competiciones?federacion=${f.codigo}` as Route}>
              Explorar {f.nombre} →
            </Link>
          </footer>
        </section>
      ))}
    </div>
  </>;
}
