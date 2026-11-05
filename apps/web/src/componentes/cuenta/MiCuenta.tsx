import Link from 'next/link';
import type { Route } from 'next';
import {
  canalesDeAviso, enmascaraCorreo, estadoDeCuenta, etiquetaCorreo, etiquetaRol, eventosActivos, fechaDia,
  horaCorta, textoDelPaquete, type PerfilCuenta,
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
const ETIQUETA = 'text-etiqueta uppercase tracking-[0.05em] text-[var(--texto-suave)]';

export function MiCuenta({ perfil, correo = null }: { perfil: PerfilCuenta; correo?: string | null }) {
  const estado = estadoDeCuenta(perfil);
  const correoVisible = correo === null ? null : enmascaraCorreo(correo);
  const preferencias = perfil.preferencias;
  const canales = canalesDeAviso(preferencias);
  const eventos = eventosActivos(preferencias.eventos);
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-[18px]">
      <header>
        <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">Mi cuenta</h1>
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
              Los avisos automáticos todavía no se envían. Estas son las preferencias guardadas para cuando
              estén disponibles.
            </p>
            <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {canales.map((canal) => <Fila key={canal.etiqueta} etiqueta={canal.etiqueta} valor={canal.valor} />)}
              <Fila etiqueta="Dispositivos" valor={perfil.dispositivosPush === 0
                ? 'Ninguno'
                : `${perfil.dispositivosPush} dispositivo${perfil.dispositivosPush === 1 ? '' : 's'}`} />
            </dl>
            <div>
              <p className={`m-0 ${ETIQUETA}`}>Eventos</p>
              {eventos.length === 0
                ? <p className="m-0 mt-0.5 text-tabla text-[var(--texto-suave)]">Ninguno seleccionado.</p>
                : (
                  <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
                    {eventos.map((evento) => (
                      <li key={evento} className="rounded-[999px] bg-[var(--fondo-sutil)] px-2.5 py-1 text-nota text-[var(--texto)]">
                        {evento}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <p className="m-0 text-nota text-[var(--texto-suave)]">
              Resumen por correo: {etiquetaCorreo(preferencias.correo)}
              {preferencias.correo === 'resumen' ? ` a las ${horaCorta(preferencias.hora_resumen)}` : ''}.
            </p>
          </section>

          <section id="seguridad" aria-labelledby="seguridad-titulo" className={`${TARJETA} flex flex-col gap-3`}>
            <h2 id="seguridad-titulo" className="m-0 text-bloque font-bold text-[var(--texto)]">Seguridad</h2>
            <dl className="m-0 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <Fila etiqueta="Verificación en dos pasos" valor="No disponible" />
              <Fila etiqueta="Verificación del correo" valor="No implementada" />
              <Fila etiqueta="Cambio de contraseña" valor="No disponible desde la web" />
              <Fila etiqueta="Sesiones" valor="Sesión abierta en este navegador" />
            </dl>
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
              La descarga de tus datos y la baja de la cuenta todavía no están disponibles desde la web.
            </p>
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
