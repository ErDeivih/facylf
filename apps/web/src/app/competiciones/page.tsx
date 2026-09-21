import Link from 'next/link';
import type { Route } from 'next';
import { Bloque } from '@/componentes/Bloque';
import { datosFederacion, explorarGruposLocal, federacionDesde, FEDERACIONES_LOCALES,
  FEDERACION_POR_DEFECTO } from '@/lib/repositorio-local';

export const revalidate = 60;

const POR_PAGINA = 80;

type Parametros = {
  q?: string; p?: string; temporada?: string; categoria?: string; ambito?: string;
  provincia?: string; modalidad?: string; genero?: string; conDatos?: string; federacion?: string;
};

function Opcion({ valor, texto }: { valor: string; texto: string }) {
  return <option value={valor}>{texto}</option>;
}

export default async function Competiciones({ searchParams }: { searchParams: Promise<Parametros> }) {
  const p = await searchParams;
  const federacion = federacionDesde(p.federacion);
  const filtros = {
    consulta: (p.q ?? '').trim(), temporada: p.temporada ?? '', categoria: p.categoria ?? '',
    ambito: p.ambito ?? '', provincia: p.provincia ?? '', modalidad: p.modalidad ?? '',
    genero: p.genero ?? '', conDatos: p.conDatos === '1', federacion,
  };
  const { lista, facetas } = explorarGruposLocal(filtros);
  const pagina = Math.max(1, Number(p.p) || 1);
  const desde = (pagina - 1) * POR_PAGINA;
  const visibles = lista.slice(desde, desde + POR_PAGINA);
  const urlPagina = (numero: number) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries({ ...p, p: String(numero) })) {
      if (valor) query.set(clave, valor);
    }
    return `/competiciones?${query.toString()}`;
  };
  return (
    <>
      <div className="mb-6">
        <p className="font-display text-xs uppercase tracking-[0.16em] text-club">Explorador del archivo</p>
        <h2 className="mt-1 font-display text-3xl uppercase">Competiciones y grupos</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
          Estás consultando {datosFederacion(federacion).nombre}. Combina filtros para llegar directamente a una categoría concreta. Cada resultado representa
          un grupo de una temporada; sus datos nunca se mezclan con otro grupo o año.
        </p>
      </div>

      <form action="/competiciones" className="mb-6 border border-[#D6D6D4] bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="etiqueta-filtro">Federación</span>
            <select name="federacion" defaultValue={federacion} className="control-filtro">
              {FEDERACIONES_LOCALES.map((f) => <option key={f.codigo} value={f.codigo}>{f.nombre}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="etiqueta-filtro">Nombre</span>
            <input name="q" defaultValue={filtros.consulta} placeholder="Regional, Ribert, ascenso…" className="control-filtro" />
          </label>
          <label><span className="etiqueta-filtro">Temporada</span>
            <select name="temporada" defaultValue={filtros.temporada} className="control-filtro">
              <Opcion valor="" texto="Todas las temporadas" />
              <Opcion valor="ultimas-5" texto="Últimas 5 temporadas" />
              {facetas.temporadas.map((x) => <Opcion key={x.codigo} valor={x.codigo} texto={x.etiqueta} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Categoría</span>
            <select name="categoria" defaultValue={filtros.categoria} className="control-filtro">
              <Opcion valor="" texto="Todas las categorías" />
              {facetas.categorias.map((x) => <Opcion key={x} valor={x} texto={x} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Ámbito</span>
            <select name="ambito" defaultValue={filtros.ambito} className="control-filtro">
              <Opcion valor="" texto="Todos los ámbitos" />
              {facetas.ambitos.map((x) => <Opcion key={x} valor={x} texto={x} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Provincia / zona</span>
            <select name="provincia" defaultValue={filtros.provincia} className="control-filtro">
              <Opcion valor="" texto="Todas las provincias" />
              {facetas.provincias.map((x) => <Opcion key={x} valor={x} texto={x} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Modalidad</span>
            <select name="modalidad" defaultValue={filtros.modalidad} className="control-filtro">
              <Opcion valor="" texto="Fútbol y fútbol sala" />
              {facetas.modalidades.map((x) => <Opcion key={x} valor={x} texto={x} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Género</span>
            <select name="genero" defaultValue={filtros.genero} className="control-filtro">
              <Opcion valor="" texto="Masculina y femenina" />
              {facetas.generos.map((x) => <Opcion key={x} valor={x} texto={x} />)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF0ED] pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="conDatos" value="1" defaultChecked={filtros.conDatos} />
            Sólo grupos con partidos disponibles
          </label>
          <div className="flex gap-2">
            <Link href={`/competiciones?federacion=${federacion}`} className="boton-secundario">Limpiar</Link>
            <button className="boton-primario">Aplicar filtros</button>
          </div>
        </div>
      </form>

      {federacion === FEDERACION_POR_DEFECTO && <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-display text-xs uppercase text-[#5C646C]">Accesos rápidos:</span>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?temporada=ultimas-5&provincia=Salamanca&modalidad=F%C3%BAtbol&genero=Masculina&conDatos=1">Salamanca · últimos 5 años</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?temporada=ultimas-5&ambito=Importantes&modalidad=F%C3%BAtbol&genero=Masculina&conDatos=1">Regionales y nacionales</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?categoria=Juvenil&modalidad=F%C3%BAtbol&genero=Masculina&conDatos=1">Juveniles</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?ambito=Ascenso&conDatos=1">Fases de ascenso</Link>
      </div>}

      <Bloque titulo={`${lista.length.toLocaleString('es-ES')} grupos encontrados`}
        pie={lista.length > POR_PAGINA ? `Página ${pagina} · ${POR_PAGINA} por página` : undefined}>
        <ul>
          {visibles.map((c) => (
            <li key={c.slug}>
              <Link href={`/competicion/${c.slug}`}
                className="group grid gap-2 border-t border-[#EDF0ED] px-4 py-4 first:border-t-0 hover:bg-[#FAFBFA] sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <span className="insignia">{c.temporada}</span><span className="insignia">{c.categoria}</span>
                    <span className="insignia">{c.ambito}</span>
                    <span className="insignia insignia-verde">{datosFederacion(c.federacion).nombre}</span>
                    {c.provincias.map((x) => <span key={x} className="insignia insignia-roja">{x}</span>)}
                  </div>
                  <p className="font-medium group-hover:text-club">{c.nombre}</p>
                  <p className="mt-1 text-xs text-[#5C646C]">{c.grupo} · {c.modalidad} · {c.genero}</p>
                </div>
                <div className="self-center text-left font-display text-xs uppercase text-[#5C646C] sm:text-right">
                  <p>{c.resultados}/{c.partidos} resultados</p>
                  <p>{c.jornadas} jornadas · {c.equipos} equipos</p>
                </div>
              </Link>
            </li>
          ))}
          {visibles.length === 0 && <li className="p-8 text-center text-sm text-[#5C646C]">
            No hay grupos que cumplan todos esos filtros. Prueba a quitar uno de ellos.
          </li>}
        </ul>
      </Bloque>
      <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
        {pagina > 1 ? <Link className="boton-secundario" href={urlPagina(pagina - 1) as Route}>← Anterior</Link> : <span />}
        <span className="text-xs text-[#5C646C]">{lista.length ? `${desde + 1}–${Math.min(desde + POR_PAGINA, lista.length)} de ${lista.length}` : '0 resultados'}</span>
        {desde + POR_PAGINA < lista.length ? <Link className="boton-secundario" href={urlPagina(pagina + 1) as Route}>Siguiente →</Link> : <span />}
      </nav>
    </>
  );
}
