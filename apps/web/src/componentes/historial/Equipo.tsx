import Link from 'next/link';
import type { Route } from 'next';
import { Escudo } from '@/componentes/Escudo';
import type { FilaHistorialEquipo } from '@/consultas/historial-equipos';
import { formatoNumero } from '@/lib/fichas';
import {
  etiquetaDeLineaDeEquipo, puestoDeFila, type ResumenDeHistorial, type TemporadaDeEquipo,
} from '@/lib/historial-equipos';
import { Dato, EnlaceDeTarjeta, Etiqueta, EtiquetaDeTemporada, PuestoTexto, RachaDeSignos } from './piezas';

/**
 * Las secciones del historial de un equipo: `/explorar/equipo/[id]/historial`.
 *
 * No es un palmarés ni un resumen de la temporada: es la vida de una línea de equipo (categoría y
 * letra) temporada a temporada. Cada tarjeta enlaza la competición, la última jornada jugada y el acta
 * de esa temporada, además de la ficha del equipo de esa temporada.
 *
 * Lo que no se inventa: sin puesto publicado no hay «0.º»; sin goles no hay «0:0»; y la temporada en
 * curso se marca «En juego» para que su puesto no se lea como definitivo.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold uppercase tracking-[0.05em] text-[var(--texto-suave)]';

/** Cabecera con el nombre del equipo, su club, su línea y el enlace a su ficha. */
export function CabeceraHistorialEquipo({ fila }: { fila: FilaHistorialEquipo }) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-5 py-4">
      <Escudo equipoId={Number(fila.equipo_id)} nombre={fila.equipo} clubId={Number(fila.club_id)}
        tieneEscudo={fila.tiene_escudo} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <p className={ETIQUETA}>Historial</p>
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          {fila.equipo}
        </h1>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          <Link href={`/explorar/club/${fila.club_id}` as Route}
            className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {fila.club}
          </Link>
          {' · '}{etiquetaDeLineaDeEquipo(fila)}{' · '}{fila.federacion_nombre}
        </p>
        <p className="m-0 text-nota">
          <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
            className="font-semibold text-[var(--accion)] hover:underline">
            Ver la ficha del equipo
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Las cuatro cifras de cabecera del historial. */
export function ResumenHistorialEquipo({ resumen }: { resumen: ResumenDeHistorial }) {
  const tarjetas = [
    {
      etiqueta: 'Temporadas',
      valor: formatoNumero(resumen.temporadas),
      nota: resumen.primeraTemporada === null
        ? 'Sin temporadas publicadas'
        : `${resumen.primeraTemporada} – ${resumen.ultimaTemporada}`,
    },
    {
      etiqueta: 'Partidos',
      valor: resumen.partidos === null ? 'Sin datos' : formatoNumero(resumen.partidos),
      nota: 'Con resultado publicado',
    },
    {
      etiqueta: 'Goles',
      valor: resumen.golesFavor === null || resumen.golesContra === null
        ? 'Sin datos'
        : `${formatoNumero(resumen.golesFavor)} : ${formatoNumero(resumen.golesContra)}`,
      nota: 'A favor y en contra',
    },
    {
      etiqueta: 'Mejor puesto',
      valor: resumen.mejorPuesto === null ? 'Sin datos' : `${resumen.mejorPuesto.posicion}.º`,
      nota: resumen.mejorPuesto?.de === null || resumen.mejorPuesto?.de === undefined
        ? 'El más alto publicado'
        : `El más alto publicado, de ${resumen.mejorPuesto.de} equipos`,
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

/** Texto de goles: un lado desconocido no se rellena con 0. */
function textoDeGoles(fila: FilaHistorialEquipo): string {
  if (fila.goles_favor === null || fila.goles_contra === null) return 'Sin datos';
  return `${formatoNumero(fila.goles_favor)} : ${formatoNumero(fila.goles_contra)}`;
}

/** Texto del balance V-E-D, sólo si están los tres datos. */
function textoDeBalance(fila: FilaHistorialEquipo): string | null {
  if (fila.ganados === null || fila.empatados === null || fila.perdidos === null) return null;
  return `${formatoNumero(fila.ganados)} V · ${formatoNumero(fila.empatados)} E · ${formatoNumero(fila.perdidos)} D`;
}

/** Una tarjeta por temporada. */
function Temporada({ temporada }: { temporada: TemporadaDeEquipo }) {
  const { fila, estado, puesto, movimiento, racha } = temporada;
  const balance = textoDeBalance(fila);
  const titulo = `temporada-${fila.equipo_id}`;
  return (
    <li>
      <article className={`${TARJETA} flex flex-col gap-3 p-4`} aria-labelledby={titulo}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id={titulo} className="m-0 flex flex-wrap items-center gap-2">
              <span className="text-bloque font-extrabold tabular-nums text-[var(--texto)]">{fila.temporada}</span>
              <EtiquetaDeTemporada estado={estado} />
              {movimiento !== null && (
                <Etiqueta>{movimiento}</Etiqueta>
              )}
              {fila.jugo_fase_ascenso === true && <Etiqueta>Fase de ascenso</Etiqueta>}
            </h3>
            <p className="m-0 text-tabla text-[var(--texto-suave)]">
              <Link href={`/explorar/competicion/${fila.grupo_id}` as Route}
                className="font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
                {fila.edicion}
              </Link>
              {' · '}{fila.grupo}
            </p>
          </div>
          <Link href={`/explorar/equipo/${fila.equipo_id}` as Route}
            className="text-nota font-semibold text-[var(--accion)] hover:underline">
            Ficha del equipo
          </Link>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Puesto" nota={puesto === null ? 'Sin puesto publicado' : (puesto.de === null ? undefined : `de ${puesto.de} equipos`)}>
            <PuestoTexto puesto={puesto} />
          </Dato>
          <Dato etiqueta="Partidos" nota={balance ?? 'Sin balance publicado'}>
            <span className="text-cuerpo font-bold tabular-nums text-[var(--texto)]">
              {fila.jugados === null ? 'Sin datos' : formatoNumero(fila.jugados)}
            </span>
          </Dato>
          <Dato etiqueta="Goles" nota="A favor y en contra">
            <span className="text-cuerpo font-bold tabular-nums text-[var(--texto)]">{textoDeGoles(fila)}</span>
          </Dato>
          <Dato etiqueta="Racha" nota="Últimos partidos publicados">
            <RachaDeSignos racha={racha} />
          </Dato>
        </dl>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--fondo-sutil)] pt-2.5 text-nota">
          <EnlaceDeTarjeta href={`/explorar/competicion/${fila.grupo_id}`}>Competición</EnlaceDeTarjeta>
          <EnlaceDeTarjeta href={`/explorar/competicion/${fila.grupo_id}/jornadas`}>Jornadas</EnlaceDeTarjeta>
          {fila.ultima_jornada !== null && (
            <EnlaceDeTarjeta href={`/explorar/competicion/${fila.grupo_id}/jornada/${fila.ultima_jornada}`}>
              Última jornada ({fila.ultima_jornada})
            </EnlaceDeTarjeta>
          )}
          {fila.ultimo_partido_id !== null && (
            <EnlaceDeTarjeta href={`/explorar/acta/${fila.ultimo_partido_id}`}>Última acta</EnlaceDeTarjeta>
          )}
        </div>
      </article>
    </li>
  );
}

/** La lista de temporadas, de la más reciente a la más antigua. */
export function TemporadasDelEquipo({ temporadas }: { temporadas: readonly TemporadaDeEquipo[] }) {
  return (
    <section aria-labelledby="temporadas-equipo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="temporadas-equipo" className="m-0 text-bloque font-bold text-[var(--texto)]">
          Temporada a temporada
        </h2>
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Sólo aparecen las temporadas con equipo publicado. Un puesto con † se ha calculado con los resultados publicados.
        </p>
      </div>
      {temporadas.length === 0 ? (
        <p className="m-0 text-tabla text-[var(--texto-suave)]">Sin temporadas publicadas.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {temporadas.map((temporada) => (
            <Temporada key={temporada.fila.equipo_id} temporada={temporada} />
          ))}
        </ol>
      )}
    </section>
  );
}
