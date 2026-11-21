import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { PaginaCrearCuenta } from '@/componentes/entrar/PaginaCrearCuenta';
import { textoAviso, urlVolverSegura } from '@/lib/cuentas';
import { sesionActual } from '@/lib/sesion';

/**
 * Alta de cuenta (`/crear-cuenta`).
 *
 * Registro abierto: no se pide invitación. La cuenta sirve para guardar favoritos y ver horarios y
 * resultados; no da acceso a nada más que lo que ya tiene un usuario con el paquete por defecto.
 *
 * Si ya hay sesión, no tiene sentido crear otra cuenta: se vuelve a `volver` o a `/mi-panel`. Los
 * avisos de validación (nombre, correo, contraseña, aceptación, correo ya registrado) llegan por
 * `?aviso=` y se traducen en `lib/cuentas.ts`; nunca se refleja texto libre.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Crear cuenta — Fondo Popular',
};

export default async function CrearCuenta({ searchParams }: {
  searchParams: Promise<{ aviso?: string; volver?: string }>;
}) {
  const { aviso: codigo, volver: volverCrudo } = await searchParams;
  const volver = urlVolverSegura(volverCrudo);

  const sesion = await sesionActual();
  if (sesion) redirect((volver ?? '/mi-panel') as Route);

  return <PaginaCrearCuenta aviso={textoAviso(codigo)} avisoCodigo={codigo ?? null} volver={volver} />;
}
