import Link from 'next/link';
import type { Route } from 'next';
import { Bloque } from '@/componentes/Bloque';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, LISTADO_DE_GRUPOS, PARAMETROS_CATALOGO } from '@/consultas/catalogo';
import type { FilaCatalogoGrupo, FilaFederacionCanonica } from '@/consultas/catalogo';
import { agrupaFacetas, etiqueta, fechaCorta, estadoVisibilidad, numero, type FacetasDelCatalogo } from '@/lib/presentacion-canonico';
import { provinciaCanonicaDe } from '@/lib/provincias-cyl';
import { provinciasDeFiltro } from '@/lib/selector-competiciones';

export const dynamic = 'force-dynamic';

/**
 * Explorador de competiciones y grupos, leído del canónico.
 *
 * Lo que cambia respecto a la versión que leía las colas SQLite:
 *
 * - **Sólo aparece lo importado.** El canónico se llena grupo a grupo con `pnpm importar`; esta lista
 *   enseña esos grupos y dice cuántos son. Los que la cola conoce y todavía no se han importado no
 *   están aquí, y no se rellenan con nada.
 * - **«Jornadas», «resultados» y «equipos» son lo que está medido**: los partidos y las actas salen de
 *   `ops.coverage_checkpoint` (con su fecha), y los equipos son las inscripciones de `core.team_entry`.
 *   Cuando un grupo no tiene punto de control, sus cifras salen como `—`.
 * - **Los enlaces van a la ficha canónica del grupo** (`/canonico/<federación>/<grupo>`), que es la
 *   página que enseña exactamente la fila que se está listando. El slug de la ficha antigua
 *   (`/competicion/t21-c22911157-g22911162`) lleva el **código de temporada de la cola SQLite**, y ese
 *   código no existe en el canónico: `core.season` guarda la etiqueta (`2025-26`) y su `id` no es el
 *   código local (la 2025-26 es la 3 en el canónico y la 21 en la cola de Castilla y León). Construir ese
 *   slug desde el canónico daría un enlace roto o, peor, a otra temporada. Por eso el código externo de
 *   la edición (`edicion_codigo`) se enseña como identificador, pero no se usa para fabricar una URL que
 *   no se puede sostener.
 * - **Los filtros ofrecen sólo lo que existe**: las opciones salen de las facetas del catálogo canónico.
 *   Un valor `desconocido`/`desconocida` es un dato real de la fuente y se ofrece como «sin determinar».
 *   La provincia es la excepción: es la lista canónica de las nueve de CyL, es **múltiple** (casillas,
 *   `provincia` repetido en la URL) y se compara sin tildes; las etiquetas que se ven son las canónicas.
 */

const POR_PAGINA = 80;

/** El atajo «importantes» de siempre: nacional, regional y ascenso. No es un valor del vocabulario. */
const AMBITOS_IMPORTANTES = ['nacional', 'regional', 'ascenso'];

type Parametros = {
  q?: string; p?: string; temporada?: string; categoria?: string; ambito?: string;
  provincia?: string | string[]; modalidad?: string; genero?: string; conDatos?: string; federacion?: string;
};

function Opcion({ valor, texto: rotulo }: { valor: string; texto: string }) {
  return <option value={valor}>{rotulo}</option>;
}

export default async function Competiciones({ searchParams }: { searchParams: Promise<Parametros> }) {
  const p = await searchParams;
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Competiciones y grupos" motivo={motivo} />;

  /** Las provincias de CyL de la URL, con la etiqueta canónica. `provincia` puede venir repetido. */
  const provincias = provinciasDeFiltro(p.provincia);
  let filas: FilaCatalogoGrupo[] = [];
  let federaciones: FilaFederacionCanonica[] = [];
  let facetas: FacetasDelCatalogo = { temporadas: [], ambitos: [], categorias: [], modalidades: [], generos: [], provincias: [] };
  let total = 0;
  const pagina = Math.max(1, Number(p.p) || 1);
  try {
    facetas = agrupaFacetas(await consulta(FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre]));
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);

    const federacion = (p.federacion ?? '').trim() || null;
    const buscar = (p.q ?? '').trim();
    // «Últimas 5 temporadas» se calcula con las temporadas que hay en el canónico, no con el año en
    // curso: si sólo hay tres importadas, el atajo significa esas tres.
    const ultimas = facetas.temporadas.slice(0, 5);
    const esUltimas = p.temporada === 'ultimas-5';
    const temporada = esUltimas ? null : (p.temporada?.trim() || null);
    const temporadaDesde = esUltimas ? (ultimas[ultimas.length - 1]?.valor ?? null) : null;
    const ambitos = p.ambito === 'Importantes' ? AMBITOS_IMPORTANTES : (p.ambito ? [p.ambito] : null);

    filas = await consulta<FilaCatalogoGrupo>(LISTADO_DE_GRUPOS.sql, [
      federacion,
      temporada,
      temporadaDesde,
      ambitos,
      p.modalidad?.trim() || null,
      p.genero?.trim() || null,
      p.categoria?.trim() || null,
      provincias,
      null,           // nivel: ordinal comparable sólo dentro de su federación y temporada
      buscar,
      p.conDatos === '1',
      POR_PAGINA,
      (pagina - 1) * POR_PAGINA,
    ]);
    total = filas[0]?.total ?? 0;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Competiciones y grupos" motivo={error.message} />;
    throw error;
  }

  const desde = (pagina - 1) * POR_PAGINA;
  const nombreFederacion = (codigo: string) => federaciones.find((f) => f.codigo === codigo)?.nombre ?? codigo;
  const federacionElegida = (p.federacion ?? '').trim();
  const urlPagina = (n: number) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries({ ...p, p: String(n) })) {
      if (!valor) continue;
      // `provincia` puede venir repetido (filtro múltiple): se conserva como lista.
      if (Array.isArray(valor)) {
        for (const item of valor) if (item) query.append(clave, item);
      } else {
        query.set(clave, valor);
      }
    }
    return `/competiciones?${query.toString()}`;
  };

  return (
    <>
      <div className="mb-6">
        <p className="font-display text-xs uppercase tracking-[0.16em] text-club">Explorador del archivo</p>
        <h2 className="mt-1 font-display text-3xl uppercase">Competiciones y grupos</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C646C]">
          Estás consultando el catálogo del canónico
          {federacionElegida ? <> de <b>{nombreFederacion(federacionElegida)}</b></> : ' de todas las federaciones'}.
          Combina filtros para llegar directamente a una categoría concreta. Cada resultado es un grupo de
          una temporada y sus datos nunca se mezclan con otro grupo ni con otro año.
        </p>
      </div>

      <form action="/competiciones" className="mb-6 border border-[#D6D6D4] bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="etiqueta-filtro">Federación</span>
            <select name="federacion" defaultValue={federacionElegida} className="control-filtro">
              <Opcion valor="" texto="Todas las federaciones con datos" />
              {federaciones.filter((f) => f.ediciones > 0).map((f) => <Opcion key={f.codigo} valor={f.codigo} texto={f.nombre} />)}
            </select>
          </label>
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="etiqueta-filtro">Nombre</span>
            <input name="q" defaultValue={p.q ?? ''} placeholder="Regional, Ribert, ascenso…" className="control-filtro" />
          </label>
          <label><span className="etiqueta-filtro">Temporada</span>
            <select name="temporada" defaultValue={p.temporada ?? ''} className="control-filtro">
              <Opcion valor="" texto="Todas las temporadas" />
              <Opcion valor="ultimas-5" texto="Últimas 5 temporadas" />
              {facetas.temporadas.map((x) => <Opcion key={x.valor} valor={x.valor} texto={x.etiqueta} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Categoría</span>
            <select name="categoria" defaultValue={p.categoria ?? ''} className="control-filtro">
              <Opcion valor="" texto="Todas las categorías" />
              {facetas.categorias.map((x) => <Opcion key={x.valor} valor={x.valor} texto={x.etiqueta} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Ámbito</span>
            <select name="ambito" defaultValue={p.ambito ?? ''} className="control-filtro">
              <Opcion valor="" texto="Todos los ámbitos" />
              <Opcion valor="Importantes" texto="Importantes (nacional, regional, ascenso)" />
              {facetas.ambitos.map((x) => <Opcion key={x.valor} valor={x.valor} texto={x.etiqueta} />)}
            </select>
          </label>
          <fieldset className="sm:col-span-2 lg:col-span-2">
            <legend className="etiqueta-filtro">Provincias (se pueden marcar varias)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border border-[#D6D6D4] px-2.5 py-2">
              {/* Las nueve de CyL con su etiqueta canónica; el SQL compara sin tildes. */}
              {facetas.provincias.map((x) => (
                <label key={x.valor} className="flex min-h-11 items-center gap-1.5 text-sm">
                  <input type="checkbox" name="provincia" value={x.valor}
                    defaultChecked={provincias.includes(x.valor)} />
                  {x.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
          <label><span className="etiqueta-filtro">Modalidad</span>
            <select name="modalidad" defaultValue={p.modalidad ?? ''} className="control-filtro">
              <Opcion valor="" texto="Todas las modalidades" />
              {facetas.modalidades.map((x) => <Opcion key={x.valor} valor={x.valor} texto={x.etiqueta} />)}
            </select>
          </label>
          <label><span className="etiqueta-filtro">Género</span>
            <select name="genero" defaultValue={p.genero ?? ''} className="control-filtro">
              <Opcion valor="" texto="Todos los géneros" />
              {facetas.generos.map((x) => <Opcion key={x.valor} valor={x.valor} texto={x.etiqueta} />)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF0ED] pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="conDatos" value="1" defaultChecked={p.conDatos === '1'} />
            Sólo grupos con partidos conocidos
          </label>
          <div className="flex gap-2">
            <Link href="/competiciones" className="boton-secundario">Limpiar</Link>
            <button className="boton-primario">Aplicar filtros</button>
          </div>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-display text-xs uppercase text-[#5C646C]">Accesos rápidos:</span>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?temporada=ultimas-5&conDatos=1">Últimas 5 temporadas</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?ambito=Importantes&conDatos=1">Regionales y nacionales</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?categoria=juvenil&conDatos=1">Juveniles</Link>
        <Link className="boton-secundario !min-h-0 !py-1.5" href="/competiciones?categoria=cadete&conDatos=1">Cadetes</Link>
      </div>

      <Bloque titulo={`${numero(total)} grupos en el canónico`}
        pie={total > POR_PAGINA ? `Página ${pagina} · ${POR_PAGINA} por página` : undefined}>
        <ul>
          {filas.map((c) => (
            <li key={`${c.federacion}-${c.grupo_codigo}`}>
              <Link href={`/canonico/${c.federacion}/${c.grupo_codigo}` as Route}
                className="group grid gap-2 border-t border-[#EDF0ED] px-4 py-4 first:border-t-0 hover:bg-[#FAFBFA] sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <span className="insignia">{c.temporada}</span>
                    <span className="insignia">{etiqueta('categoria', c.categoria)}</span>
                    <span className="insignia">{etiqueta('ambito', c.ambito)}</span>
                    <span className="insignia insignia-verde">{c.federacion_nombre}</span>
                    {c.provincia && (
                      // La etiqueta se enseña canónica («León»), aunque el dato venga como «Leon».
                      <span className="insignia insignia-roja">{provinciaCanonicaDe(c.provincia) ?? c.provincia}</span>
                    )}
                    <span className="insignia">{estadoVisibilidad(c.visibility_state)}</span>
                  </div>
                  <p className="font-medium group-hover:text-club">{c.edicion} · {c.grupo}</p>
                  <p className="mt-1 text-xs text-[#5C646C]">
                    {etiqueta('tipo_grupo', c.grupo_tipo)} · {etiqueta('modalidad', c.modalidad)} ·{' '}
                    {etiqueta('genero', c.genero)} · edición {c.edicion_codigo} · grupo {c.grupo_codigo} ·
                    medido el {fechaCorta(c.calculado_en)}
                  </p>
                </div>
                <div className="self-center text-left font-display text-xs uppercase text-[#5C646C] sm:text-right">
                  {/* Un grupo sin punto de control no tiene resultados conocidos: sale un guion, no un 0/0. */}
                  <p>{numero(c.partidos_con_resultado)}/{numero(c.partidos_conocidos)} resultados</p>
                  <p>{numero(c.jornadas_previstas)} jornadas · {numero(c.inscripciones)} inscripciones</p>
                  <p>actas {numero(c.actas_parseadas)}/{numero(c.actas_disponibles)} · completo hasta{' '}
                    {c.complete_through_matchday === null ? '—' : `J${c.complete_through_matchday}`}</p>
                </div>
              </Link>
            </li>
          ))}
          {filas.length === 0 && <li className="p-8 text-center text-sm text-[#5C646C]">
            No hay grupos que cumplan todos esos filtros <b>en el canónico</b>. Prueba a quitar uno de
            ellos; si esperabas encontrar aquí una competición concreta, puede que todavía no se haya
            importado: el catálogo se llena grupo a grupo y sólo enseña lo importado.
          </li>}
        </ul>
      </Bloque>

      <p className="mb-4 text-[11px] text-[#8A8E91]">
        Procedencia: <code className="bg-[#F4F5F3] px-1">core.competition_edition</code>,{' '}
        <code className="bg-[#F4F5F3] px-1">core.phase_group</code>,{' '}
        <code className="bg-[#F4F5F3] px-1">core.team_entry</code> y{' '}
        <code className="bg-[#F4F5F3] px-1">ops.coverage_checkpoint</code>. Las cifras de partidos y actas
        son las que el importador midió al cerrar cada lote; su fecha va en cada renglón. Un guion es un
        dato que no existe.
      </p>

      <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
        {pagina > 1 ? <Link className="boton-secundario" href={urlPagina(pagina - 1) as Route}>← Anterior</Link> : <span />}
        <span className="text-xs text-[#5C646C]">
          {total ? `${desde + 1}–${Math.min(desde + POR_PAGINA, total)} de ${numero(total)}` : '0 resultados'}
        </span>
        {desde + POR_PAGINA < total ? <Link className="boton-secundario" href={urlPagina(pagina + 1) as Route}>Siguiente →</Link> : <span />}
      </nav>
    </>
  );
}
