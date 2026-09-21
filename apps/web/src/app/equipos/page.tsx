import Link from 'next/link';
import type { Route } from 'next';
import { datosFederacion, explorarGruposLocal, federacionDesde, FEDERACIONES_LOCALES,
  listarEquiposLocal } from '@/lib/repositorio-local';
import { Bloque } from '@/componentes/Bloque';

export const revalidate = 60;
const POR_PAGINA = 100;

export default async function Equipos({ searchParams }: {
  searchParams: Promise<{ q?: string; p?: string; temporada?: string; categoria?: string; provincia?: string; federacion?: string }>;
}) {
  const filtros = await searchParams;
  const seleccionFederacion = filtros.federacion === 'todas' ? 'todas' : federacionDesde(filtros.federacion);
  const federacion = federacionDesde(filtros.federacion);
  const q = (filtros.q ?? '').trim();
  const fuentes = seleccionFederacion === 'todas'
    ? FEDERACIONES_LOCALES.flatMap((f) => listarEquiposLocal(10000, 0, q, f.codigo))
    : listarEquiposLocal(10000, 0, q, federacion);
  const todos = fuentes.filter((e) =>
    (!filtros.temporada || e.temporadaCodigo === filtros.temporada) &&
    (!filtros.categoria || e.categoria === filtros.categoria) &&
    (!filtros.provincia || e.provincias.includes(filtros.provincia)));
  const facetasFederacion = seleccionFederacion === 'todas'
    ? FEDERACIONES_LOCALES.map((f) => explorarGruposLocal({ federacion: f.codigo }).facetas)
    : [explorarGruposLocal({ federacion }).facetas];
  const facetas = {
    temporadas: [...new Map(facetasFederacion.flatMap((x) => x.temporadas).map((x) => [x.codigo, x])).values()],
    categorias: [...new Set(facetasFederacion.flatMap((x) => x.categorias))].sort(),
    provincias: [...new Set(facetasFederacion.flatMap((x) => x.provincias))].sort(),
  };
  const pagina = Math.max(1, Number(filtros.p) || 1);
  const desde = (pagina - 1) * POR_PAGINA;
  const equipos = todos.slice(desde, desde + POR_PAGINA);
  const paginaUrl = (n: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filtros, p: String(n) })) if (v) u.set(k, v);
    return `/equipos?${u.toString()}`;
  };
  return (
    <>
      <h2 className="font-display text-3xl uppercase">Equipos</h2>
      <p className="mb-6 mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
        Consulta equipos {seleccionFederacion === 'todas' ? 'de todas las federaciones' : `de ${datosFederacion(federacion).nombre}`}. Cada resultado es un equipo dentro de una temporada, competición y grupo concretos.
        Así no se mezclan plantillas de distintas categorías de un mismo club.
      </p>
      <form className="mb-6 grid gap-3 border border-[#D6D6D4] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" action="/equipos">
        <label><span className="etiqueta-filtro">Federación</span><select name="federacion" defaultValue={seleccionFederacion} className="control-filtro">
          <option value="todas">Todas las federaciones</option>
          {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
        </select></label>
        <label><span className="etiqueta-filtro">Nombre</span><input name="q" defaultValue={q} placeholder="Buscar equipo" className="control-filtro" /></label>
        <label><span className="etiqueta-filtro">Temporada</span><select name="temporada" defaultValue={filtros.temporada ?? ''} className="control-filtro">
          <option value="">Todas</option>{facetas.temporadas.map((x) => <option key={x.codigo} value={x.codigo}>{x.etiqueta}</option>)}
        </select></label>
        <label><span className="etiqueta-filtro">Categoría</span><select name="categoria" defaultValue={filtros.categoria ?? ''} className="control-filtro">
          <option value="">Todas</option>{facetas.categorias.map((x) => <option key={x}>{x}</option>)}
        </select></label>
        <label><span className="etiqueta-filtro">Provincia / zona</span><select name="provincia" defaultValue={filtros.provincia ?? ''} className="control-filtro">
          <option value="">Todas</option>{facetas.provincias.map((x) => <option key={x}>{x}</option>)}
        </select></label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
          <Link href={`/equipos?federacion=${seleccionFederacion}`} className="boton-secundario">Limpiar</Link><button className="boton-primario">Aplicar filtros</button>
        </div>
      </form>
      <Bloque titulo={`${todos.length.toLocaleString('es-ES')} equipos-grupo`}>
        <ul>{equipos.map((e) => <li key={e.slug}>
          <Link href={`/equipo/${e.slug}`} className="group grid gap-2 border-t border-[#EDF0ED] px-4 py-4 first:border-t-0 hover:bg-[#FAFBFA] sm:grid-cols-[1fr_auto]">
            <div><p className="font-medium group-hover:text-club">{e.nombre}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-club">{datosFederacion(e.federacion).nombre}</p>
              <p className="mt-1 text-xs text-[#5C646C]">{e.competicion} · {e.grupo}</p></div>
            <div className="text-left font-display text-xs uppercase text-[#5C646C] sm:text-right">
              <p>{e.temporada} · {e.categoria}</p><p>{e.jugados}/{e.partidos} jugados</p>
            </div>
          </Link>
        </li>)}</ul>
        {equipos.length === 0 && <p className="p-6 text-sm text-[#5C646C]">No hay equipos con esos filtros.</p>}
      </Bloque>
      <nav className="flex justify-between">
        {pagina > 1 ? <Link href={paginaUrl(pagina - 1) as Route} className="boton-secundario">← Anterior</Link> : <span />}
        {desde + POR_PAGINA < todos.length ? <Link href={paginaUrl(pagina + 1) as Route} className="boton-secundario">Siguiente →</Link> : <span />}
      </nav>
    </>
  );
}
