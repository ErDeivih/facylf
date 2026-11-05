import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { PaginaAcceso } from '@/componentes/entrar/PaginaAcceso';
import { textoAviso, urlVolverSegura } from '@/lib/cuentas';
import { modoRegistro } from '@/lib/cuentas-db';
import { sesionActual } from '@/lib/sesion';

/**
 * Entrada y alta de cuenta (pantalla 13 del prototipo, ya con backend).
 *
 * Si ya hay sesión, esta pantalla no tiene sentido: se vuelve a donde se iba (`volver`, sólo rutas
 * internas) o a `/mi-panel`. El modo de registro se lee de `app.ajuste` para redactar el alta; si la
 * base no responde se usa el texto de invitación y los formularios siguen visibles, pero el envío
 * dirá que no se puede ahora mismo, sin mensajes técnicos.
 *
 * La página es dinámica por la cookie de sesión y por el modo de registro. Los formularios son HTML
 * normal: funcionan sin JavaScript.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar o crear cuenta — facylf',
};

export default async function Entrar({ searchParams }: {
  searchParams: Promise<{ aviso?: string; volver?: string }>;
}) {
  const { aviso: codigo, volver: volverCrudo } = await searchParams;
  const volver = urlVolverSegura(volverCrudo);

  const sesion = await sesionActual();
  if (sesion) redirect((volver ?? '/mi-panel') as Route);

  const modo = (await modoRegistro()) ?? 'invitacion';

  return <PaginaAcceso aviso={textoAviso(codigo)} volver={volver} modo={modo} />;
}
