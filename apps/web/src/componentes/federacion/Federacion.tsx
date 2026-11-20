import Link from 'next/link';
import type { Route } from 'next';
import type { FilaFichaFederacion } from '@/consultas/federaciones';
import type { FilaEdicionDeFederacion, FilaFederacionCabecera } from '@/consultas/federacion-ficha';
import { EscudoFederacion } from '@/componentes/EscudoFederacion';
import { fechaCorta } from '@/lib/vocabulario-pantalla';
import {
  coberturaDeEdicion, etiquetasDeEdicion, nivelDeEdicion, type AvisoDeCobertura, type MedidaDeCobertura,
} from '@/lib/federacion-ficha';

/**
 * Piezas de la ficha de federación, contra `prototipo/Federacion.dc.html`.
 *
 * Enseña lo medido: qué porcentaje de los partidos trae cada dato, qué competiciones hay en la temporada
 * y cómo se compara con las demás federaciones. Una cifra que no se ha medido se dice «sin medir»; no se
 * pinta un 0 que parecería una medición. Ningún aviso es genérico: cada uno lleva la cifra de ESTA
 * federación y lo que implica para el lector.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

const TONO: Record<string, string> = {
  completo: 'var(--cobertura-completa)',
  alineaciones: 'var(--cobertura-parcial)',
  resultados: 'var(--cobertura-nula)',
  calendario: 'var(--borde-fuerte)',
};

export function CabeceraFederacion({ federacion, ficha }: {
  federacion: FilaFederacionCabecera;
  ficha: FilaFichaFederacion | null;
}) {
  const medido = fechaCorta(ficha?.medido_en ?? null);
  const datos = [
    ficha?.temporada ? `Temporada ${ficha.temporada}` : null,
    ficha?.ediciones != null ? `${ficha.ediciones} competiciones` : null,
    ficha?.partidos != null ? `${new Intl.NumberFormat('es-ES').format(ficha.partidos)} partidos` : null,
  ].filter((parte): parte is string => parte !== null);
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <EscudoFederacion codigo={federacion.codigo} nombre={federacion.nombre} tieneEscudo={federacion.tiene_escudo} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <h1 className="m-0 break-words text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          {federacion.nombre}
        </h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          {[ficha?.comunidad, ficha?.federacion_madre ? `Federación de ${ficha.federacion_madre}` : null]
            .filter(Boolean).join(' · ') || 'Federación territorial'}
        </p>
        {datos.length > 0 && <p className="m-0 text-nota text-[var(--texto)]">{datos.join(' · ')}</p>}
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          {medido === null ? 'Sin fecha de medición' : `Datos medidos el ${medido}`}
          {federacion.portal_url && (
            <>
              {' · '}
              <a href={federacion.portal_url} target="_blank" rel="noreferrer"
                className="font-semibold text-[var(--accion)] hover:underline">Web oficial ↗</a>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/explorar/competiciones?federacion=${federacion.codigo}` as Route}
          className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] px-3.5 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)]">
          Ver competiciones
        </Link>
        <Link href={`/explorar/estadisticas?fed=${federacion.codigo}` as Route}
          className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] px-3.5 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)]">
          Estadísticas
        </Link>
      </div>
    </section>
  );
}

export function QueDatosPublica({ medidas }: { medidas: readonly MedidaDeCobertura[] }) {
  return (
    <section aria-labelledby="que-publica" className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="que-publica" className="m-0 text-bloque font-bold text-[var(--texto)]">Qué datos publica</h2>
        <span className="text-nota text-[var(--texto-suave)]">Medido sobre lo importado en la temporada más reciente</span>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[var(--fondo-sutil)] bg-[var(--fondo-sutil)] sm:grid-cols-3 xl:grid-cols-4">
        {medidas.map((medida) => (
          <div key={medida.clave} className="flex flex-col gap-1.5 bg-[var(--fondo-elevado)] px-4 py-3.5">
            <span className="text-tabla text-[var(--texto-suave)]">{medida.etiqueta}</span>
            <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">
              {medida.porcentaje === null
                ? <span className="text-cuerpo font-semibold text-[var(--texto-suave)]">Sin medir</span>
                : `${medida.porcentaje} %`}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--fondo-sutil)]" aria-hidden="true">
              <span className="block h-full bg-[var(--accion)]" style={{ width: `${medida.porcentaje ?? 0}%` }} />
            </span>
            <span className="text-nota leading-5 text-[var(--texto-suave)]">{medida.detalle}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AvisosDeLaFederacion({ avisos }: { avisos: readonly AvisoDeCobertura[] }) {
  return (
    <section aria-labelledby="avisos-federacion" className="flex flex-col gap-2">
      <h2 id="avisos-federacion" className="m-0 text-bloque font-bold text-[var(--texto)]">Lo que conviene saber</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {avisos.map((aviso, i) => (
          <li key={`${aviso.titulo}-${i}`}
            className={`flex flex-wrap items-baseline gap-2 border-l-4 bg-[var(--fondo-elevado)] px-3.5 py-2.5 text-tabla ${aviso.nivel === 'limite' ? 'border-[var(--amarilla)]' : 'border-[var(--borde-fuerte)]'}`}>
            <span className="rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-etiqueta font-bold text-[var(--texto)]">
              {aviso.nivel === 'limite' ? 'Límite' : 'Nota'}
            </span>
            <span className="font-semibold text-[var(--texto)]">{aviso.titulo}.</span>
            <span className="text-[var(--texto-suave)]">{aviso.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsigniaNivel({ nivel }: { nivel: string | null }) {
  const etiqueta = nivelDeEdicion(nivel);
  if (etiqueta === null) {
    return <span className="text-nota text-[var(--texto-suave)]">Sin medir</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--borde)] px-2 py-0.5 text-nota font-semibold text-[var(--texto)]">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: TONO[etiqueta.tono] }} />
      {etiqueta.etiqueta}
    </span>
  );
}

export function CompeticionesDeLaFederacion({ ediciones, federacion }: {
  ediciones: readonly FilaEdicionDeFederacion[];
  federacion: string;
}) {
  // La ficha enseña una muestra representativa; el catálogo tiene el listado completo y filtrable.
  const visibles = ediciones.slice(0, 12);
  return (
    <section aria-labelledby="competiciones-federacion" className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="competiciones-federacion" className="m-0 text-bloque font-bold text-[var(--texto)]">Competiciones</h2>
        <span className="text-nota text-[var(--texto-suave)]">
          {ediciones.length > 0 && ediciones[0]!.temporada ? `Temporada ${ediciones[0]!.temporada}` : 'Sin temporada publicada'}
        </span>
      </div>
      {ediciones.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">Esta federación no tiene competiciones publicadas.</p>
        : (
          <ul className="m-0 list-none p-0">
            {visibles.map((edicion) => {
              const cobertura = coberturaDeEdicion(edicion);
              const contenido = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 font-semibold text-[var(--texto)]" title={edicion.edicion}>{edicion.edicion}</span>
                    <span className="text-nota text-[var(--texto-suave)]">
                      {[etiquetasDeEdicion(edicion), `${edicion.grupos} grupo${edicion.grupos === 1 ? '' : 's'}`]
                        .filter(Boolean).join(' · ')}
                    </span>
                    <span className="text-nota text-[var(--texto-suave)]">
                      {edicion.partidos === null
                        ? 'Cobertura sin medir'
                        : `${new Intl.NumberFormat('es-ES').format(edicion.partidos)} partidos · ${cobertura.resultado ?? 0} % con resultado · ${cobertura.cambios ?? 0} % con cambios`}
                    </span>
                  </span>
                  <InsigniaNivel nivel={edicion.nivel} />
                </>
              );
              return (
                <li key={edicion.edicion_id} className="border-t border-[var(--fondo-sutil)]">
                  {edicion.primer_grupo_id === null
                    ? <div className="flex items-center gap-3 px-4 py-3">{contenido}</div>
                    : (
                      <Link href={`/explorar/competicion/${edicion.primer_grupo_id}` as Route}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--fondo-sutil)]">
                        {contenido}
                      </Link>
                    )}
                </li>
              );
            })}
          </ul>
        )}
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        La cobertura es lo medido sobre los partidos de esa competición; una competición sin medir no se pinta como completa.
      </p>
      {ediciones.length > visibles.length && (
        <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
          Se enseñan {visibles.length} de {ediciones.length} competiciones.{' '}
          <Link href={`/explorar/competiciones?federacion=${federacion}` as Route} className="font-semibold text-[var(--accion)] hover:underline">
            Ver todas
          </Link>
        </p>
      )}
    </section>
  );
}

export function ComparativaDeFederaciones({ fichas, actual }: {
  fichas: readonly FilaFichaFederacion[];
  actual: string;
}) {
  const pct = (valor: number | string | null): string => {
    const numero = valor === null ? null : Number(valor);
    return numero === null || !Number.isFinite(numero) ? 'Sin medir' : `${Math.round(numero)} %`;
  };
  return (
    <section aria-labelledby="comparativa-federaciones" className={`${TARJETA} overflow-hidden`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3.5">
        <h2 id="comparativa-federaciones" className="m-0 text-bloque font-bold text-[var(--texto)]">Comparar con otras federaciones</h2>
        <span className="text-nota text-[var(--texto-suave)]">Temporada medida de cada una</span>
      </div>
      {fichas.length === 0
        ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">No hay otras federaciones medidas con las que comparar.</p>
        : (
          <div className="overflow-x-auto border-t border-[var(--fondo-sutil)]">
            <table className="w-full border-collapse text-tabla" style={{ minWidth: 480 }}>
              <caption className="sr-only">Cobertura medida de otras federaciones: resultados, alineaciones, cambios y tarjetas.</caption>
              <thead>
                <tr className="text-right text-etiqueta text-[var(--texto-suave)]">
                  <th scope="col" className="py-2 pl-4 pr-2 text-left font-semibold">Federación</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Resultados</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Alineaciones</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Cambios</th>
                  <th scope="col" className="py-2 pl-2 pr-4 font-semibold">Tarjetas</th>
                </tr>
              </thead>
              <tbody>
                {fichas.filter((ficha) => ficha.codigo !== actual).map((ficha) => (
                  <tr key={ficha.codigo} className="border-t border-[var(--fondo-sutil)] text-right">
                    <th scope="row" className="py-1.5 pl-4 pr-2 text-left font-semibold text-[var(--texto)]">
                      <Link href={`/explorar/federacion/${ficha.codigo}` as Route} className="hover:text-[var(--accion)] hover:underline">
                        {ficha.nombre_corto}
                      </Link>
                    </th>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--texto-suave)]">{pct(ficha.pct_resultado)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--texto-suave)]">{pct(ficha.pct_alineacion)}</td>
                    <td className="px-2 py-1.5 tabular-nums text-[var(--texto-suave)]">{pct(ficha.pct_cambios)}</td>
                    <td className="py-1.5 pl-2 pr-4 tabular-nums text-[var(--texto-suave)]">{pct(ficha.pct_tarjetas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-2.5 text-nota leading-5 text-[var(--texto-suave)]">
        «Sin medir» es una federación de la que todavía no se ha calculado la cobertura; no es un cero.
      </p>
    </section>
  );
}
