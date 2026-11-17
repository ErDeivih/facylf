import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';

export const metadata: Metadata = { title: 'Recuperar contraseña — Fondo Popular' };

export default async function Recuperar({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-4">
      <h1 className="m-0 text-titulo font-extrabold text-[var(--texto)]">Recuperar contraseña</h1>
      <p className="m-0 text-tabla text-[var(--texto-suave)]">Déjanos el correo de la cuenta. La solicitud queda registrada para que podamos atenderla; todavía no se envía un correo automático.</p>
      {aviso === 'enviado' && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-[var(--accion-suave)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">Solicitud registrada. Si el correo existe, se atenderá lo antes posible.</p>}
      {aviso === 'correo' && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">Ese correo no tiene un formato válido.</p>}
      {aviso === 'intentos' && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">Demasiados intentos. Espera unos minutos.</p>}
      {aviso === 'origen' && <p role="alert" className="m-0 rounded-[var(--radius-control)] bg-[var(--fondo-sutil)] px-3 py-2 text-tabla font-semibold text-[var(--texto)]">La petición no venía de esta web.</p>}
      <form action="/api/cuentas/recuperar" method="post" className="flex flex-col gap-3 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-5">
        <label className="text-tabla text-[var(--texto-suave)]">Correo de la cuenta
          <input name="correo" type="email" autoComplete="email" required className="mt-1 h-11 w-full rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo)] px-2.5 text-tabla text-[var(--texto)]" />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accion)] px-4 text-tabla font-semibold text-[var(--texto-fuerte)]">Solicitar recuperación</button>
      </form>
      <p className="m-0 text-tabla text-[var(--texto-suave)]"><Link className="font-semibold text-[var(--accion)] underline" href={'/entrar' as Route}>Volver a entrar</Link></p>
    </div>
  );
}
