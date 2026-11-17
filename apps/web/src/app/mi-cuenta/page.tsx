import type { Metadata } from 'next';
import { ejecutaConsulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { PERFIL_DE_LA_CUENTA, type FilaPerfilCuenta } from '@/consultas/mi-cuenta';
import { MiCuenta, MiCuentaError, MiCuentaSinSesion } from '@/componentes/cuenta/MiCuenta';
import { normalizaPerfil } from '@/lib/cuenta-pantalla';
import { sesionActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Mi cuenta — Fondo Popular',
};

/**
 * «Mi cuenta»: datos, avisos y seguridad de la sesión.
 *
 * La sesión se resuelve en el servidor y el `user_id` que se pasa a `app.perfil` sale de la cookie,
 * nunca de la URL. Sin sesión se invita a entrar; si la cuenta no se puede leer, se dice. El correo
 * enmascarado queda pendiente de una función SQL que lo exponga (la web no tiene permiso de lectura
 * sobre la tabla de credenciales): hoy la pantalla lo dice, no inventa una dirección.
 */
export default async function PantallaMiCuenta({ searchParams }: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const sesion = await sesionActual();
  if (!sesion) return <MiCuentaSinSesion />;

  const motivo = motivoSinCanonico('app');
  if (motivo) return <MiCuentaError />;

  let fila: FilaPerfilCuenta | undefined;
  try {
    const filas = await ejecutaConsulta<FilaPerfilCuenta>(PERFIL_DE_LA_CUENTA, [sesion.userId]);
    fila = filas[0];
  } catch {
    return <MiCuentaError />;
  }
  if (!fila) return <MiCuentaError />;

  return <MiCuenta perfil={normalizaPerfil(fila)} correo={null}
    aviso={['preferencias','preferencias-error','origen','contrasena','contrasena-actual','contrasena-error','baja-error','perfil','perfil-error'].includes(aviso ?? '') ? aviso as 'preferencias' | 'preferencias-error' | 'origen' | 'contrasena' | 'contrasena-actual' | 'contrasena-error' | 'baja-error' | 'perfil' | 'perfil-error' : null} />;
}
