import Link from 'next/link';
import type { Route } from 'next';
import type { FilaPartidoCanonico } from '@/consultas/partidos';
import { Escudo } from '@/componentes/Escudo';
import { nombresDelPartido } from '@/lib/nombres-equipo';
import {
  estadoDeJornada, rangoDeFechas, type JornadaConPartidos, type PartidoDeJornada,
} from '@/lib/jornadas';
import { marcadorDePartido } from '@/lib/pantalla-competicion';

/**
 * Listado de jornadas: una tabla por jornada con los resultados, los escudos, el árbitro y el acta.
 *
 * Es la pestaña «Jornadas» de la pantalla de competición. En pantallas anchas caben cuatro tablas por
 * fila; en medianas dos y en móvil una, con el documento desplazándose en vertical (nada de desplazar
 * toda la página en horizontal). Cada tabla lleva su cabecera con la jornada, las fechas publicadas y
 * su estado (jugada, parcial o programada).
 *
 * Reglas que respeta:
 *  · un partido sin marcador se pinta «—», nunca 0-0; sin hora no se inventa una;
 *  · el nombre corto guardado en el canónico manda; si no está, se aplica `nombreCorto()` y, si el
 *    nombre es dudoso, se queda el completo (no se inventa);
 *  · el enlace al acta sólo se pinta si el partido tiene acta publicada y la página pasa `hrefActa`;
 *  · el árbitro se enseña cuando la federación lo publicó; sin él no hay hueco vacío ni «Sin árbitro».
 *
 * La tabla se reordena en móvil con CSS: los dos equipos quedan uno debajo del otro y el marcador a la
 * derecha, para que un nombre largo no ocupe cuatro líneas. En pantallas mayores se lee como una tabla
 * de local-marcador-visitante.
 */
export function ListadoJornadas({ jornadas, hrefJornada, hrefActa }: {
  jornadas: readonly JornadaConPartidos[];
  hrefJornada: (numero: number) => string;
  /** Sólo devuelve ruta para partidos con acta publicada; el componente no inventa enlaces. */
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
}) {
  return (
    <section aria-labelledby="jornadas" className="flex flex-col gap-3">
      <h2 id="jornadas" className="m-0 text-bloque font-bold text-[var(--texto)]">Jornadas</h2>
      {jornadas.length === 0
        ? (
          <p className="m-0 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-3.5 text-tabla text-[var(--texto-suave)]">
            Sin jornadas publicadas.
          </p>
        )
        : (
          <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
            {jornadas.map((jornada) => (
              <JornadaEnTabla key={jornada.numero} jornada={jornada}
                hrefJornada={hrefJornada(jornada.numero)} hrefActa={hrefActa} />
            ))}
          </div>
        )}
    </section>
  );
}

/** Una jornada como tabla. La cabecera y el estado se leen antes de recorrer los partidos. */
function JornadaEnTabla({ jornada, hrefJornada, hrefActa }: {
  jornada: JornadaConPartidos;
  hrefJornada: string;
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
}) {
  const estado = estadoDeJornada(jornada);
  const rango = rangoDeFechas(jornada.desde, jornada.hasta);
  const idCabecera = `jornada-${jornada.numero}`;
  return (
    <section aria-labelledby={idCabecera} data-jornada={jornada.numero}
      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
      <header className="border-b border-[var(--fondo-sutil)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 id={idCabecera} className="m-0 text-cuerpo font-bold text-[var(--texto)]">
            <Link href={hrefJornada as Route} className="hover:underline">
              Jornada {jornada.numero}
            </Link>
          </h3>
          <span className="mt-0.5 flex-none rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-etiqueta text-[var(--texto-suave)]">
            {estado.etiqueta}
          </span>
        </div>
        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
          {rango ?? 'Sin fecha publicada'}
          <span className="sr-only">
            {jornada.partidos > 0 ? ` · ${jornada.jugados} de ${jornada.partidos} partidos jugados` : ''}
          </span>
        </p>
      </header>
      <table className="w-full table-fixed border-collapse text-nota max-sm:text-tabla">
        <caption className="sr-only">Resultados de la jornada {jornada.numero}</caption>
        <colgroup>
          <col style={{ width: '58%' }} />
          <col style={{ width: '42%' }} />
        </colgroup>
        <tbody>
          {jornada.lista.map((partido) => (
            <FilaDePartido key={partido.match_id} partido={partido} hrefActa={hrefActa} />
          ))}
        </tbody>
      </table>
      <div className="mt-auto border-t border-[var(--fondo-sutil)] px-3 py-1.5 text-right">
        <Link href={hrefJornada as Route}
          className="text-nota font-semibold text-[var(--accion)] hover:underline">
          Ver jornada<span className="sr-only"> {jornada.numero}</span>
        </Link>
      </div>
    </section>
  );
}

/**
 * Una fila de resultado: los dos equipos apilados en la columna izquierda y, a la derecha, el
 * marcador, el campo y el árbitro. Así ningún nombre necesita cuatro líneas y el resultado se lee
 * sin recorrer la fila entera.
 */
function FilaDePartido({ partido, hrefActa }: {
  partido: PartidoDeJornada;
  hrefActa?: (partido: FilaPartidoCanonico) => string | null;
}) {
  const nombres = nombresDelPartido(partido);
  const marcador = marcadorDePartido({
    goles_local: partido.goles_local,
    goles_visitante: partido.goles_visitante,
    hora: null,
  });
  const ganaLocal = marcador.jugado && (partido.goles_local ?? 0) > (partido.goles_visitante ?? 0);
  const ganaVisitante = marcador.jugado && (partido.goles_visitante ?? 0) > (partido.goles_local ?? 0);
  const campo = (partido.campo ?? '').trim();
  const arbitro = (partido.arbitro ?? '').trim();
  const acta = partido.calidad_acta !== null && hrefActa ? hrefActa(partido) : null;
  const enlaceEquipo = (id: number) => `/explorar/equipo/${id}` as Route;
  return (
    <tr className="border-t border-[var(--fondo-sutil)] align-top">
      <td className="min-w-0 py-2 pl-2.5 pr-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={enlaceEquipo(partido.local_id)} title={nombres.completo_local}
            className="flex min-w-0 items-center gap-1.5">
            <Escudo equipoId={partido.local_id} nombre={partido.local}
              clubId={partido.local_club_id} tieneEscudo={partido.local_tiene_escudo} />
            <span className={`min-w-0 truncate leading-tight text-[var(--texto)] ${ganaLocal ? 'font-bold' : 'font-medium'}`}>
              {nombres.local}
            </span>
          </Link>
          <Link href={enlaceEquipo(partido.visitante_id)} title={nombres.completo_visitante}
            className="flex min-w-0 items-center gap-1.5">
            <Escudo equipoId={partido.visitante_id} nombre={partido.visitante}
              clubId={partido.visitante_club_id} tieneEscudo={partido.visitante_tiene_escudo} />
            <span className={`min-w-0 truncate leading-tight text-[var(--texto)] ${ganaVisitante ? 'font-bold' : 'font-medium'}`}>
              {nombres.visitante}
            </span>
          </Link>
        </div>
      </td>
      <td className="min-w-0 border-l border-[var(--fondo-sutil)] py-2 pl-2.5 pr-2.5 text-right">
        <div className="flex min-w-0 flex-col items-end gap-1">
          <span title={marcador.accesible}
            className={marcador.jugado
              ? 'whitespace-nowrap tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-fuerte)] px-1.5 py-0.5 text-tabla font-bold text-[var(--texto-fuerte)]'
              : 'whitespace-nowrap tabular-nums rounded-[var(--radius-md)] bg-[var(--fondo-sutil)] px-1.5 py-0.5 text-tabla font-semibold text-[var(--texto-suave)]'}>
            {marcador.texto}
            <span className="sr-only">, {marcador.accesible}</span>
          </span>
          {campo !== '' && (
            <span className="flex max-w-full items-baseline justify-end gap-1 text-etiqueta leading-tight text-[var(--texto-suave)]"
              title={`Campo: ${campo}`}>
              <span className="flex-none text-etiqueta">Campo</span>
              <span className="min-w-0 truncate text-[var(--texto)]">{campo}</span>
            </span>
          )}
          {arbitro !== '' && (
            <span className="flex max-w-full items-baseline justify-end gap-1 text-etiqueta leading-tight text-[var(--texto-suave)]"
              title={`Árbitro: ${arbitro}`}>
              <span className="flex-none text-etiqueta" aria-hidden="true">Árbitro</span>
              <span className="sr-only">Árbitro: </span>
              <span className="min-w-0 truncate text-[var(--texto)]">{arbitro}</span>
            </span>
          )}
          {acta !== null && (
            <Link href={acta as Route} className="text-etiqueta font-semibold text-[var(--accion)] hover:underline">
              Acta
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Esqueleto del listado: la misma rejilla de tarjetas que el contenido, sin spinner (SISTEMA-DISENO §5). */
export function EsqueletoJornadas({ filas = 4 }: { filas?: number }) {
  const bloque = 'rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]';
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Cargando las jornadas…</span>
      <div className="h-5 w-28 rounded-[var(--radius-sm)] bg-[var(--fondo-sutil)]" />
      <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: Math.max(1, filas) }, (_, i) => (
          <div key={i} data-esqueleto="jornada"
            className="flex min-h-40 flex-col gap-2 overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-3">
            <div className={`h-4 w-20 ${bloque}`} />
            <div className={`h-3 w-16 ${bloque}`} />
            {Array.from({ length: 4 }, (_, j) => <div key={j} className={`h-4 w-full ${bloque}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
