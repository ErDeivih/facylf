import Link from 'next/link';
import { formateaPorcentaje } from '@/lib/prediccion';
import type { Route } from 'next';
import type { FilaAcceso } from '@/consultas/usuario';
import { rutaDeAcceso } from '@/lib/cuentas';
import {
  etiquetaDeAcceso, FEDERACION_DE_LA_PORTADA, rutaDeCompeticion, temporadaDeLaPortada,
  textoDeCobertura, textoSiguiente, urlDelSelector, type CompeticionDePortada,
} from '@/lib/inicio';

/**
 * La portada: búsqueda, competiciones de Castilla y León y los equipos que sigue la cuenta.
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

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]';
const BOTON_PRIMARIO = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)] hover:opacity-90';
const BOTON_SECUNDARIO = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]';

/** Un partido de la jornada de ejemplo de la portada (datos reales del canónico). */
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

export function InicioContenido({ competiciones, jornada = [], sesion, accesos, errorAccesos = false }: {
  competiciones: readonly CompeticionDePortada[];
  jornada?: readonly PartidoDeEjemplo[];
  sesion: SesionDeLaPortada;
  accesos: readonly FilaAcceso[];
  errorAccesos?: boolean;
}) {
  const temporada = temporadaDeLaPortada(competiciones);
  const seguidos = accesos.slice(0, 3);
  return (
    <div className="flex flex-col gap-[22px]">
      <section aria-labelledby="jornada-ejemplo"
        className="rounded-[var(--radius-tarjeta)] bg-[var(--fondo-fuerte)] px-6 py-6 text-[var(--texto-fuerte)]">
        <h1 id="jornada-ejemplo" className="m-0 text-titulo font-extrabold tracking-[-0.02em]">
          Una jornada de ejemplo
        </h1>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-tenue)]">
          Partidos reales de la temporada 2026-27, con fecha, equipos y marcador. Toca «Ver partido» para abrir la jornada.
        </p>
        <ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
          {jornada.map((partido) => (
            <li key={partido.partidoId}
              className="flex flex-col gap-1 rounded-[var(--radius-lg)] bg-[var(--fondo-elevado)]/5 px-3 py-2.5">
              <span className="text-etiqueta text-[var(--texto-fuerte-suave)]">
                {partido.fechaTexto}{partido.jornada !== null ? ` · Jornada ${partido.jornada}` : ''}{partido.edicion ? ` · ${partido.edicion}` : ''}
              </span>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-tabla font-semibold">
                  {partido.local} <span className="mx-1 rounded bg-[var(--accion)] px-1.5 py-0.5 text-[var(--texto-inverso)]">{partido.golesLocal} - {partido.golesVisitante}</span> {partido.visitante}
                </span>
                <Link href={partido.jornadaNumero !== null
                  ? `/explorar/competicion/${partido.grupoId}/jornada/${partido.jornadaNumero}`
                  : `/explorar/competicion/${partido.grupoId}`}
                  className="text-nota font-semibold text-[var(--texto-fuerte)] underline underline-offset-2">
                  Ver partido
                </Link>
              </span>
              {partido.predLocal != null && partido.predEmpate != null && partido.predVisitante != null && (
                <span className="text-etiqueta tabular-nums text-[var(--texto-fuerte-suave)]">
                  Predicción: 1 {formateaPorcentaje(partido.predLocal)} · X {formateaPorcentaje(partido.predEmpate)} · 2 {formateaPorcentaje(partido.predVisitante)}
                  {partido.predMarcador ? ` · ${partido.predMarcador}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 text-nota text-[var(--texto-tenue)]">
          También puedes <Link href={urlDelSelector(FEDERACION_DE_LA_PORTADA, temporada) as Route}
            className="font-semibold text-[var(--texto-fuerte)] underline underline-offset-2">buscar por competición</Link>
          {' · '}
          <Link href={'/explorar/proximas' as Route}
            className="font-semibold text-[var(--texto-fuerte)] underline underline-offset-2">ver la próxima jornada</Link>.
        </p>
      </section>

      <section aria-labelledby="explorar-competicion" className={`${TARJETA} px-4 py-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="explorar-competicion" className="m-0 text-bloque font-bold text-[var(--texto)]">Explorar una competición</h2>
            <p className="m-0 mt-0.5 text-nota text-[var(--texto-suave)]">
              Castilla y León{temporada !== null ? ` · ${temporada}` : ''}
            </p>
          </div>
          <Link href={urlDelSelector(FEDERACION_DE_LA_PORTADA, temporada) as Route}
            className="text-tabla font-semibold text-[var(--accion)] hover:underline">
            Ver todas
          </Link>
        </div>
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
                    <span className="text-etiqueta text-[var(--texto-suave)]">
                      {competicion.temporada} · {competicion.federacionNombre}
                    </span>
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
