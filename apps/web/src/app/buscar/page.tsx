import Link from 'next/link';
import type { Route } from 'next';
import { Bloque } from '@/componentes/Bloque';
import { buscarGlobal, type ResultadoBusqueda, type TipoResultado } from '@/lib/busqueda';
import { FEDERACIONES_LOCALES, datosFederacion, federacionDesde } from '@/lib/repositorio-local';

export const dynamic = 'force-dynamic';

const SECCIONES: Array<{ tipo: TipoResultado; titulo: string }> = [
  { tipo: 'competicion', titulo: 'Competiciones y grupos' },
  { tipo: 'equipo', titulo: 'Equipos' },
  { tipo: 'jugador', titulo: 'Jugadores' },
  { tipo: 'tecnico', titulo: 'Técnicos' },
];

export default async function Buscar({ searchParams }: {
  searchParams: Promise<{ q?: string; federacion?: string }>;
}) {
  const parametros = await searchParams;
  const q = (parametros.q ?? '').trim();
  const seleccion = !parametros.federacion || parametros.federacion === 'todas'
    ? 'todas' : federacionDesde(parametros.federacion);
  const busqueda = q.length >= 2
    ? buscarGlobal(q, { porTipo: 25, federacion: seleccion })
    : { consulta: q, total: 0, cuenta: { competicion: 0, equipo: 0, jugador: 0, tecnico: 0 }, resultados: [] as ResultadoBusqueda[] };

  const url = (federacion: string) => {
    const u = new URLSearchParams();
    u.set('q', q);
    u.set('federacion', federacion);
    return `/buscar?${u.toString()}` as Route;
  };
  const porFederacion = new Map<string, number>();
  for (const r of busqueda.resultados) {
    porFederacion.set(r.federacion, (porFederacion.get(r.federacion) ?? 0) + 1);
  }

  return <>
    <h2 className="font-display text-3xl uppercase">Buscar en el archivo</h2>
    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#5C646C]">
      {FEDERACIONES_LOCALES.length} federaciones · competiciones, equipos, jugadores y técnicos
    </p>

    <form action="/buscar" className="mt-5 grid gap-3 border border-[#D6D6D4] bg-white p-4 sm:grid-cols-[1fr_15rem_auto]">
      <label><span className="etiqueta-filtro">Texto</span>
        <input name="q" defaultValue={q} autoFocus className="control-filtro"
          placeholder="Equipo, jugador, competición, técnico…" /></label>
      <label><span className="etiqueta-filtro">Federación</span>
        <select name="federacion" defaultValue={seleccion} className="control-filtro">
          <option value="todas">Todas las federaciones</option>
          {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select></label>
      <div className="flex items-end"><button className="boton-primario w-full">Buscar</button></div>
    </form>

    {q.length < 2 && (
      <p className="mt-6 border border-[#D6D6D4] bg-white p-6 text-sm text-[#5C646C]">
        Escribe al menos dos letras. La búsqueda recorre las {FEDERACIONES_LOCALES.length} bases a la vez
        y mantiene cada código dentro de su federación.
      </p>
    )}

    {q.length >= 2 && <>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-[#D6D6D4] bg-white px-3 py-2 text-xs">
        <b className="font-display text-sm uppercase">{busqueda.total.toLocaleString('es-ES')} resultados</b>
        <span className="text-[#5C646C]">para «{q}»</span>
        {SECCIONES.map((s) => (
          <a key={s.tipo} href={`#${s.tipo}`} className="insignia hover:border-club">
            {s.titulo}: {busqueda.cuenta[s.tipo]}
          </a>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link href={url('todas')} className={`insignia ${seleccion === 'todas' ? 'insignia-roja' : ''}`}>
          Todas ({busqueda.total})
        </Link>
        {FEDERACIONES_LOCALES.filter((f) => porFederacion.get(f.codigo)).map((f) => (
          <Link key={f.codigo} href={url(f.codigo)}
            className={`insignia ${seleccion === f.codigo ? 'insignia-roja' : ''}`}>
            {f.nombre} ({porFederacion.get(f.codigo)})
          </Link>
        ))}
      </div>

      {SECCIONES.map((seccion) => {
        const filas = busqueda.resultados.filter((r) => r.tipo === seccion.tipo);
        if (!filas.length) return null;
        return (
          <div key={seccion.tipo} id={seccion.tipo} className="mt-6 scroll-mt-4">
            <Bloque titulo={`${seccion.titulo} · ${filas.length}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="border-b border-[#D6D6D4] text-left text-xs uppercase text-[#5C646C]">
                    <th className="p-2">Nombre</th><th className="p-2">Contexto</th>
                    <th className="p-2">Federación</th><th className="p-2 text-right">Dato</th>
                  </tr></thead>
                  <tbody>
                    {filas.map((r, i) => (
                      <tr key={`${r.tipo}-${i}`} className="border-b border-[#EDF0ED] hover:bg-[#FAFBFA]">
                        <td className="p-2"><Link href={r.url as Route} className="font-medium hover:text-club hover:underline">{r.titulo}</Link></td>
                        <td className="p-2 text-[12px] text-[#5C646C]">{r.subtitulo}</td>
                        <td className="p-2 text-[12px] text-[#5C646C]">{r.territorio}</td>
                        <td className="p-2 text-right text-[12px] text-[#5C646C]">{r.meta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Bloque>
          </div>
        );
      })}

      {busqueda.total === 0 && (
        <p className="mt-6 border border-[#D6D6D4] bg-white p-6 text-sm text-[#5C646C]">
          Nada coincide con «{q}»{seleccion !== 'todas' ? ` en ${datosFederacion(seleccion).nombre}` : ''}.
          Prueba con menos letras o quita el filtro de federación.
        </p>
      )}
    </>}
  </>;
}
