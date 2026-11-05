import Link from 'next/link';
import type { Route } from 'next';

/**
 * 404 de la zona de administración.
 *
 * Se usa cuando hay sesión pero no es de administración (o le falta la capacidad): no se dice «403» ni
 * se confirma que la zona exista. El texto es claro para quien llega: no tiene acceso y puede volver.
 */
export default function AdminNoEncontrado() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 py-10 text-center">
      <h1 className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
        No tienes acceso a esta página
      </h1>
      <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
        Esta zona es para cuentas de administración. Si crees que es un error, habla con quien
        administra la plataforma.
      </p>
      <p className="m-0 mt-2">
        <Link href={'/' as Route}
          className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-[var(--borde-fuerte)] bg-[var(--fondo-elevado)] px-4 text-tabla font-semibold text-[var(--texto)] hover:bg-[var(--fondo-sutil)]">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
