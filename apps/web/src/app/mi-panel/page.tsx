import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PanelAccesos } from '@/componentes/mi-panel/PanelAccesos';
import type { FilaAcceso } from '@/consultas/usuario';
import { misAccesos } from '@/lib/cuentas-db';
import { sesionActual } from '@/lib/sesion';

/**
 * «Mi panel»: lo que sigue la cuenta, con el último resultado y el próximo partido de cada favorito.
 *
 * La sesión se resuelve en el servidor y el `user_id` sale de la cookie, nunca de la URL. Sin sesión
 * se va a `/entrar`; si la base no responde se dice, no se pinta un panel vacío que parecería que el
 * usuario no sigue nada.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mi panel — Fondo Popular',
};

export default async function MiPanel() {
  const sesion = await sesionActual();
  if (!sesion) redirect('/entrar?aviso=sesion');

  let accesos: FilaAcceso[] = [];
  let error = false;
  try {
    accesos = await misAccesos(sesion.userId);
  } catch {
    error = true;
  }

  return <PanelAccesos nombre={sesion.nombre} accesos={accesos} error={error} />;
}
