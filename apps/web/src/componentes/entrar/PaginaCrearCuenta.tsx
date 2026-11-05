import Link from 'next/link';
import type { Route } from 'next';
import { rutaConVolver } from '@/lib/cuentas';
import { AvisoEstado } from './AvisoEstado';
import { FormularioCrearCuenta } from './FormularioCrearCuenta';

/**
 * `/crear-cuenta`: sólo el alta.
 *
 * No pide invitación: la cuenta sirve para guardar favoritos y ver sus horarios y resultados. La
 * página queda separada de `/entrar` (decisión de David, 05/11/2026) y enlaza de vuelta. Es una pieza
 * sin base de datos ni Next para poder probarla sola.
 */

const TARJETA =
  'flex w-full flex-col gap-3.5 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-6';

export function PaginaCrearCuenta({ aviso, volver }: { aviso: string | null; volver: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6">
      <p className="m-0 text-center text-cuerpo text-[var(--texto-suave)]">
        Una cuenta guarda los clubes, equipos y jugadores que sigues y te deja ver sus horarios y
        resultados.
      </p>

      <AvisoEstado texto={aviso} />

      <section aria-labelledby="crear-cuenta-titulo" className={TARJETA}>
        <h1 id="crear-cuenta-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
          Crear cuenta
        </h1>
        <FormularioCrearCuenta volver={volver} />

        <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
          ¿Ya tienes cuenta?{' '}
          <Link href={rutaConVolver('/entrar', volver) as Route}
            className="font-semibold text-[var(--accion)] underline underline-offset-2">
            Entrar
          </Link>
        </p>
      </section>
    </div>
  );
}
