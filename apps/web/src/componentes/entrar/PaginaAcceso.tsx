import { AvisoEstado } from './AvisoEstado';
import { FormularioCrearCuenta } from './FormularioCrearCuenta';
import { FormularioEntrar } from './FormularioEntrar';

/**
 * La pantalla 13 del prototipo, ya con el flujo real: entrar y crear cuenta.
 *
 * Es una pieza **sin base de datos ni Next**: recibe el aviso ya traducido, la ruta de vuelta y el
 * modo de registro. Así se puede renderizar y probar sola, y la página sólo resuelve la sesión y el
 * modo. Los dos bloques van en tarjetas del sistema, en una fila a partir de 900 px y apilados por
 * debajo; a 360 px no hay desplazamiento horizontal.
 *
 * Lo que no se enseña, a propósito: ni avatar ni nombre de usuario (la sesión la resuelve la página),
 * ni «bienvenido», ni enlace de recuperación de contraseña (todavía no hay correo saliente), ni
 * mensajes técnicos. El consentimiento dice la decisión vigente sobre menores.
 */

const TARJETA =
  'flex min-w-0 flex-[1_1_360px] max-w-[420px] flex-col gap-3.5 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-6';

function textoDeInvitacion(modo: string): string {
  if (modo === 'aprobacion') {
    return 'Cualquiera puede pedir una cuenta; queda pendiente de que la aprueben.';
  }
  if (modo === 'abierto') {
    return 'La cuenta se crea al momento: no hace falta invitación.';
  }
  return 'facylf es privada: se entra con una invitación. Si no tienes una, pídela a quien te habló de la plataforma.';
}

export function PaginaAcceso({ aviso, volver, modo }: {
  aviso: string | null;
  volver: string | null;
  modo: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Entrar o crear cuenta</h1>

      <p className="mx-auto max-w-[840px] text-center text-cuerpo text-[var(--texto-suave)]">
        Con una cuenta guardas clubes, equipos y jugadores y tienes a mano sus horarios, resultados y
        avisos.
      </p>

      <div className="mx-auto w-full max-w-[840px]">
        <AvisoEstado texto={aviso} />
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6">
        <section aria-labelledby="entrar-titulo" className={TARJETA}>
          <h2 id="entrar-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            Entrar
          </h2>
          <FormularioEntrar volver={volver} />
        </section>

        <section aria-labelledby="crear-cuenta-titulo" className={TARJETA}>
          <h2 id="crear-cuenta-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            Crear cuenta
          </h2>
          <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">{textoDeInvitacion(modo)}</p>
          <FormularioCrearCuenta modo={modo} volver={volver} />
        </section>
      </div>
    </div>
  );
}
