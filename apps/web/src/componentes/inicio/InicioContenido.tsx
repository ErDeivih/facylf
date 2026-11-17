import Link from 'next/link';
import { formateaPorcentaje } from '@/lib/prediccion';
import type { Route } from 'next';
import type { FilaAcceso } from '@/consultas/usuario';
import { rutaDeAcceso } from '@/lib/cuentas';
import { diaCorto, linea1X2, type CompeticionConProximos } from '@/lib/proximas';
import { etiquetaCategoria } from '@/lib/vocabulario-pantalla';
import { normalizaProvincia } from '@/lib/provincias-cyl';
import {
  etiquetaDeAcceso, FEDERACION_DE_LA_PORTADA, rutaDeCompeticion, temporadaDeLaPortada,
  textoDeCobertura, textoSiguiente, urlDelSelector, type CompeticionDePortada,
} from '@/lib/inicio';

/**
 * La portada: accesos, últimos resultados, competiciones de Castilla y León y los equipos que sigue la
 * cuenta.
 *
 * Es una pieza de presentación pura: recibe las competiciones y los favoritos ya resueltos por la
 * página, de modo que las pruebas puedan enseñar el estado con sesión, sin sesión y con error sin
 * tocar la base. No hay textos de cómo se calcula nada (§8 de la doctrina).
 *
 * Si no hay sesión, NO se pintan equipos de ejemplo: se dice que hay que entrar. Si la cuenta no
 * sigue nada, se dice que todavía no sigue nada. La portada nunca rellena esos huecos con datos
 * inventados.
 */
export type SesionDeLaPortada = { nombre: string | null } | null;

/** Categorías con acceso directo desde la portada, en el orden de edad. */
const CATEGORIAS_DE_PORTADA = ['aficionados', 'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin'] as const;

/** Provincias de Castilla y León para buscar por territorio. */
const PROVINCIAS_DE_PORTADA = ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'] as const;

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const BOTON_PRIMARIO = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)] hover:opacity-90';
const BOTON_SECUNDARIO = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]';

/** `2026-11-08` → «8 nov». Si no es una fecha, se deja como llega. */
function fechaDePortada(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/** Un partido del bloque «Últimos resultados» de la portada. */
export type PartidoDeEjemplo = {
  partidoId: number;
  grupoId: number;
  jornadaNumero: number | null;
  fechaTexto: string;
  jornada: number | null;
  edicion: string;
  local: string;
  visitante: string;
  golesLocal: number;
  golesVisitante: number;
  /** Predicción 1-X-2 (opcional: una fila antigua sin predicción no rompe la portada). */
  predLocal?: number | null;
  predEmpate?: number | null;
  predVisitante?: number | null;
  predMarcador?: string | null;
};

export function InicioContenido({ competiciones, proximos = [], jornada = [], sesion, accesos, errorAccesos = false }: {
  competiciones: readonly CompeticionDePortada[];
  /** Próximos partidos por competición (como mucho tres competiciones). Vacío si no hay calendario. */
  proximos?: readonly CompeticionConProximos[];
  jornada?: readonly PartidoDeEjemplo[];
  sesion: SesionDeLaPortada;
  accesos: readonly FilaAcceso[];
  errorAccesos?: boolean;
}) {
  const temporada = temporadaDeLaPortada(competiciones);
  const seguidos = accesos.slice(0, 3);
  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            Fútbol de Castilla y León
          </h1>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Resultados, clasificaciones y pronósticos, de Tercera Federación al fútbol base.
          </p>
        </div>
        <nav aria-label="Accesos" className="flex flex-wrap gap-2">
          <Link href={'/explorar/proximas' as Route} className={BOTON_PRIMARIO}>Próximos partidos</Link>
          <Link href={urlDelSelector(FEDERACION_DE_LA_PORTADA, temporada) as Route} className={BOTON_SECUNDARIO}>Competiciones</Link>
          <Link href={'/explorar/rankings' as Route} className={BOTON_SECUNDARIO}>Goleadores</Link>
        </nav>
      </header>

      {proximos.length > 0 && (
        <section aria-labelledby="proximos-portada" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="proximos-portada" className="m-0 text-bloque font-bold text-[var(--texto)]">Próximos partidos</h2>
            <Link href={'/explorar/proximas' as Route}
              className="inline-flex min-h-11 items-center text-tabla font-semibold text-[var(--accion)] hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {proximos.map((competicion) => (
              <section key={competicion.edicionId} className={`${TARJETA} overflow-hidden`}>
                <h3 className="m-0 break-words px-4 py-3 text-tabla font-bold text-[var(--texto)]">{competicion.edicion}</h3>
                <ul className="m-0 list-none p-0">
                  {competicion.fechas.flatMap((dia) => dia.partidos).slice(0, 3).map((p) => {
                    const prediccion = linea1X2(p);
                    return (
                      <li key={p.match_id ?? `c-${p.grupo_id}-${p.jornada}-${p.orden}`} className="border-t border-[var(--fondo-sutil)]">
                        <Link href={(p.match_id !== null ? `/explorar/previa/${p.match_id}` : `/explorar/competicion/${p.grupo_id}`) as Route}
                          className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 hover:bg-[var(--fondo-sutil)]">
                          <span className="text-nota tabular-nums text-[var(--texto-suave)]">{diaCorto(p.fecha)} · Jornada {p.jornada}</span>
                          <span className="break-words text-tabla font-semibold text-[var(--texto)]">
                            {p.local} <span className="font-normal text-[var(--texto-suave)]">–</span> {p.visitante}
                          </span>
                          {prediccion && <span className="text-nota tabular-nums text-[var(--texto-suave)]">{prediccion}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}

      {jornada.length > 0 && (
        <section aria-labelledby="ultimos-resultados" className="flex flex-col gap-3">
          <h2 id="ultimos-resultados" className="m-0 text-bloque font-bold text-[var(--texto)]">Últimos resultados</h2>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {jornada.map((partido) => (
              <li key={partido.partidoId}>
                <Link href={(partido.jornadaNumero !== null
                  ? `/explorar/competicion/${partido.grupoId}/jornada/${partido.jornadaNumero}`
                  : `/explorar/competicion/${partido.grupoId}`) as Route}
                  className={`${TARJETA} flex h-full min-h-11 flex-col gap-1 px-4 py-3 hover:border-[var(--borde-fuerte)]`}>
                  <span className="text-nota text-[var(--texto-suave)]">
                    {partido.edicion}{partido.jornada !== null ? ` · Jornada ${partido.jornada}` : ''}{partido.fechaTexto ? ` · ${fechaDePortada(partido.fechaTexto)}` : ''}
                  </span>
                  <span className="flex items-center justify-between gap-3 text-tabla font-semibold text-[var(--texto)]">
                    <span className="min-w-0 break-words">{partido.local}</span>
                    <span className="flex-none tabular-nums">{partido.golesLocal}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3 text-tabla font-semibold text-[var(--texto)]">
                    <span className="min-w-0 break-words">{partido.visitante}</span>
                    <span className="flex-none tabular-nums">{partido.golesVisitante}</span>
                  </span>
                  {partido.predLocal != null && partido.predEmpate != null && partido.predVisitante != null && (
                    <span className="text-nota tabular-nums text-[var(--texto-suave)]">
                      Pronóstico previo: 1 {formateaPorcentaje(partido.predLocal)} · X {formateaPorcentaje(partido.predEmpate)} · 2 {formateaPorcentaje(partido.predVisitante)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="explorar-competicion" className={`${TARJETA} px-4 py-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="explorar-competicion" className="m-0 text-bloque font-bold text-[var(--texto)]">Competiciones</h2>
            <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
              Castilla y León{temporada !== null ? ` · ${temporada}` : ''}
            </p>
          </div>
          <Link href={urlDelSelector(FEDERACION_DE_LA_PORTADA, temporada) as Route}
            className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver todas
          </Link>
        </div>
        <nav aria-label="Categorías" className="mt-3 flex flex-wrap gap-2">
          {CATEGORIAS_DE_PORTADA.map((categoria) => (
            <Link key={categoria}
              href={`/explorar/competiciones/categoria/${categoria}` as Route}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:border-[var(--accion)]">
              {etiquetaCategoria(categoria)}
            </Link>
          ))}
        </nav>
        <details className="mt-3 rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-3 py-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-tabla font-semibold text-[var(--texto)]">Orden de categorías</summary>
          <div className="grid gap-2 pb-2 text-nota leading-5 text-[var(--texto-suave)] sm:grid-cols-2">
            <p className="m-0"><b className="text-[var(--texto)]">Aficionados:</b> Tercera Federación → Regional → Provincial Primera → Segunda → Tercera.</p>
            <p className="m-0"><b className="text-[var(--texto)]">Juvenil:</b> Liga Nacional → Regional A/B → Provincial Primera → Segunda → Tercera.</p>
            <p className="m-0"><b className="text-[var(--texto)]">Cadete e infantil:</b> Primera Regional → Segunda Regional → Provinciales.</p>
            <p className="m-0">Las copas y fases de ascenso van aparte de la liga regular.</p>
          </div>
        </details>
        <nav aria-label="Provincias" className="mt-3 flex flex-wrap gap-2">
          {PROVINCIAS_DE_PORTADA.map((provincia) => (
            <Link key={provincia}
              href={`/explorar/competiciones/provincia/${encodeURIComponent(normalizaProvincia(provincia))}` as Route}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 text-tabla font-medium text-[var(--texto-suave)] hover:border-[var(--accion)] hover:text-[var(--accion)]">
              {provincia}
            </Link>
          ))}
        </nav>
        {competiciones.length === 0
          ? (
            <p className="m-0 mt-3 text-tabla text-[var(--texto-suave)]">
              Todavía no hay competiciones publicadas de Castilla y León.
            </p>
          )
          : (
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {competiciones.map((competicion) => (
                <li key={competicion.grupoId}>
                  <Link href={rutaDeCompeticion(competicion.grupoId) as Route}
                    className="flex h-full min-h-11 flex-col gap-0.5 rounded-[var(--radius-lg)] border border-[var(--borde)] bg-[var(--fondo-sutil)] px-3 py-2.5 hover:border-[var(--borde-fuerte)] focus-visible:[outline-offset:2px]">
                    <span className="text-tabla font-semibold text-[var(--texto)]">{competicion.edicion}</span>
                    <span className="text-nota text-[var(--texto-suave)]">
                      {competicion.grupo} · {textoDeCobertura(competicion)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      <TusEquipos sesion={sesion} accesos={seguidos} errorAccesos={errorAccesos} hayMas={accesos.length > 3} />
    </div>
  );
}

/** El bloque de favoritos: con sesión enseña lo que sigue; sin sesión, no inventa equipos. */
function TusEquipos({ sesion, accesos, errorAccesos, hayMas }: {
  sesion: SesionDeLaPortada;
  accesos: readonly FilaAcceso[];
  errorAccesos: boolean;
  hayMas: boolean;
}) {
  return (
    <section aria-labelledby="tus-equipos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tus-equipos" className="m-0 text-bloque font-bold text-[var(--texto)]">Tus equipos</h2>
        {sesion !== null && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href={'/mi-cuenta' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
              Mi cuenta
            </Link>
            <Link href={'/mi-panel' as Route} className="text-tabla font-semibold text-[var(--accion)] hover:underline">
              Mi panel
            </Link>
          </div>
        )}
      </div>

      {sesion === null
        ? (
          <div className={`${TARJETA} flex flex-wrap items-center justify-between gap-3 px-4 py-4`}>
            <div className="min-w-0">
              <p className="m-0 text-bloque font-semibold text-[var(--texto)]">Sigue a tus equipos</p>
              <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
                Entra en tu cuenta para ver sus horarios y resultados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={'/entrar?volver=/' as Route} className={BOTON_PRIMARIO}>Entrar</Link>
              <Link href={'/crear-cuenta' as Route} className={BOTON_SECUNDARIO}>Crear cuenta</Link>
            </div>
          </div>
        )
        : errorAccesos
          ? (
            <p className={`${TARJETA} m-0 px-4 py-3.5 text-tabla text-[var(--texto-suave)]`}>
              No se han podido cargar tus equipos. Vuelve a intentarlo desde{' '}
              <Link href={'/mi-panel' as Route} className="font-semibold text-[var(--accion)] hover:underline">Mi panel</Link>.
            </p>
          )
          : accesos.length === 0
            ? (
              <div className={`${TARJETA} px-4 py-4`}>
                <p className="m-0 text-tabla text-[var(--texto-suave)]">
                  Todavía no sigues a ningún equipo.
                </p>
                <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
                  Abre una competición, elige un equipo y guárdalo para tenerlo aquí.
                </p>
                <p className="m-0 mt-3">
                  <Link href={'/explorar/competiciones' as Route} className={BOTON_SECUNDARIO}>
                    Explorar competiciones
                  </Link>
                </p>
              </div>
            )
            : (
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {accesos.map((acceso) => {
                  const ruta = rutaDeAcceso(acceso.url);
                  const ultimo = textoSiguiente(acceso, 'ultimo');
                  const proximo = textoSiguiente(acceso, 'proximo');
                  return (
                    <li key={`${acceso.tipo}-${acceso.id}`} className={`${TARJETA} flex flex-col px-4 py-3`}>
                      <span className="text-etiqueta font-semibold text-[var(--accion)]">
                        {etiquetaDeAcceso(acceso)}
                      </span>
                      <p className="m-0 mt-0.5 text-bloque font-semibold text-[var(--texto)]">
                        {ruta
                          ? <Link href={ruta as Route} className="hover:text-[var(--accion)] hover:underline">{acceso.etiqueta}</Link>
                          : acceso.etiqueta}
                      </p>
                      {ultimo !== null && (
                        <p className="m-0 mt-1 text-nota text-[var(--texto-suave)]">
                          Último: <span className="text-[var(--texto)]">{ultimo}</span>
                        </p>
                      )}
                      {proximo !== null && (
                        <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
                          Próximo: <span className="text-[var(--texto)]">{proximo}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

      {sesion !== null && !errorAccesos && hayMas && (
        <p className="m-0 text-nota">
          <Link href={'/mi-panel' as Route} className="font-semibold text-[var(--accion)] hover:underline">
            Ver todos los equipos que sigues
          </Link>
        </p>
      )}
    </section>
  );
}
