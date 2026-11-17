import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { CLASIFICACION_CALCULADA, type FilaClasificacionPantalla } from '@/consultas/competiciones';
import {
  CONTEXTO_DE_PREVIA, POSICION_POR_JORNADA, type FilaContextoDePrevia, type FilaPosicionPorJornada,
} from '@/consultas/evolucion';
import { PREVIA_DEL_PARTIDO, type FilaPrevia, type PuntoJornada, type H2HPrevia, type JugadorPrevia } from '@/consultas/previa';
import { SinCanonico } from '@/componentes/SinCanonico';
import { PosicionPorJornada } from '@/componentes/fichas/PosicionPorJornada';
import { InsigniasRacha } from '@/componentes/oficiales/piezas';
import { PrediccionPartido } from '@/componentes/partidos/PrediccionPartido';
import { FotoJugador } from '@/componentes/fichas/FotoJugador';
import { MatrizMarcadores } from '@/componentes/partidos/MatrizMarcadores';
import type { PrediccionDePartido } from '@/lib/prediccion';
import { modoDeFotos } from '@/lib/fotos';

export const revalidate = 60;

function idDePartido(crudo: string): number {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = idDePartido(id);
  if (Number.isNaN(n)) return {};
  try {
    const [f] = await consulta<FilaPrevia>(PREVIA_DEL_PARTIDO.sql, [n]);
    return f ? { title: `Previa: ${f.local} – ${f.visitante} — Fondo Popular` } : {};
  } catch { return {}; }
}

function GraficaPuntos({ datos, nombre }: { datos: PuntoJornada[]; nombre: string }) {
  if (datos.length === 0) {
    return <p className="m-0 text-tabla text-[var(--texto-suave)]">{nombre}: sin partidos jugados.</p>;
  }
  let acumulado = 0;
  const serie = datos.map((d) => { acumulado += d.puntos; return { j: d.jornada, p: acumulado }; });
  const max = Math.max(3, ...serie.map((s) => s.p));
  const puntos = serie.map((s, i) => `${(i / Math.max(1, serie.length - 1)) * 100},${40 - (s.p / max) * 36}`).join(' ');
  return (
    <div>
      <p className="m-0 text-tabla font-semibold text-[var(--texto)]">{nombre} <span className="font-normal text-[var(--texto-suave)]">· {acumulado} puntos</span></p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-1 h-20 w-full text-[var(--accion)]" role="img"
        aria-label={`Puntos acumulados de ${nombre} por jornada: ${serie.map((s) => `J${s.j} ${s.p}`).join(', ')}`}>
        <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" strokeOpacity="0.15" />
        <polyline fill="none" stroke="currentColor" strokeWidth="1.6" points={puntos} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="m-0 text-nota text-[var(--texto-suave)]">Jornada {serie[0].j} a {serie[serie.length - 1].j}.</p>
    </div>
  );
}

export default async function PantallaPrevia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = idDePartido(id);
  if (Number.isNaN(n)) notFound();
  let f: FilaPrevia | undefined;
  try {
    [f] = await consulta<FilaPrevia>(PREVIA_DEL_PARTIDO.sql, [n]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Previa" motivo={error.message} />;
    throw error;
  }
  if (!f) notFound();

  // Forma, posición, campo y evolución van aparte de la consulta principal: si algo de esto falla, la
  // previa sigue con la predicción, que es lo que no puede faltar.
  let contexto: FilaContextoDePrevia | undefined;
  let tabla: FilaClasificacionPantalla[] = [];
  let evolucionLocal: FilaPosicionPorJornada[] = [];
  let evolucionVisitante: FilaPosicionPorJornada[] = [];
  try {
    [contexto] = await consulta<FilaContextoDePrevia>(CONTEXTO_DE_PREVIA.sql, [f.match_id]);
    if (contexto) {
      [tabla, evolucionLocal, evolucionVisitante] = await Promise.all([
        consulta<FilaClasificacionPantalla>(CLASIFICACION_CALCULADA.sql, [contexto.grupo_id]),
        consulta<FilaPosicionPorJornada>(POSICION_POR_JORNADA.sql, [f.local_id]),
        consulta<FilaPosicionPorJornada>(POSICION_POR_JORNADA.sql, [f.visitante_id]),
      ]);
    }
  } catch {
    contexto = undefined;
  }
  const signos = (forma: string | undefined) => [...(forma ?? '')].filter((s): s is 'G' | 'E' | 'P' => s === 'G' || s === 'E' || s === 'P');
  const lados = [
    { nombre: f.local, id: Number(f.local_id), forma: signos(contexto?.forma_local) },
    { nombre: f.visitante, id: Number(f.visitante_id), forma: signos(contexto?.forma_visitante) },
  ].map((lado) => ({ ...lado, fila: tabla.find((t) => Number(t.equipo_id) === lado.id) ?? null }));
  const jornadaDeLaTabla = tabla[0]?.jornada ?? null;
  const conFotos = modoDeFotos() !== 'ninguna';
  const jugadoresLocal: JugadorPrevia[] = f.jugadores_local ?? [];
  const jugadoresVisitante: JugadorPrevia[] = f.jugadores_visitante ?? [];
  const h2h: H2HPrevia[] = f.h2h ?? [];
  const puntosLocal: PuntoJornada[] = f.puntos_local ?? [];
  const puntosVisitante: PuntoJornada[] = f.puntos_visitante ?? [];

  const prediccion: PrediccionDePartido | null = f.pred_local != null && f.pred_empate != null && f.pred_visitante != null
    ? {
      prob_local: Number(f.pred_local), prob_empate: Number(f.pred_empate), prob_visitante: Number(f.pred_visitante),
      marcador_probable: f.marcador ?? '—', prob_marcador: Number(f.prob_marcador ?? 0),
      media_total: 0, ventaja_casa: 0, partidos_liga: 0,
      banda: f.pred_local_low != null && f.pred_visitante_low != null
        ? { local: [Number(f.pred_local_low), Number(f.pred_local_high)], empate: [Number(f.pred_empate_low), Number(f.pred_empate_high)], visitante: [Number(f.pred_visitante_low), Number(f.pred_visitante_high)] }
        : null,
    } : null;

  const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
  const fechaLarga = (iso: string | null): string | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
  };
  // Datos del partido: cada uno dice lo que hay o que no está publicado; ninguno se rellena.
  const datos: { etiqueta: string; valor: React.ReactNode; falta: boolean }[] = [
    { etiqueta: 'Fecha', valor: fechaLarga(f.fecha) ?? 'Sin fecha publicada', falta: fechaLarga(f.fecha) === null },
    { etiqueta: 'Hora', valor: f.hora ?? 'Sin hora publicada', falta: !f.hora },
    {
      etiqueta: 'Campo',
      valor: f.campo
        ? (contexto?.campo_id
          ? <Link href={`/explorar/campo/${contexto.campo_id}` as Route} className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] hover:underline">{f.campo}</Link>
          : f.campo)
        : 'Sin campo publicado',
      falta: !f.campo,
    },
    { etiqueta: 'Árbitro', valor: f.arbitro ?? 'Sin designar', falta: !f.arbitro },
  ];
  const plantillas = [
    { nombre: f.local, jugadores: jugadoresLocal },
    { nombre: f.visitante, jugadores: jugadoresVisitante },
  ];
  const enfrentamientos = h2h.slice(0, 5);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap gap-2 text-tabla text-[var(--texto-suave)]">
        <Link href={(contexto ? `/explorar/competicion/${contexto.grupo_id}` : '/explorar/competiciones') as Route} className="hover:underline">{f.edicion}</Link>
        <span aria-hidden="true">›</span><span className="min-w-0 break-words">{f.grupo}</span>
        <span aria-hidden="true">›</span><span className="text-[var(--texto)]" aria-current="page">Previa</span>
      </nav>

      <header className="flex flex-col gap-1">
        <p className="m-0 text-nota text-[var(--texto-suave)]">
          Jornada {f.jornada}{fechaLarga(f.fecha) ? ` · ${fechaLarga(f.fecha)}` : ''}{f.hora ? ` · ${f.hora}` : ''}
        </p>
        <h1 className="m-0 flex flex-col text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">
          <span className="break-words">{f.local}</span>
          <span className="break-words">{f.visitante}</span>
        </h1>
      </header>

      {/* Lo primero: la predicción y el marcador más probable. */}
      <PrediccionPartido local={f.local} visitante={f.visitante} prediccion={prediccion} jugado={false} matriz={f.matriz} sinExplicacion />
      {f.matriz && (
        <section aria-labelledby="matriz-marcadores" className={`${TARJETA} px-4 py-3`}>
          <h2 id="matriz-marcadores" className="m-0 text-bloque font-bold text-[var(--texto)]">Matriz de resultados posibles</h2>
          <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">Probabilidad de cada marcador según el Poisson del partido. Filas: goles de {f.local}; columnas: goles de {f.visitante}.</p>
          <MatrizMarcadores local={f.local} visitante={f.visitante} matriz={f.matriz} />
        </section>
      )}

      <section aria-labelledby="datos-partido" className={`${TARJETA} px-4 py-3`}>
        <h2 id="datos-partido" className="m-0 text-bloque font-bold text-[var(--texto)]">Datos del partido</h2>
        <dl className="m-0 mt-1">
          {datos.map((d) => (
            <div key={d.etiqueta} className="flex min-h-11 items-center justify-between gap-3 border-t border-[var(--fondo-sutil)] first:border-t-0">
              <dt className="flex-none text-tabla text-[var(--texto-suave)]">{d.etiqueta}</dt>
              <dd className={`m-0 min-w-0 break-words text-right text-tabla ${d.falta ? 'text-[var(--texto-suave)]' : 'font-semibold text-[var(--texto)]'}`}>{d.valor}</dd>
            </div>
          ))}
        </dl>
      </section>

      {contexto && (
        <section aria-labelledby="forma-previa" className={`${TARJETA} px-4 py-3`}>
          <h2 id="forma-previa" className="m-0 text-bloque font-bold text-[var(--texto)]">Forma y posición</h2>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {lados.map((lado) => (
              <li key={lado.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--fondo-sutil)] pt-2 first:border-t-0 first:pt-0">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/explorar/equipo/${lado.id}` as Route} className="inline-flex min-h-11 items-center break-words text-tabla font-semibold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">{lado.nombre}</Link>
                  <span className="text-nota tabular-nums text-[var(--texto-suave)]">
                    {lado.fila ? `${lado.fila.posicion}.º · ${lado.fila.puntos} puntos en ${lado.fila.jugados} partidos` : 'Sin partidos jugados en el grupo'}
                  </span>
                </span>
                <InsigniasRacha signos={lado.forma} />
              </li>
            ))}
          </ul>
          {jornadaDeLaTabla !== null && (
            <p className="m-0 mt-2 text-nota text-[var(--texto-suave)]">Resultados hasta la jornada {jornadaDeLaTabla}.</p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {plantillas.map((plantilla) => (
          <section key={plantilla.nombre} className={`${TARJETA} min-w-0 overflow-hidden`}>
            <header className="px-4 py-3">
              <h2 className="m-0 break-words text-bloque font-bold text-[var(--texto)]">Jugadores · {plantilla.nombre}</h2>
              <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
                {plantilla.jugadores.length === 0
                  ? 'Sin datos publicados.'
                  : 'Plantilla conocida por las actas, de más a menos minutos. No es la alineación.'}
              </p>
            </header>
            {plantilla.jugadores.length > 0 && (
              <ul className="m-0 list-none p-0">
                {plantilla.jugadores.map((j) => (
                  <li key={j.nombre} className="flex items-center justify-between gap-3 border-t border-[var(--fondo-sutil)] px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2"><FotoJugador personaId={j.persona_id} nombre={j.nombre} permitida={conFotos} /><span className="min-w-0 break-words text-tabla text-[var(--texto)]">{j.nombre}</span></span>
                    <span className="flex-none text-nota tabular-nums text-[var(--texto-suave)]">
                      {j.minutos == null ? 'minutos sin publicar' : `${j.minutos} min`}
                      {j.goles > 0 ? ` · ${j.goles} ${j.goles === 1 ? 'gol' : 'goles'}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section aria-labelledby="enfrentamientos" className={`${TARJETA} overflow-hidden`}>
        <h2 id="enfrentamientos" className="m-0 px-4 py-3 text-bloque font-bold text-[var(--texto)]">Últimos enfrentamientos</h2>
        {enfrentamientos.length === 0
          ? <p className="m-0 border-t border-[var(--fondo-sutil)] px-4 py-3 text-tabla text-[var(--texto-suave)]">Sin enfrentamientos anteriores publicados.</p>
          : (
            <ul className="m-0 list-none p-0">
              {enfrentamientos.map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-[var(--fondo-sutil)] px-4 py-2">
                  <span className="text-nota tabular-nums text-[var(--texto-suave)]">{fechaLarga(h.fecha) ?? 'Sin fecha publicada'}</span>
                  <span className="flex items-baseline justify-between gap-3 text-tabla font-semibold text-[var(--texto)]">
                    <span className="min-w-0 break-words">{h.local} <span className="font-normal text-[var(--texto-suave)]">–</span> {h.visitante}</span>
                    <span className="flex-none tabular-nums">{h.gl}-{h.gv}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {evolucionLocal.length > 1 || evolucionVisitante.length > 1
        ? (
          <PosicionPorJornada titulo="Posición y puntos por jornada" series={[
            { nombre: f.local, filas: evolucionLocal },
            { nombre: f.visitante, filas: evolucionVisitante },
          ]} />
        )
        : (
          <section aria-labelledby="puntos-jornada" className={`${TARJETA} px-4 py-3`}>
            <h2 id="puntos-jornada" className="m-0 text-bloque font-bold text-[var(--texto)]">Puntos por jornada</h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <GraficaPuntos datos={puntosLocal} nombre={f.local} />
              <GraficaPuntos datos={puntosVisitante} nombre={f.visitante} />
            </div>
          </section>
        )}
    </div>
  );
}
