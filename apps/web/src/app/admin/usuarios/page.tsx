import type { Metadata } from 'next';
import { FalloAdmin } from '@/componentes/admin/FalloAdmin';
import { UsuariosAdmin } from '@/componentes/admin/UsuariosAdmin';
import { ESTADOS_USUARIO } from '@/lib/admin';
import { cargaUsuariosAdmin } from '@/lib/admin-datos';
import { exigeAdministrador } from '@/lib/admin-servidor';

/**
 * Lista de usuarios (`/admin/usuarios`), sólo lectura.
 *
 * Filtros por URL (`estado`, `q`); el `user_id` no se acepta por la URL. Los estados se validan contra
 * la lista cerrada antes de llegar a PostgreSQL; el texto se recorta. Sin sesión → `/entrar`; con
 * sesión sin permiso → 404. Dinámica y sin caché.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Usuarios — Administración — Fondo Popular',
};

const ESTADOS = new Set<string>(ESTADOS_USUARIO);
const MAXIMO_PAGINA = 10_000;

export default async function PaginaUsuarios({ searchParams }: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string }>;
}) {
  await exigeAdministrador();
  const { estado: estadoCrudo, q: qCrudo, pagina: paginaCruda } = await searchParams;
  const estado = typeof estadoCrudo === 'string' && ESTADOS.has(estadoCrudo) ? estadoCrudo : null;
  const texto = typeof qCrudo === 'string' ? qCrudo.trim().slice(0, 60) || null : null;
  const pagina = Number.parseInt(typeof paginaCruda === 'string' ? paginaCruda : '', 10);
  const paginaValida = Number.isInteger(pagina) && pagina >= 1 && pagina <= MAXIMO_PAGINA ? pagina : 1;

  try {
    const datos = await cargaUsuariosAdmin({ estado, texto, pagina: paginaValida });
    return <UsuariosAdmin {...datos} filtros={{ estado, texto }} />;
  } catch {
    return <FalloAdmin que="los usuarios" />;
  }
}
