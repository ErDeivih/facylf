import type { Metadata } from 'next';
import { FalloAdmin } from '@/componentes/admin/FalloAdmin';
import { PanelAdmin } from '@/componentes/admin/PanelAdmin';
import { cargaPanelAdmin } from '@/lib/admin-datos';
import { exigeAdministrador } from '@/lib/admin-servidor';

/**
 * Portada del panel (`/admin`).
 *
 * Sin sesión se va a `/entrar`; con sesión sin rol de administrador o sin `administrar_usuarios`, 404
 * (no 403: no se revela que esta zona existe). Ver `lib/admin-servidor.ts`.
 *
 * Dinámica y sin caché: son datos de cuentas y de operación que cambian y que no deben reutilizarse
 * entre usuarios. Las consultas van con el rol `facylf_app`.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Administración — Fondo Popular',
};

export default async function PaginaAdmin() {
  await exigeAdministrador();
  try {
    const datos = await cargaPanelAdmin();
    return <PanelAdmin {...datos} />;
  } catch {
    return <FalloAdmin que="el panel" />;
  }
}
