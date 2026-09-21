import Link from 'next/link';
import type { Route } from 'next';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import {
  COBERTURA_POR_FEDERACION, COBERTURA_POR_GRUPO, CONSULTAS_COBERTURA, PARAMETROS_POR_DEFECTO, RESUMEN_CANONICO,
} from '@/consultas/cobertura';
import type { FilaFederacion, FilaGrupo, FilaResumen } from '@/consultas/contratos';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico del canónico: qué hay y hasta dónde llega.
 *
 * Esta página no es un adorno: es la que dice si el canónico está vacío, a medias o completo antes de
 * que alguien se fíe de un listado. Enseña los estados tal como los mide el importador
 * (`ops.coverage_checkpoint`) y nunca convierte un `null` en un cero.
 */

type FilaFederacionTabla = FilaFederacion;
type FilaGrupoTabla = FilaGrupo;
type Resumen = FilaResumen;

const numero = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-ES');

const fecha = (v: string | null): string => (v === null ? '—' : new Date(v).toLocaleString('es-ES'));

const ETIQUETA_ESTADO: Record<string, string> = {
  completa: 'completa',
  verificada_hasta_jornada: 'hasta jornada',
  parcial_privada: 'parcial',
  oculta: 'sin publicar',
};

const estado = (v: string | null): string => (v === null ? '—' : ETIQUETA_ESTADO[v] ?? v);

/** El ámbito «desconocido» es un dato real de la fuente, no un error: se dice con palabras, no con un guion. */
const ambito = (v: string | null): string =>
  v === null || v === 'desconocido' ? 'ámbito sin determinar' : v;

function Estado({ estado: valor }: { estado: string | null }) {
  if (valor === null) return <span className="text-[11px] text-[#8A8E91]">sin punto de control</span>;
  const color = valor === 'completa' ? 'bg-[#1F7A46]' : valor === 'oculta' ? 'bg-[#8A8E91]' : 'bg-[#C6892B]';
  return <span className="inline-flex items-center gap-1 text-[11px]">
    <span className={`inline-block h-2 w-2 ${color}`} />
    {estado(valor)}
  </span>;
}

function SinCanonico({ motivo }: { motivo: string }) {
  return <>
    <h2 className="font-display text-3xl uppercase">Estado del canónico</h2>
    <div className="mt-4 border-l-4 border-[#C6892B] bg-white p-4 text-[13px] leading-6">
      <b className="block">Ahora mismo esta página no puede leer el canónico.</b>
      <p className="mt-1 text-[#5C646C]">{motivo}</p>
      <p className="mt-3 text-[#5C646C]">Para levantarlo en local:</p>
      <pre className="mt-1 overflow-x-auto bg-[#F4F5F3] p-2 text-[12px]">{`pnpm db:arrancar
pnpm db:migrar
pnpm importar --federacion <federación> --temporada <temporada> --grupo <grupo>`}</pre>
      <p className="mt-3 text-[11px] text-[#8A8E91]">
        La web no enseña datos de ejemplo en su lugar: un cero o una tabla vacía se leerían como
        «no hay nada», y lo que pasa es que no se sabe.
      </p>
    </div>
  </>;
}

export default async function Canonico() {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico motivo={motivo} />;

  let resumen: Resumen | null = null;
  let federaciones: FilaFederacionTabla[] = [];
  let grupos: FilaGrupoTabla[] = [];
  try {
    resumen = (await consulta<Resumen>(RESUMEN_CANONICO.sql, PARAMETROS_POR_DEFECTO[RESUMEN_CANONICO.nombre]))[0] ?? null;
    federaciones = await consulta<FilaFederacionTabla>(COBERTURA_POR_FEDERACION.sql, PARAMETROS_POR_DEFECTO[COBERTURA_POR_FEDERACION.nombre]);
    grupos = await consulta<FilaGrupoTabla>(COBERTURA_POR_GRUPO.sql, PARAMETROS_POR_DEFECTO[COBERTURA_POR_GRUPO.nombre]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico motivo={error.message} />;
    throw error;
  }

  const vacio = (resumen?.grupos ?? 0) === 0;

  return <>
    <h2 className="font-display text-3xl uppercase">Estado del canónico</h2>
    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#5C646C]">
      {CONSULTAS_COBERTURA.length} consultas declaradas · leído con el rol de sólo lectura · medido {fecha(resumen?.calculado_en ?? null)}
    </p>

    {vacio ? (
      <div className="mt-4 border-l-4 border-[#C6892B] bg-white p-4 text-[13px] leading-6">
        <b className="block">El canónico está creado pero todavía no tiene ningún grupo importado.</b>
        <p className="mt-1 text-[#5C646C]">
          Las tablas existen (las migraciones están aplicadas), así que esto no es un error: es que
          nadie ha importado todavía. Se importa grupo a grupo:
        </p>
        <pre className="mt-2 overflow-x-auto bg-[#F4F5F3] p-2 text-[12px]">pnpm importar --federacion castilla-leon --temporada 2024-25 --grupo 11379752</pre>
      </div>
    ) : (
      <div className="my-5 grid grid-cols-2 gap-px border border-[#D6D6D4] bg-[#D6D6D4] sm:grid-cols-4">
        {[['Federaciones', resumen?.federaciones], ['Ediciones', resumen?.ediciones], ['Grupos', resumen?.grupos],
          ['Partidos', resumen?.partidos], ['Actas', resumen?.informes], ['Participaciones', resumen?.participaciones],
          ['Eventos', resumen?.eventos], ['Personas', resumen?.personas]].map(([t, v]) => (
          <div key={String(t)} className="bg-white p-3">
            <p className="font-display text-xl tabular-nums">{numero(v as number | null)}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#5C646C]">{t}</p>
          </div>
        ))}
      </div>
    )}

    {!vacio && <>
      <h3 className="mt-6 font-display text-xl uppercase">Por federación</h3>
      <div className="mt-2 overflow-x-auto border border-[#D6D6D4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#F4F5F3] text-left text-[10px] uppercase tracking-wider text-[#5C646C]">
            <tr>
              <th className="px-3 py-2">Federación</th><th className="px-3 py-2">Temporadas</th>
              <th className="px-3 py-2">Ediciones</th><th className="px-3 py-2">Grupos</th>
              <th className="px-3 py-2">Partidos</th><th className="px-3 py-2">Con resultado</th>
              <th className="px-3 py-2">Actas</th><th className="px-3 py-2">Grupos completos</th>
              <th className="px-3 py-2">Sin cobertura</th>
            </tr>
          </thead>
          <tbody>
            {federaciones.map((f) => (
              <tr key={f.codigo} className="border-t border-[#EDF0ED]">
                <td className="px-3 py-2 font-medium">{f.nombre}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.temporadas)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.ediciones)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.grupos)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.partidos_conocidos)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.partidos_con_resultado)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.actas_parseadas)} / {numero(f.actas_disponibles)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.grupos_completos)} de {numero(f.grupos)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(f.grupos_sin_cobertura)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-display text-xl uppercase">Grupo a grupo</h3>
      <p className="mt-1 text-[11px] text-[#5C646C]">
        «hasta jornada» significa que el grupo está completo hasta esa jornada y no más: es el estado
        normal de la temporada en curso. Un guion es un dato que no existe, no un cero.
      </p>
      <div className="mt-2 overflow-x-auto border border-[#D6D6D4] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#F4F5F3] text-left text-[10px] uppercase tracking-wider text-[#5C646C]">
            <tr>
              <th className="px-3 py-2">Federación</th><th className="px-3 py-2">Temporada</th>
              <th className="px-3 py-2">Edición</th><th className="px-3 py-2">Grupo</th>
              <th className="px-3 py-2">Jornadas</th><th className="px-3 py-2">Partidos</th>
              <th className="px-3 py-2">Con resultado</th><th className="px-3 py-2">Actas</th>
              <th className="px-3 py-2">Completo hasta</th><th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={`${g.federacion}-${g.grupo_codigo}`} className="border-t border-[#EDF0ED]">
                <td className="px-3 py-2">{g.federacion_nombre}</td>
                <td className="px-3 py-2">{g.temporada}</td>
                <td className="px-3 py-2">{g.edicion}<span className="text-[#8A8E91]"> · {ambito(g.ambito)}</span></td>
                <td className="px-3 py-2">
                  <Link className="text-club hover:underline"
                    href={`/canonico/${g.federacion}/${g.grupo_codigo}` as Route}>
                    {g.grupo} <span className="text-[#8A8E91]">({g.grupo_codigo})</span>
                  </Link>
                </td>
                <td className="px-3 py-2 tabular-nums">{numero(g.jornadas_previstas)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(g.partidos_conocidos)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(g.partidos_con_resultado)}</td>
                <td className="px-3 py-2 tabular-nums">{numero(g.actas_parseadas)} / {numero(g.actas_disponibles)}</td>
                <td className="px-3 py-2 tabular-nums">{g.complete_through_matchday === null ? '—' : `J${g.complete_through_matchday}`}</td>
                <td className="px-3 py-2"><Estado estado={g.visibility_state} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-[#8A8E91]">
        Se enseñan hasta {numero(PARAMETROS_POR_DEFECTO['cobertura-por-grupo'][1] as number)} grupos por página.
        Los recuentos vienen de `ops.coverage_checkpoint`, que el importador recalcula al cerrar cada lote:
        esta página no calcula completitud recorriendo partidos.
      </p>
    </>}
  </>;
}
