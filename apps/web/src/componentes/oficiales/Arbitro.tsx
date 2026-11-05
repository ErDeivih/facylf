import Link from 'next/link';
import type { Route } from 'next';
import { Cifras, type Cifra } from '@/componentes/estadisticas/Cifras';
import { TARJETA } from '@/componentes/estadisticas/controles';
import type { FilaArbitro, LineaCompeticionArbitro, PartidoDeArbitro } from '@/consultas/oficiales';
import { mediaPorPartido, mediaTexto } from '@/lib/oficiales';
import { fechaCorta } from '@/lib/presentacion-canonico';
import { ChipTarjeta, EnlaceActa, Marcador, TextoVacio } from './piezas';

/**
 * Secciones de la ficha de un árbitro.
 *
 * Enseñan lo que un árbitro deja en un partido: cuántos arbitra, cuántas tarjetas y penaltis señala y
 * cómo se compara con su competición. Las medias dividen entre **partidos con acta**, no entre todos:
 * un partido sin acta no es «cero tarjetas», es un dato que no se publicó.
 */

/** Cifras de cabecera: partidos, amarillas, rojas y goles de penalti, con su media por partido. */
export function ResumenDeArbitro({ fila }: { fila: FilaArbitro }) {
  const conActa = fila.con_acta;
  const cifras: Cifra[] = [
    { etiqueta: 'Partidos', valor: String(fila.partidos), nota: `${conActa} con acta` },
    {
      etiqueta: 'Amarillas', valor: String(fila.amarillas),
      nota: `${mediaTexto(mediaPorPartido(fila.amarillas, conActa))} por partido`,
    },
    {
      etiqueta: 'Rojas', valor: String(fila.rojas),
      nota: fila.dobles_amarillas > 0
        ? `${mediaTexto(mediaPorPartido(fila.rojas, conActa))} por partido · ${fila.dobles_amarillas} de doble amarilla`
        : `${mediaTexto(mediaPorPartido(fila.rojas, conActa))} por partido`,
    },
    {
      etiqueta: 'Goles de penalti', valor: String(fila.penaltis),
      nota: `${mediaTexto(mediaPorPartido(fila.penaltis, conActa))} por partido`,
    },
  ];
  return <Cifras cifras={cifras} />;
}

/** Comparación de sus medias con las de cada competición, para que el número tenga referencia. */
export function CompeticionesDeArbitro({ competiciones }: { competiciones: readonly LineaCompeticionArbitro[] }) {
  return (
    <section aria-labelledby="competiciones-arbitro" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="competiciones-arbitro" className="m-0 text-bloque font-bold text-[var(--texto)]">Competiciones</h2>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          Media por partido del árbitro y de la competición en la que ha pitado.
        </p>
      </div>
      {competiciones.length === 0
        ? <TextoVacio>Sin competiciones arbitradas.</TextoVacio>
        : (
          <ul className="m-0 list-none p-0">
            {competiciones.map((c) => (
              <li key={`${c.edicion_id}-${c.temporada}`}
                className="border-t border-[var(--fondo-sutil)] px-4 py-3">
                <p className="m-0 text-tabla font-semibold text-[var(--texto)]">{c.edicion} · {c.temporada}</p>
                <p className="m-0 text-nota text-[var(--texto-suave)]">
                  {c.partidos} {c.partidos === 1 ? 'partido arbitrado' : 'partidos arbitrados'} · {c.con_acta} con acta
                </p>
                <dl className="m-0 mt-2 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">Amarillas</dt>
                    <dd className="m-0 text-dato font-extrabold tabular-nums text-[var(--texto)]">
                      {mediaTexto(mediaPorPartido(c.amarillas, c.con_acta))}
                    </dd>
                    <dd className="m-0 text-nota text-[var(--texto-suave)]">
                      Competición: {mediaTexto(mediaPorPartido(c.amarillas_competicion, c.partidos_competicion))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">Rojas</dt>
                    <dd className="m-0 text-dato font-extrabold tabular-nums text-[var(--texto)]">
                      {mediaTexto(mediaPorPartido(c.rojas, c.con_acta))}
                    </dd>
                    <dd className="m-0 text-nota text-[var(--texto-suave)]">
                      Competición: {mediaTexto(mediaPorPartido(c.rojas_competicion, c.partidos_competicion))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]">Goles de penalti</dt>
                    <dd className="m-0 text-dato font-extrabold tabular-nums text-[var(--texto)]">
                      {mediaTexto(mediaPorPartido(c.penaltis, c.con_acta))}
                    </dd>
                    <dd className="m-0 text-nota text-[var(--texto-suave)]">
                      Competición: {mediaTexto(mediaPorPartido(c.penaltis_competicion, c.partidos_competicion))}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Los últimos partidos arbitrados, con sus tarjetas y su enlace al acta. */
export function UltimosPartidosDeArbitro({ partidos }: { partidos: readonly PartidoDeArbitro[] }) {
  return (
    <section aria-labelledby="partidos-arbitro" className={TARJETA}>
      <div className="px-4 py-3.5">
        <h2 id="partidos-arbitro" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos partidos</h2>
      </div>
      {partidos.length === 0
        ? <TextoVacio>Sin partidos arbitrados.</TextoVacio>
        : (
          <ul className="m-0 list-none p-0">
            {partidos.map((p) => (
              <li key={p.match_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--fondo-sutil)] px-4 py-2.5">
                <p className="m-0 w-full text-nota text-[var(--texto-suave)]">
                  {fechaCorta(p.fecha)}
                  {p.jornada !== null && <> · J{p.jornada}</>}
                  {' · '}
                  <Link href={`/explorar/competicion/${p.grupo_id}` as Route}
                    className="hover:text-[var(--accion)] hover:underline">{p.edicion} · {p.grupo}</Link>
                </p>
                <p className="m-0 min-w-0 flex-1 text-tabla text-[var(--texto)]">
                  {p.local_id !== null
                    ? <Link href={`/explorar/equipo/${p.local_id}` as Route} className="hover:underline">{p.local}</Link>
                    : p.local}
                  {' '}<Marcador propios={p.goles_local} rival={p.goles_visitante} />{' '}
                  {p.visitante_id !== null
                    ? <Link href={`/explorar/equipo/${p.visitante_id}` as Route} className="hover:underline">{p.visitante}</Link>
                    : p.visitante}
                </p>
                <span className="flex items-center gap-2.5">
                  <ChipTarjeta letra="A" cuantos={p.amarillas} nombre="amarillas" />
                  <ChipTarjeta letra="R" cuantos={p.rojas} nombre="rojas" />
                  <ChipTarjeta letra="P" cuantos={p.penaltis} nombre="goles de penalti" />
                </span>
                {p.tiene_acta && <EnlaceActa matchId={p.match_id} />}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
