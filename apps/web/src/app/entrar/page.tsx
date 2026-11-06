import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { PaginaEntrar } from '@/componentes/entrar/PaginaEntrar';
import { textoAviso, urlVolverSegura } from '@/lib/cuentas';
import { sesionActual } from '@/lib/sesion';

/**
 * Entrada de la cuenta (`/entrar`).
 *
 * Sólo login. El alta vive en `/crear-cuenta` desde la revisión de capturas del 05/11/2026. Si ya hay
 * sesión, se vuelve a donde se iba (`volver`, sólo rutas internas) o a `/mi-panel`.
 *
 * La página es dinámica por la cookie de sesión. El formulario es HTML normal: funciona sin
 * JavaScript.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar — Fondo Popular',
};

export default async function Entrar({ searchParams }: {
  searchParams: Promise<{ aviso?: string; volver?: string }>;
}) {
  const { aviso: codigo, volver: volverCrudo } = await searchParams;
  const volver = urlVolverSegura(volverCrudo);

  const sesion = await sesionActual();
  if (sesion) redirect((volver ?? '/mi-panel') as Route);

  return <PaginaEntrar aviso={textoAviso(codigo)} volver={volver} />;
}
