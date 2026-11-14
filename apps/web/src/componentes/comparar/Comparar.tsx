import Link from 'next/link';
import type { Route } from 'next';
import type { FilaBusqueda } from '@/consultas/entidades';
import type { FilaPersonaComparada } from '@/consultas/comparar';
import { inicialesDeNombre } from '@/lib/fichas';
import {
  celdaDeTemporada, ladoDestacado, nombreDeJugador, type CeldaDeTemporada, type LadoComparado,
  type MetricaComparada, type TemporadaComparada,
} from '@/lib/comparar';

/**
 * Piezas del comparador de jugadores, contra `prototipo/Comparar.dc.html`.
 *
 * Dos tarjetas (A y B), las métricas con barras espejo y la rejilla de trayectorias. Reglas que cumplen:
 *  · un dato ausente se dice «sin datos» en ese lado y la barra contraria no se compara contra un cero;
 *  · el lado que va mejor se destaca con opacidad y peso de texto, no sólo con color, y cada métrica lleva
 *    su resumen en `aria-label`;
 *  · la rejilla visual es decorativa (`aria-hidden`): la misma información va en una tabla accesible
 *    dentro de un desplegable, para que un lector de pantalla no recorra casillas de color.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const ETIQUETA = 'text-etiqueta font-semibold text-[var(--texto-suave)]';

/** Dos colores de serie sin literales: el acento del producto y una mezcla más oscura del mismo tono. */
export const COLOR_A = 'var(--accion)';
export const COLOR_B = 'var(--serie-b)';

const formato = (valor: number | null, tipo: MetricaComparada['formato']): string => {
  if (valor === null) return 'sin datos';
  if (tipo === 'porcentaje') return `${valor} %`;
  return new Intl.NumberFormat('es-ES').format(valor);
};

export function FormularioComparar({ a, b }: { a: string; b: string }) {
  return (
    <section aria-labelledby="elegir" className={`${TARJETA} flex flex-col gap-3 p-4`}>
      <h2 id="elegir" className="m-0 text-bloque font-bold text-[var(--texto)]">Elige dos jugadores</h2>
      <p className="m-0 text-tabla text-[var(--texto-suave)]">
        Escribe un nombre o pega el identificador de su ficha. Se puede comparar a cualquier jugador del archivo.
      </p>
      <form method="get" action="/explorar/comparar" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className={ETIQUETA}>Jugador A</span>
          <input type="text" name="a" defaultValue={a} placeholder="Nombre o id" autoComplete="off"
            className="h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className={ETIQUETA}>Jugador B</span>
          <input type="text" name="b" defaultValue={b} placeholder="Nombre o id" autoComplete="off"
            className="h-11 min-w-0 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]" />
        </label>
        <button type="submit"
          className="h-11 rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-cuerpo font-semibold text-[var(--texto-inverso)]">
          Comparar
        </button>
      </form>
    </section>
  );
}

export function ListaDeCandidatos({ lado, texto, candidatos, otro }: {
  lado: 'a' | 'b';
  texto: string;
  candidatos: readonly FilaBusqueda[];
  /** Valor del otro lado para no perderlo al elegir. */
  otro: string;
}) {
  const enlace = (id: number) => {
    const parametros = new URLSearchParams();
    const valorA = lado === 'a' ? String(id) : otro;
    const valorB = lado === 'b' ? String(id) : otro;
    if (valorA) parametros.set('a', valorA);
    if (valorB) parametros.set('b', valorB);
    return `/explorar/comparar?${parametros.toString()}`;
  };
  return (
    <section aria-labelledby={`candidatos-${lado}`} className={`${TARJETA} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <h2 id={`candidatos-${lado}`} className="m-0 text-bloque font-bold text-[var(--texto)]">
          Elige al jugador {lado.toUpperCase()}
        </h2>
        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
          {candidatos.length === 0
            ? `No hay ningún jugador que coincida con «${texto}». Prueba con el apellido o con el identificador de la ficha.`
            : `${candidatos.length} jugador${candidatos.length === 1 ? '' : 'es'} para «${texto}». No se elige solo: un nombre igual no une a dos personas.`}
        </p>
      </div>
      {candidatos.length > 0 && (
        <ul className="m-0 list-none p-0">
          {candidatos.map((candidato) => (
            <li key={candidato.entidad_id} className="border-t border-[var(--fondo-sutil)]">
              <Link href={enlace(candidato.entidad_id) as Route}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-[var(--fondo-sutil)]">
                <span className="font-semibold text-[var(--texto)]">{candidato.nombre}</span>
                <span className="text-nota text-[var(--texto-suave)]">
                  {[candidato.federacion_nombre, candidato.contexto].filter(Boolean).join(' · ') || 'Sin contexto'}
                </span>
                {candidato.identidad_nominal && (
                  <span className="rounded-full border border-[var(--borde)] px-2 py-0.5 text-etiqueta font-semibold text-[var(--texto-suave)]">
                    identidad nominal
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TarjetaDeJugador({ lado, datos, otroId }: { lado: 'a' | 'b'; datos: LadoComparado; otroId: number }) {
  const { persona, contexto } = datos;
  const enlaceCambiar = lado === 'a' ? `/explorar/comparar?b=${otroId}` : `/explorar/comparar?a=${otroId}`;
  return (
    <article className={`${TARJETA} flex min-w-0 flex-col gap-1 p-4`}
      style={{ borderTop: `4px solid ${lado === 'a' ? COLOR_A : COLOR_B}` }}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true"
          className="flex size-[52px] flex-none items-center justify-center rounded-full text-bloque font-extrabold"
          style={{ background: lado === 'a' ? COLOR_A : COLOR_B,
            color: lado === 'a' ? 'var(--texto-inverso)' : 'var(--serie-b-texto)' }}>
          {inicialesDeNombre(nombreDeJugador(persona))}
        </span>
        <div className="flex min-w-0 flex-col">
          <Link href={`/explorar/jugador/${persona.persona_id}` as Route}
            className="break-words text-bloque font-extrabold text-[var(--texto)] hover:text-[var(--accion)] hover:underline">
            {nombreDeJugador(persona)}
          </Link>
          <span className="text-nota text-[var(--texto-suave)]">
            {contexto.equipoActual ? `${contexto.equipoActual.nombre} · ${contexto.equipoActual.edicion}` : 'Sin equipo en la temporada en curso'}
          </span>
          <span className="text-nota text-[var(--texto-suave)]">
            {contexto.federaciones.join(' · ') || 'Sin federación conocida'}
          </span>
        </div>
      </div>
      {persona.identidad_nominal && (
        <p className="m-0 mt-1 text-nota leading-5 text-[var(--texto-suave)]">
          Identidad nominal: sus temporadas se unen por nombre y equipo, no por código federativo.
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-nota">
        <Link href={`/explorar/jugador/${persona.persona_id}` as Route} className="font-semibold text-[var(--accion)] hover:underline">Ficha</Link>
        <Link href={`/explorar/jugador/${persona.persona_id}/historial` as Route} className="font-semibold text-[var(--accion)] hover:underline">Historial</Link>
        <Link href={enlaceCambiar as Route} className="text-[var(--texto-suave)] hover:underline">Cambiar</Link>
      </div>
    </article>
  );
}

export function FichasDeJugadores({ a, b }: { a: LadoComparado; b: LadoComparado }) {
  return (
    <section aria-label="Jugadores comparados" className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <TarjetaDeJugador lado="a" datos={a} otroId={b.persona.persona_id} />
      <span aria-hidden="true" className="flex items-center justify-center text-bloque font-extrabold text-[var(--texto-suave)]">VS</span>
      <TarjetaDeJugador lado="b" datos={b} otroId={a.persona.persona_id} />
    </section>
  );
}

export function MetricasComparadas({ a, b, metricas }: {
  a: LadoComparado;
  b: LadoComparado;
  metricas: readonly MetricaComparada[];
}) {
  return (
    <section aria-labelledby="metricas" className={`${TARJETA} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="metricas" className="m-0 text-bloque font-bold text-[var(--texto)]">Carrera completa</h2>
        <span className="text-nota text-[var(--texto-suave)]">
          {nombreDeJugador(a.persona)} frente a {nombreDeJugador(b.persona)}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {metricas.map((metrica) => {
          const destacado = ladoDestacado(metrica);
          const maximo = Math.max(metrica.a ?? 0, metrica.b ?? 0, 1);
          const anchoA = metrica.a === null || metrica.a === 0 ? 0 : Math.max(2, Math.round(((metrica.a) / maximo) * 100));
          const anchoB = metrica.b === null || metrica.b === 0 ? 0 : Math.max(2, Math.round(((metrica.b) / maximo) * 100));
          return (
            <div key={metrica.clave} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2.5"
                role="group"
                aria-label={`${metrica.etiqueta}: ${nombreDeJugador(a.persona)} ${formato(metrica.a, metrica.formato)}, ${nombreDeJugador(b.persona)} ${formato(metrica.b, metrica.formato)}`}>
                <span className={`text-right text-cuerpo tabular-nums ${destacado === 'a' ? 'font-extrabold text-[var(--texto)]' : 'font-semibold text-[var(--texto-suave)]'}`}>
                  {formato(metrica.a, metrica.formato)}
                </span>
                <span className="text-center text-nota text-[var(--texto-suave)]">{metrica.etiqueta}</span>
                <span className={`text-left text-cuerpo tabular-nums ${destacado === 'b' ? 'font-extrabold text-[var(--texto)]' : 'font-semibold text-[var(--texto-suave)]'}`}>
                  {formato(metrica.b, metrica.formato)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <span className="flex h-2.5 justify-end overflow-hidden rounded-l-[5px] bg-[var(--fondo-sutil)]" aria-hidden="true">
                  <span className="block h-full rounded-l-[5px]" style={{ width: `${anchoA}%`, background: COLOR_A, opacity: destacado === 'b' ? 0.45 : 1 }} />
                </span>
                <span className="flex h-2.5 overflow-hidden rounded-r-[5px] bg-[var(--fondo-sutil)]" aria-hidden="true">
                  <span className="block h-full rounded-r-[5px]" style={{ width: `${anchoB}%`, background: COLOR_B, opacity: destacado === 'a' ? 0.45 : 1 }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-4 text-nota leading-5 text-[var(--texto-suave)]">
        Las cifras salen de las actas de cada temporada; donde la fuente no publica un dato, ese lado dice
        «sin datos» y no se compara contra un cero. «Minutos por gol» sólo aparece con goles y minutos exactos.
      </p>
    </section>
  );
}

function Celdas({ celdas, lado, temporadas }: {
  celdas: readonly (CeldaDeTemporada | null)[];
  lado: 'a' | 'b';
  temporadas: readonly TemporadaComparada[];
}) {
  return (
    <>
      {celdas.map((celda, i) => (
        <span key={`${lado}-${temporadas[i]?.temporada ?? i}`}
          className="flex h-9 min-w-0 flex-col items-center justify-center overflow-hidden rounded-[var(--radius-md)] px-1 text-etiqueta font-bold leading-tight"
          style={celda === null
            ? { background: 'var(--fondo-sutil)', color: 'var(--texto-suave)' }
            : { background: lado === 'a' ? COLOR_A : COLOR_B,
              color: lado === 'a' ? 'var(--texto-inverso)' : 'var(--serie-b-texto)' }}
          title={celda === null ? 'Sin equipo esa temporada' : `${celda.etiqueta} · ${celda.detalle} · ${celda.partidos} PJ`}>
          {celda === null ? '—' : (
            <>
              <span>{celda.abreviatura}</span>
              <span className="max-w-full truncate font-semibold opacity-90">{celda.etiqueta}</span>
            </>
          )}
        </span>
      ))}
    </>
  );
}

export function TrayectoriasComparadas({ temporadas, a, b }: {
  temporadas: readonly TemporadaComparada[];
  a: LadoComparado;
  b: LadoComparado;
}) {
  const celdasA = temporadas.map((t) => celdaDeTemporada(a.trayectoria, t.temporada));
  const celdasB = temporadas.map((t) => celdaDeTemporada(b.trayectoria, t.temporada));
  return (
    <section aria-labelledby="trayectorias" className={`${TARJETA} overflow-hidden`}>
      <div className="px-4 py-3.5">
        <h2 id="trayectorias" className="m-0 text-bloque font-bold text-[var(--texto)]">Trayectorias</h2>
        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">Una columna por temporada; el hueco es una temporada sin equipo en el archivo.</p>
      </div>
      <div data-tabla-scroll tabIndex={0} role="region"
        aria-label="Trayectorias comparadas: desplázate en horizontal para ver todas las temporadas"
        className="relative overflow-x-auto px-4 pb-4 focus-visible:[outline-offset:-2px]">
        <div aria-hidden="true" className="grid min-w-[620px] gap-1"
          style={{ gridTemplateColumns: `110px repeat(${Math.max(1, temporadas.length)}, minmax(0, 1fr))` }}>
          <span />
          {temporadas.map((t) => (
            <span key={t.temporada} className="text-center text-etiqueta font-semibold text-[var(--texto-suave)]">{t.temporada}</span>
          ))}
          <span className="truncate text-nota font-bold text-[var(--texto)]">{nombreDeJugador(a.persona)}</span>
          <Celdas celdas={celdasA} lado="a" temporadas={temporadas} />
          <span className="truncate text-nota font-bold text-[var(--texto)]">{nombreDeJugador(b.persona)}</span>
          <Celdas celdas={celdasB} lado="b" temporadas={temporadas} />
        </div>
      </div>
      <details className="border-t border-[var(--fondo-sutil)] px-4 py-3">
        <summary className="cursor-pointer text-nota font-semibold text-[var(--accion)]">Ver la trayectoria en tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-tabla" style={{ minWidth: 520 }}>
            <caption className="sr-only">Temporadas de los dos jugadores, con equipo, club y federación.</caption>
            <thead>
              <tr className="text-left text-etiqueta text-[var(--texto-suave)]">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Jugador</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Temporada</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Equipo</th>
                <th scope="col" className="py-1.5 font-semibold">Club y federación</th>
              </tr>
            </thead>
            <tbody>
              {[a, b].flatMap((lado) => temporadas.map((t) => {
                const celda = celdaDeTemporada(lado.trayectoria, t.temporada);
                return (
                  <tr key={`${lado.persona.persona_id}-${t.temporada}`} className="border-t border-[var(--fondo-sutil)]">
                    <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-[var(--texto)]">{nombreDeJugador(lado.persona)}</th>
                    <td className="py-1.5 pr-3 text-[var(--texto-suave)]">{t.temporada}</td>
                    <td className="py-1.5 pr-3 text-[var(--texto)]">{celda?.etiqueta ?? 'Sin equipo'}</td>
                    <td className="py-1.5 text-[var(--texto-suave)]">{celda?.detalle ?? '—'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function EstadoDelComparador({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="estado-comparador" className={`${TARJETA} p-4`}>
      <h2 id="estado-comparador" className="m-0 text-bloque font-bold text-[var(--texto)]">{titulo}</h2>
      <div className="mt-2 text-tabla leading-6 text-[var(--texto-suave)]">{children}</div>
    </section>
  );
}

/** Un jugador ya resuelto por la página, para no repetir el tipo en el componente. */
export type JugadorDelComparador = FilaPersonaComparada;
