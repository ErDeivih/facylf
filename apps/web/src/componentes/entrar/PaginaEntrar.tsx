import Link from 'next/link';
import type { Route } from 'next';
import { rutaConVolver } from '@/lib/cuentas';
import { AvisoEstado } from './AvisoEstado';
import { FormularioEntrar } from './FormularioEntrar';

/**
 * `/entrar`: sólo la entrada.
 *
 * Antes esta pantalla mezclaba «Entrar» y «Crear cuenta» en dos tarjetas; ahora cada flujo tiene su
 * página y aquí sólo se entra, con un enlace claro a `/crear-cuenta`. Es una pieza sin base de datos ni
 * Next: recibe el aviso ya traducido y la ruta de vuelta, y así se puede probar sola.
 *
 * No hay enlace mágico ni recuperación automática de contraseña (no hay correo saliente): se dice en
 * una línea, sin botones que finjan. El contexto de utilidad cabe en una línea.
 */

const TARJETA =
  'flex w-full flex-col gap-3.5 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-6';

export function PaginaEntrar({ aviso, volver }: { aviso: string | null; volver: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6">
      <p className="m-0 text-center text-cuerpo text-[var(--texto-suave)]">
        Con una cuenta guardas clubes, equipos y jugadores y tienes a mano sus horarios, resultados y
        avisos.
      </p>

      <AvisoEstado texto={aviso} />

      <section aria-labelledby="entrar-titulo" className={TARJETA}>
        <h1 id="entrar-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          Entrar
        </h1>
        <FormularioEntrar volver={volver} />

        <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
          ¿No tienes cuenta?{' '}
          <Link href={rutaConVolver('/crear-cuenta', volver) as Route}
            className="inline-flex min-h-11 items-center font-semibold text-[var(--accion)] underline underline-offset-2">
            Crear una cuenta
          </Link>
        </p>
        <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
          Si has olvidado la contraseña, todavía no se puede recuperar desde la web.
        </p>
      </section>
    </div>
  );
}
