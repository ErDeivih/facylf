import Link from 'next/link';
import type { Route } from 'next';
import { SinCanonico } from '@/componentes/SinCanonico';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { FEDERACIONES_DEL_CANONICO, PARAMETROS_CATALOGO, RECUENTOS_DEL_CANONICO } from '@/consultas/catalogo';
import type { FilaFederacionCanonica, FilaRecuentos } from '@/consultas/catalogo';
import { etiqueta, fechaHora, numero, porcentaje } from '@/lib/presentacion-canonico';

export const dynamic = 'force-dynamic';

/**
 * Las federaciones, leídas del canónico.
 *
 * Antes esta página recorría las dieciocho colas SQLite y enseñaba, por federación, el avance de la
 * **cola de recolección** (grupos descubiertos, grupos por descubrir, trabajos hechos y pendientes).
 * Ese contador vive en la tabla `trabajos` de cada `cola-v2.sqlite` y **el esquema canónico no lo
 * guarda**: no hay ninguna tabla que lo tenga, así que aquí no se puede enseñar. Se decidió (y está
 * escrito en el informe de esta tarea) **dejar de enseñarlo** y explicar en su lugar lo que el canónico
 * sí mide: la cobertura de lo ya importado, que es `ops.coverage_checkpoint`. Inventar esos contadores
 * o enseñarlos a cero sería convertir «no lo sé» en «no hay nada».
 *
 * Todo lo demás cambia igual de fuente: el nombre y el **portal oficial** salen de `core.federation`
 * (antes eran una lista escrita a mano en el código que además omitía Melilla), y las cifras de
 * cobertura salen del punto de control que el importador recalcula al cerrar cada lote.
 */

/** Una barra de progreso que, cuando no hay medida, lo dice en vez de pintar un 0 %. */
function Barra({ etiqueta: titulo, parte, total }: { etiqueta: string; parte: number | null; total: number | null }) {
  const pct = porcentaje(parte, total);
  const color = pct === null ? 'bg-[var(--borde)]' : pct >= 100 ? 'bg-[var(--cobertura-completa)]' : pct >= 50 ? 'bg-[var(--accion)]' : 'bg-[var(--cobertura-parcial)]';
  const medida = parte !== null && total !== null && total > 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-[var(--texto-suave)]">
        <span className="uppercase tracking-wider">{titulo}</span>
        <b className="tabular-nums">
          {medida ? `${numero(parte)}/${numero(total)} · ${pct}%` : 'sin medir'}
        </b>
      </div>
      <div className="mt-0.5 h-1.5 bg-[var(--borde)]">
        <div className={`h-full ${color}`} style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function Ficha({ f }: { f: FilaFederacionCanonica }) {
  // Sin ninguna edición importada no hay nada que medir: se dice con palabras y no se pintan barras,
  // porque todas saldrían «sin medir» y la ficha parecería un cero con adornos.
  const sinImportar = f.ediciones === 0;
  const medido = f.calculado_en === null ? 'sin medir todavía' : `medido el ${fechaHora(f.calculado_en)}`;
  return (
    <section className="border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--borde)] px-3 py-2">
        <h3 className="font-display text-lg uppercase">{f.nombre}</h3>
        <span className="text-[11px] text-[var(--texto-tenue)]">
          {sinImportar ? 'sin datos importados' : medido} · {etiqueta('adaptador', f.adaptador)}
          {!f.activa && ' · inactiva'}
        </span>
      </header>

      <div className="p-3">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px] text-[var(--texto-suave)]">
          <p><b className="block font-display text-lg tabular-nums">{numero(f.ediciones)}</b>ediciones</p>
          <p><b className="block font-display text-lg tabular-nums">{numero(f.grupos)}</b>grupos</p>
          <p><b className="block font-display text-lg tabular-nums">{numero(f.partidos_conocidos)}</b>partidos</p>
        </div>

        {sinImportar ? (
          <p className="text-[11px] leading-5 text-[var(--texto-suave)]">
            El canónico no tiene ninguna competición importada de esta federación. No es un cero: es que
            no está importado, y hasta que se importe un grupo no hay nada que medir aquí.
            {f.adaptador === 'ninguno' && ' Su portal todavía no tiene adaptador de recolección.'}
          </p>
        ) : (
          <>
            <Barra etiqueta="Grupos con punto de control" parte={f.grupos_medidos} total={f.grupos} />
            <Barra etiqueta="Grupos completos" parte={f.grupos_completos} total={f.grupos} />
            <Barra etiqueta="Partidos con resultado" parte={f.partidos_con_resultado} total={f.partidos_conocidos} />
            <Barra etiqueta="Actas analizadas" parte={f.actas_parseadas} total={f.actas_disponibles} />
            <p className="mt-2 text-[11px] text-[var(--texto-tenue)] tabular-nums">
              {numero(f.temporadas)} temporadas · {numero(f.grupos_sin_cobertura)} grupos sin punto de control ·
              actas correctas {numero(f.actas_correctas)} · a revisar {numero(f.actas_a_revisar)}
            </p>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--borde)] px-3 py-2">
        {/* El portal oficial sale de `core.federation.portal_url`: es la procedencia del dato. Cuando no
            hay ninguno se dice, en vez de dejar un enlace que no lleva a ninguna parte. */}
        {f.portal_url
          ? <a href={f.portal_url} target="_blank" rel="noreferrer"
            className="text-[11px] text-[var(--texto-tenue)] hover:text-[var(--accion)]">Fuente oficial ↗</a>
          : <span className="text-[11px] text-[var(--texto-tenue)]">Sin portal declarado en el canónico</span>}
        {/* Sin nada importado, «Explorar» llevaría a una lista vacía: se dice en vez de enlazar. */}
        {sinImportar
          ? <span className="text-[11px] text-[var(--texto-tenue)]">Nada que explorar todavía</span>
          : <Link className="boton-secundario" href={`/competiciones?federacion=${f.codigo}` as Route}>
            Explorar {f.nombre} →
          </Link>}
      </footer>
    </section>
  );
}

export default async function Federaciones() {
  const motivo = motivoSinCanonico();
  if (motivo) return <SinCanonico titulo="Federaciones" motivo={motivo} />;

  let federaciones: FilaFederacionCanonica[] = [];
  let recuentos: FilaRecuentos | null = null;
  try {
    federaciones = await consulta<FilaFederacionCanonica>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    recuentos = (await consulta<FilaRecuentos>(
      RECUENTOS_DEL_CANONICO.sql, PARAMETROS_CATALOGO[RECUENTOS_DEL_CANONICO.nombre]))[0] ?? null;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Federaciones" motivo={error.message} />;
    throw error;
  }

  const conDatos = federaciones.filter((f) => f.ediciones > 0);
  const totales: Array<[string, number | null]> = [
    ['Federaciones', recuentos?.federaciones ?? null],
    ['Con datos importados', recuentos?.federaciones_con_datos ?? null],
    ['Ediciones', recuentos?.ediciones ?? null],
    ['Grupos', recuentos?.grupos ?? null],
    ['Partidos conocidos', recuentos?.partidos_conocidos ?? null],
    ['Actas analizadas', recuentos?.actas_parseadas ?? null],
  ];

  return <>
    <h2 className="font-display text-3xl uppercase">Federaciones</h2>
    <p className="mt-1 text-xs text-[var(--texto-suave)]">
      {federaciones.length} federaciones declaradas · {conDatos.length} con datos importados ·
      medido {fechaHora(recuentos?.calculado_en ?? null)}
    </p>

    <div className="my-5 grid grid-cols-2 gap-px border border-[var(--borde-fuerte)] bg-[var(--borde)] sm:grid-cols-3 lg:grid-cols-6">
      {totales.map(([titulo, valor]) => (
        <div key={titulo} className="bg-[var(--fondo-elevado)] p-3">
          <p className="font-display text-xl tabular-nums">{numero(valor)}</p>
          <p className="text-[0.6875rem] uppercase tracking-wider text-[var(--texto-suave)]">{titulo}</p>
        </div>
      ))}
    </div>

    <div className="mb-5 border-l-4 border-[var(--accion)] bg-[var(--fondo-elevado)] p-3 text-xs leading-5 text-[var(--texto-suave)]">
      <p>
        La cobertura se muestra desglosada a propósito: un catálogo al 100 % no implica que el contenido
        histórico esté completo. Los recuentos de catálogo (ediciones, grupos, temporadas) son filas de{' '}
        <code className="bg-[var(--fondo-sutil)] px-1">core.*</code>; las cifras de partidos y actas vienen del punto
        de control que el importador recalcula al cerrar cada lote
        (<code className="bg-[var(--fondo-sutil)] px-1">ops.coverage_checkpoint</code>), y su fecha es la de la
        medición. Un guion es un dato que no existe, no un cero.
      </p>
      <p className="mt-2">
        <b>Lo que ya no se enseña aquí.</b> Esta página mostraba el avance de la cola de recolección de
        cada federación —grupos descubiertos, grupos por descubrir, trabajos hechos y pendientes—. Ese
        contador vive en la tabla <code className="bg-[var(--fondo-sutil)] px-1">trabajos</code> de cada cola SQLite
        y el esquema canónico no lo guarda: no tiene equivalente, así que no se muestra en vez de
        enseñarlo a cero. En su lugar se enseña la cobertura de lo importado, que sí está medida. Un
        grupo que la cola conoce pero que todavía no se ha importado no aparece en esta página: no es un
        cero, es que no está.
      </p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      {federaciones.map((f) => <Ficha key={f.codigo} f={f} />)}
    </div>

    <p className="mt-4 text-[11px] text-[var(--texto-tenue)]">
      Procedencia: <code className="bg-[var(--fondo-sutil)] px-1">core.federation</code>,{' '}
      <code className="bg-[var(--fondo-sutil)] px-1">core.competition_edition</code>,{' '}
      <code className="bg-[var(--fondo-sutil)] px-1">core.phase_group</code> y{' '}
      <code className="bg-[var(--fondo-sutil)] px-1">ops.coverage_checkpoint</code>, leídos con el rol de sólo
      lectura. El portal de cada federación es el que el canónico declara en{' '}
      <code className="bg-[var(--fondo-sutil)] px-1">core.federation.portal_url</code>.
    </p>
  </>;
}
