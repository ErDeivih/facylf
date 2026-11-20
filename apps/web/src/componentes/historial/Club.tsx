import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import type { FilaHistorialClub } from '@/consultas/historial-equipos';
import { formatoNumero } from '@/lib/fichas';
import {
  etiquetaDeEquipoDeClub, movimientoLegible, puestoDeFila,
  type ResumenDeClub, type TemporadaDelClub,
} from '@/lib/historial-equipos';
import { EnlaceDeTarjeta, Etiqueta, PuestoTexto } from './piezas';

/**
 * Las secciones del historial de un club: `/explorar/club/[id]/historial`.
 *
 * Un club no es un equipo: es el paraguas de todas sus inscripciones. Esta pantalla las enseña
 * agrupadas por temporada, de la más reciente a la más antigua, con la categoría y la letra del filial
 * delante para que dos equipos del mismo club en la misma temporada no se confundan.
 *
 * Cada temporada va en un bloque plegable: la actual y la anterior, abiertas; el resto, a un clic.
 * Así la página no se convierte en una lista de cientos de tarjetas al abrirla.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

function plural(cantidad: number, singular: string, plural_: string): string {
  return `${formatoNumero(cantidad)} ${cantidad === 1 ? singular : plural_}`;
}

/** Cabecera con el club, su lugar y el enlace a su ficha. */
export function CabeceraHistorialClub({ fila }: { fila: FilaHistorialClub }) {
  const lugar = fila.municipio && fila.provincia
    ? `${fila.municipio} (${fila.provincia})`
    : (fila.municipio ?? fila.provincia ?? null);
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <Escudo equipoId={Number(fila.club_id)} nombre={fila.club} clubId={Number(fila.club_id)}
        tieneEscudo={fila.tiene_escudo} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <p className={ETIQUETA}>Historial</p>
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">{fila.club}</h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          {[lugar, fila.federacion_nombre].filter(Boolean).join(' · ')}
        </p>
        <p className="m-0 text-nota">
          <Link href={`/explorar/club/${fila.club_id}` as Route}
            className="font-semibold text-[var(--accion)] hover:underline">
            Ver la ficha del club
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Las cuatro cifras de cabecera del historial del club. */
export function ResumenHistorialClub({ resumen }: { resumen: ResumenDeClub }) {
  // Un club puede existir en el archivo sin ningún equipo publicado. Ahí un «0 equipos» afirmaría que
  // no tiene equipos, y lo que pasa es que no se sabe: se dice «sin datos», no un cero.
  const sinEquipos = resumen.equipos === 0;
  const indeterminado = 'Sin datos';
  const tarjetas = [
    {
      etiqueta: 'Temporadas',
      valor: sinEquipos ? indeterminado : formatoNumero(resumen.temporadas),
      nota: sinEquipos
        ? 'Sin equipos publicados'
        : (resumen.primeraTemporada === null ? indeterminado : `${resumen.primeraTemporada} – ${resumen.ultimaTemporada}`),
    },
    {
      etiqueta: 'Equipos',
      valor: sinEquipos ? indeterminado : formatoNumero(resumen.equipos),
      nota: sinEquipos ? 'Sin equipos publicados' : 'Inscripciones publicadas, todas las categorías',
    },
    {
      etiqueta: 'Categorías',
      valor: sinEquipos ? indeterminado : formatoNumero(resumen.categorias),
      nota: sinEquipos ? 'Sin equipos publicados' : 'Categorías distintas con equipo',
    },
    {
      etiqueta: 'Mejor puesto',
      valor: resumen.mejorPuesto === null ? indeterminado : `${resumen.mejorPuesto.posicion}.º`,
      nota: sinEquipos ? 'Sin equipos publicados' : 'El más alto publicado',
    },
  ];
  return (
    <section aria-label="Resumen del historial" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <article key={tarjeta.etiqueta} className={`${TARJETA} flex flex-col gap-1 p-3.5`}>
          <span className={ETIQUETA}>{tarjeta.etiqueta}</span>
          <span className="text-dato font-extrabold tabular-nums text-[var(--texto)]">{tarjeta.valor}</span>
          <span className="text-nota leading-5 text-[var(--texto-suave)]">{tarjeta.nota}</span>
        </article>
      ))}
    </section>
  );
}

/** Tarjeta de un equipo del club dentro de su temporada. */
function EquipoDelClub({ fila }: { fila: FilaHistorialClub }) {
  const puesto = puestoDeFila(fila);
  const movimiento = movimientoLegible(fila.movimiento);
  const letra = fila.letra ?? 'A';
  const nombreCompleto = fila.equipo ?? '';
  return (
    <article className="flex h-full flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--borde)] p-3">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true"
          className="flex size-9 flex-none items-center justify-center rounded-[var(--radius-md)] bg-[var(--accion)] text-cuerpo font-extrabold text-[var(--texto-inverso)]">
          {letra}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 text-tabla font-bold text-[var(--texto)]">{etiquetaDeEquipoDeClub(fila)}</h3>
          {nombreCompleto !== '' && (
            <p className="m-0 truncate text-nota text-[var(--texto-suave)]" title={nombreCompleto}>{nombreCompleto}</p>
          )}
          <p className="m-0 text-nota leading-5 text-[var(--texto-suave)]">
            {[fila.edicion, fila.grupo].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-0.5">
          <PuestoTexto puesto={puesto} />
          {puesto !== null && puesto.de !== null && (
            <span className="text-nota text-[var(--texto-suave)]">de {puesto.de}</span>
          )}
          {fila.jugados !== null && (
            <span className="text-nota text-[var(--texto-suave)]">{plural(fila.jugados, 'partido', 'partidos')}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex flex-wrap gap-1.5">
          {movimiento !== null && <Etiqueta>{movimiento}</Etiqueta>}
          {fila.jugo_fase_ascenso === true && <Etiqueta>Fase de ascenso</Etiqueta>}
        </span>
        <span className="flex gap-3 text-nota">
          {fila.equipo_id !== null && (
            <EnlaceDeTarjeta href={`/explorar/equipo/${fila.equipo_id}`}>Ficha</EnlaceDeTarjeta>
          )}
          {fila.equipo_id !== null && (
            <EnlaceDeTarjeta href={`/explorar/equipo/${fila.equipo_id}/historial`}>Historial</EnlaceDeTarjeta>
          )}
        </span>
      </div>
    </article>
  );
}

/** Una temporada del club, plegable, con sus equipos. */
function Temporada({ temporada, abierta }: { temporada: TemporadaDelClub; abierta: boolean }) {
  const { resumen } = temporada;
  const mejor = resumen.mejorPuesto === null ? null : `${resumen.mejorPuesto.posicion}.º`;
  return (
    <details id={`temporada-${temporada.temporada}`} open={abierta} className={`${TARJETA} overflow-hidden scroll-mt-24`}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 hover:bg-[var(--fondo-sutil)]">
        <span className="text-bloque font-extrabold tabular-nums text-[var(--texto)]">{temporada.temporada}</span>
        {temporada.enJuego && <Etiqueta tono="enJuego">En juego</Etiqueta>}
        <span className="text-nota text-[var(--texto-suave)]">
          {plural(resumen.equipos, 'equipo', 'equipos')}
          {' · '}{plural(resumen.categorias, 'categoría', 'categorías')}
          {mejor === null ? '' : ` · mejor puesto ${mejor}`}
          {resumen.ascensos > 0 ? ` · ${plural(resumen.ascensos, 'ascenso', 'ascensos')}` : ''}
          {resumen.descensos > 0 ? ` · ${plural(resumen.descensos, 'descenso', 'descensos')}` : ''}
        </span>
      </summary>
      <ul className="m-0 grid list-none grid-cols-1 gap-2.5 border-t border-[var(--fondo-sutil)] p-3 sm:grid-cols-2 xl:grid-cols-3">
        {temporada.equipos.map((equipo) => (
          <li key={equipo.equipo_id ?? `${temporada.temporada}-${equipo.equipo ?? 'equipo'}`}>
            <EquipoDelClub fila={equipo} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/** La lista de temporadas del club, de la más reciente a la más antigua. */
export function TemporadasDelClub({ temporadas }: { temporadas: readonly TemporadaDelClub[] }) {
  return (
    <section aria-labelledby="temporadas-club" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="temporadas-club" className="m-0 text-bloque font-bold text-[var(--texto)]">
          Temporada a temporada
        </h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Sólo aparecen las temporadas con equipos publicados. Cada tarjeta es un equipo del club en una competición.
          {' '}Un puesto con † se ha calculado con los resultados publicados.
        </p>
      </div>
      {temporadas.length === 0 ? (
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          Sin equipos publicados: no hay ninguna temporada con equipo de este club.
        </p>
      ) : (
        <>
        <nav aria-label="Ir a una temporada" className="flex flex-wrap gap-1.5">
          {temporadas.map((temporada) => (
            <a key={temporada.temporada} href={`#temporada-${temporada.temporada}`}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde)] px-2.5 text-nota font-semibold text-[var(--texto)] hover:border-[var(--accion)] hover:text-[var(--accion)]">
              {temporada.temporada}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-3">
          {temporadas.map((temporada, indice) => (
            <Temporada key={temporada.temporada} temporada={temporada} abierta={indice === 0} />
          ))}
        </div>
        </>
      )}
    </section>
  );
}
