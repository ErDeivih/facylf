import Link from 'next/link';
import type { Route } from 'next';
import type { FilaAcceso } from '@/consultas/usuario';
import { rutaDeAcceso } from '@/lib/cuentas';

/**
 * «Mi panel»: los favoritos de la cuenta con su último resultado y su próximo partido, y el cierre
 * de sesión.
 *
 * Sólo pinta. La página resuelve la sesión y lee `app.mis_accesos` con el `user_id` de esa sesión; el
 * componente no conoce ni la cookie ni la base. Eso permite probarlo con filas de ejemplo, incluido el
 * estado vacío, sin navegador.
 *
 * No se inventa nada: si el favorito no tiene último o próximo partido, esa línea no aparece; si el
 * enlace que devuelve la base no se puede traducir a una ruta actual, el nombre se queda sin enlace.
 */

const ETIQUETA_TIPO: Readonly<Record<string, string>> = {
  equipo: 'Equipo',
  club: 'Club',
  jugador: 'Jugador',
  competicion: 'Competición',
  grupo: 'Grupo',
  temporada: 'Temporada',
  arbitro: 'Árbitro',
};

export function PanelAccesos({ nombre, accesos, error = false }: {
  nombre: string | null;
  accesos: readonly FilaAcceso[];
  error?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Mi panel</h1>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            {nombre ? `Sesión de ${nombre}. ` : ''}Lo que sigues, con su último resultado y su próximo
            partido.
          </p>
        </div>
        <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-2">
          <Link href={'/explorar/calendario' as Route}
            className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
            Horarios y resultados
          </Link>
          <Link href={'/explorar/competiciones' as Route}
            className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
            Competiciones
          </Link>
        </nav>
      </header>

      {error
        ? (
          <p role="alert" className="border-l-4 border-[var(--revision)] bg-[var(--fondo-sutil)] p-3 text-tabla leading-6 text-[var(--texto)]">
            No se ha podido cargar tu panel. Vuelve a intentarlo en un momento.
          </p>
        )
        : accesos.length === 0
          ? (
            <div className="border border-dashed border-[var(--borde-fuerte)] p-6 text-center">
              <p className="m-0 text-bloque font-semibold text-[var(--texto)]">Todavía no sigues nada</p>
              <p className="m-0 mt-1 text-tabla leading-6 text-[var(--texto-suave)]">
                Abre un equipo, un club o un jugador y pulsa Guardar. Aquí verás sus horarios y sus
                resultados.
              </p>
              <p className="m-0 mt-3">
                <Link href={'/explorar/competiciones' as Route}
                  className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
                  Explorar competiciones
                </Link>
              </p>
            </div>
          )
          : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {accesos.map((acceso) => {
                const ruta = rutaDeAcceso(acceso.url);
                const tipo = ETIQUETA_TIPO[acceso.tipo] ?? 'Favorito';
                return (
                  <li key={`${acceso.tipo}-${acceso.id}`}
                    className="flex flex-wrap items-start gap-3 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
                    <div className="min-w-0 flex-[1_1_260px]">
                      <span className="text-etiqueta font-semibold uppercase tracking-[0.06em] text-[var(--accion)]">
                        {tipo}
                      </span>
                      <p className="m-0 text-bloque font-semibold text-[var(--texto)]">
                        {ruta
                          ? <Link href={ruta as Route} className="hover:text-[var(--accion)] hover:underline">{acceso.etiqueta}</Link>
                          : acceso.etiqueta}
                      </p>
                      {acceso.ultimo && (
                        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
                          Último: <span className="text-[var(--texto)]">{acceso.ultimo}</span>
                        </p>
                      )}
                      {acceso.proximo && (
                        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
                          Próximo: <span className="text-[var(--texto)]">{acceso.proximo}</span>
                        </p>
                      )}
                    </div>
                    <form action="/api/favoritos" method="post" className="ml-auto">
                      <input type="hidden" name="accion" value="quitar" />
                      <input type="hidden" name="id" value={String(acceso.id)} />
                      <input type="hidden" name="volver" value="/mi-panel" />
                      <button type="submit"
                        aria-label={`Quitar ${acceso.etiqueta} de favoritos`}
                        className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
                        Quitar
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

      <section aria-labelledby="cuenta-titulo"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-4">
        <div>
          <h2 id="cuenta-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Tu cuenta</h2>
          <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
            Al cerrar la sesión, este navegador deja de recordar tu cuenta.
          </p>
        </div>
        <form action="/api/cuentas/salir" method="post">
          <button type="submit"
            className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
            Cerrar sesión
          </button>
        </form>
      </section>
    </div>
  );
}
