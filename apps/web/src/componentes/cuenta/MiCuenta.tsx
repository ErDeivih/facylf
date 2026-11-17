import Link from 'next/link';
import type { Route } from 'next';
import {
  canalesDeAviso, enmascaraCorreo, estadoDeCuenta, etiquetaRol, fechaDia,
  horaCorta, textoDelPaquete, ETIQUETAS_EVENTO, type PerfilCuenta,
} from '@/lib/cuenta-pantalla';

/**
 * «Mi cuenta»: datos de la cuenta, preferencias de aviso y seguridad.
 *
 * Es una pieza de presentación pura: recibe el perfil ya normalizado por la página. Enseña lo que hay
 * de verdad y, cuando algo no existe (correo accesible, verificación, 2FA, cambio de contraseña,
 * descarga o baja), lo dice sin poner un botón que no haga nada.
 *
 * El cierre de sesión es lo único que escribe: el formulario va a `/api/cuentas/salir`, que ya existe
 * y comprueba el origen. Igual que en Mi panel, el `user_id` sale de la cookie del servidor y esta
 * pantalla no lo recibe como parámetro.
 */

const TARJETA = 'rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-4 py-4';
const ENLACE_MENU = 'flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]';
const BOTON = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]';
const ETIQUETA = 'text-etiqueta text-[var(--texto-suave)]';

export function MiCuenta({ perfil, correo = null, aviso = null }: {
  perfil: PerfilCuenta;
  correo?: string | null;
  aviso?: 'preferencias' | 'preferencias-error' | 'origen' | 'contrasena' | 'contrasena-actual' | 'contrasena-error' | 'baja-error' | null;
}) {
  const estado = estadoDeCuenta(perfil);
  const correoVisible = correo === null ? null : enmascaraCorreo(correo);
  const preferencias = perfil.preferencias;
  const canales = canalesDeAviso(preferencias);
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-[18px]">
      <header>
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Mi cuenta</h1>
        {aviso === 'preferencias' && (
          <p role="status" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--accion-suave)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">
            Preferencias guardadas.
          </p>
        )}
        {aviso === 'preferencias-error' && (
          <p role="alert" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">
            No se han guardado: revisa las horas y el modo de aviso.
          </p>
        )}
        {aviso === 'origen' && (
          <p role="alert" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">
            La petición no venía de esta web; no se ha guardado nada.
          </p>
        )}
        {aviso === 'contrasena' && <p role="status" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--accion-suave)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">Contraseña cambiada.</p>}
        {aviso === 'contrasena-actual' && <p role="alert" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">La contraseña actual no es correcta.</p>}
        {aviso === 'contrasena-error' && <p role="alert" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">No se ha podido cambiar. Inténtalo de nuevo.</p>}
        {aviso === 'baja-error' && <p role="alert" className="m-0 mt-2 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">No se ha podido dar de baja la cuenta. Inténtalo de nuevo.</p>}
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          {perfil.nombre !== null ? `Sesión de ${perfil.nombre}.` : 'Sesión abierta.'}
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-[18px]">
        <nav aria-label="Mi cuenta" className="w-full flex-[1_1_200px] rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-2 sm:max-w-[230px]">
          <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0 sm:flex-col">
            <li><a className={ENLACE_MENU} href="#datos">Datos</a></li>
            <li><a className={ENLACE_MENU} href="#avisos">Avisos</a></li>
            <li><a className={ENLACE_MENU} href="#seguridad">Seguridad</a></li>
            <li><a className={ENLACE_MENU} href="#tus-datos">Tus datos</a></li>
            <li><Link className={ENLACE_MENU} href={'/mi-panel' as Route}>Mi panel</Link></li>
            <li><Link className={ENLACE_MENU} href={'/' as Route}>Inicio</Link></li>
          </ul>
        </nav>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px]">
          <section id="datos" aria-labelledby="datos-titulo" className={`${TARJETA} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="datos-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Datos</h2>
              <span className="rounded-[999px] bg-[var(--fondo-sutil)] px-2.5 py-1 text-nota font-semibold text-[var(--texto)]">
                {estado.etiqueta}
              </span>
            </div>
            <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <Fila etiqueta="Nombre" valor={perfil.nombre ?? 'Sin nombre'} />
              <Fila etiqueta="Correo" valor={correoVisible ?? 'No se muestra en esta pantalla'} />
              <Fila etiqueta="Paquete" valor={textoDelPaquete(perfil)} />
              <Fila etiqueta="Zona horaria" valor={perfil.zonaHoraria} />
              <Fila etiqueta="Alta" valor={perfil.creadoEn === '' ? '—' : fechaDia(perfil.creadoEn)} />
              <Fila etiqueta="Rol" valor={etiquetaRol(perfil.rol)} />
              <Fila etiqueta="Favoritos" valor={`${perfil.favoritos}`} />
              <Fila etiqueta="Avisos sin leer" valor={`${perfil.avisosSinLeer}`} />
            </dl>
            <p className="m-0 text-nota text-[var(--texto-suave)]">{estado.detalle}</p>
          </section>

          <section id="avisos" aria-labelledby="avisos-titulo" className={`${TARJETA} flex flex-col gap-3`}>
            <h2 id="avisos-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Avisos</h2>
            <p className="m-0 text-tabla text-[var(--texto-suave)]">
              Los avisos automáticos todavía no se envían. Puedes dejar guardadas tus preferencias para
              cuando estén disponibles.
            </p>
            <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {canales.map((canal) => <Fila key={canal.etiqueta} etiqueta={canal.etiqueta} valor={canal.valor} />)}
              <Fila etiqueta="Dispositivos" valor={perfil.dispositivosPush === 0
                ? 'Ninguno'
                : `${perfil.dispositivosPush} dispositivo${perfil.dispositivosPush === 1 ? '' : 's'}`} />
            </dl>
            <form action="/api/cuentas/preferencias" method="post" className="flex flex-col gap-3">
              <label className="flex min-h-11 items-center gap-2 text-tabla text-[var(--texto)]">
                <input type="checkbox" name="en_app" defaultChecked={preferencias.en_app} />
                Avisos dentro de la aplicación
              </label>
              <label className="flex min-h-11 flex-col gap-1 text-tabla text-[var(--texto)]">
                Correo
                <select name="correo" defaultValue={preferencias.correo}
                  className="h-11 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]">
                  <option value="nunca">Nunca</option>
                  <option value="al_momento">Al momento</option>
                  <option value="resumen">Un resumen al día</option>
                </select>
              </label>
              <label className="flex min-h-11 flex-col gap-1 text-tabla text-[var(--texto)]">
                Hora del resumen
                <input type="time" name="hora_resumen" defaultValue={horaCorta(preferencias.hora_resumen)}
                  className="h-11 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex min-h-11 flex-col gap-1 text-tabla text-[var(--texto)]">
                  Silencio desde
                  <input type="time" name="silencio_desde" defaultValue={preferencias.silencio_desde ? horaCorta(preferencias.silencio_desde) : ''}
                    className="h-11 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]" />
                </label>
                <label className="flex min-h-11 flex-col gap-1 text-tabla text-[var(--texto)]">
                  Silencio hasta
                  <input type="time" name="silencio_hasta" defaultValue={preferencias.silencio_hasta ? horaCorta(preferencias.silencio_hasta) : ''}
                    className="h-11 rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-3 text-cuerpo text-[var(--texto)]" />
                </label>
              </div>
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
                <legend className={`m-0 ${ETIQUETA}`}>Eventos</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {Object.entries(ETIQUETAS_EVENTO).map(([codigo, etiqueta]) => (
                    <label key={codigo} className="flex min-h-11 items-center gap-2 text-tabla text-[var(--texto)]">
                      <input type="checkbox" name="eventos" value={codigo}
                        defaultChecked={preferencias.eventos.includes(codigo)} />
                      {etiqueta}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className={BOTON}>Guardar preferencias</button>
            </form>
          </section>

          <section id="seguridad" aria-labelledby="seguridad-titulo" className={`${TARJETA} flex flex-col gap-3`}>
            <h2 id="seguridad-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Seguridad</h2>
            <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <Fila etiqueta="Verificación en dos pasos" valor="No disponible" />
              <Fila etiqueta="Verificación del correo" valor="No implementada" />
              <Fila etiqueta="Cambio de contraseña" valor="Disponible" />
              <Fila etiqueta="Sesiones" valor="Sesión abierta en este navegador" />
            </dl>
            <form action="/api/cuentas/contrasena" method="post" className="flex flex-col gap-2 border-t border-[var(--fondo-sutil)] pt-3">
              <p className="m-0 text-tabla font-semibold text-[var(--texto)]">Cambiar contraseña</p>
              <label className="text-nota text-[var(--texto-suave)]">Contraseña actual
                <input name="actual" type="password" autoComplete="current-password" required className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo)] px-2.5 text-tabla text-[var(--texto)]" />
              </label>
              <label className="text-nota text-[var(--texto-suave)]">Nueva contraseña
                <input name="nueva" type="password" autoComplete="new-password" minLength={10} required className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo)] px-2.5 text-tabla text-[var(--texto)]" />
              </label>
              <label className="text-nota text-[var(--texto-suave)]">Repite la nueva
                <input name="repetir" type="password" autoComplete="new-password" minLength={10} required className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo)] px-2.5 text-tabla text-[var(--texto)]" />
              </label>
              <button type="submit" className={BOTON}>Cambiar contraseña</button>
            </form>
            <form action="/api/cuentas/salir" method="post" className="m-0">
              <button type="submit" className={BOTON}>Cerrar sesión</button>
            </form>
            <p className="m-0 text-nota text-[var(--texto-suave)]">
              Al cerrar la sesión, este navegador deja de recordar tu cuenta.
            </p>
          </section>

          <section id="tus-datos" aria-labelledby="tus-datos-titulo" className={`${TARJETA} flex flex-col gap-2`}>
            <h2 id="tus-datos-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Tus datos</h2>
            <p className="m-0 text-tabla text-[var(--texto-suave)]">
              Puedes descargar una copia de los datos de tu cuenta en formato JSON.
            </p>
            <a href="/api/cuentas/exportar" download className={BOTON}>Descargar mis datos</a>
            <form action="/api/cuentas/baja" method="post" className="m-0">
              <button type="submit" className={BOTON}>Darme de baja</button>
            </form>
            <p className="m-0 text-nota text-[var(--texto-suave)]">La baja borra favoritos, avisos y preferencias, y anonimiza el perfil. No se puede deshacer.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Una fila de la ficha, con su etiqueta y su valor. */
function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <>
      <dt className={`m-0 ${ETIQUETA}`}>{etiqueta}</dt>
      <dd className="m-0 text-tabla text-[var(--texto)]">{valor}</dd>
    </>
  );
}

/** Sin sesión: no se inventa una cuenta; se invita a entrar o crear una. */
export function MiCuentaSinSesion() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-[18px]">
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Mi cuenta</h1>
      <section className={`${TARJETA} flex flex-col gap-3`}>
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">Entra para ver tu cuenta</h2>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          Los datos de la cuenta, los avisos y la seguridad se ven cuando has entrado.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={'/entrar?volver=/mi-cuenta' as Route}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-inverso)]">
            Entrar
          </Link>
          <Link href={'/crear-cuenta?volver=/mi-cuenta' as Route}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)]">
            Crear cuenta
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Si la cuenta no se puede leer, se dice; no se pinta una cuenta vacía que parezca real. */
export function MiCuentaError() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-[18px]">
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Mi cuenta</h1>
      <section className={`${TARJETA} flex flex-col gap-3`}>
        <h2 className="m-0 text-bloque font-bold text-[var(--texto)]">No se ha podido cargar tu cuenta</h2>
        <p className="m-0 text-tabla text-[var(--texto-suave)]">
          Vuelve a intentarlo en un momento. Tu sesión sigue abierta.
        </p>
        <p className="m-0">
          <Link href={'/mi-cuenta' as Route} className={BOTON}>Reintentar</Link>
        </p>
      </section>
    </div>
  );
}
