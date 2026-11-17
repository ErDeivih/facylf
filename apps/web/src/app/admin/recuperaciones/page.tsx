import type { Metadata } from 'next';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { FalloAdmin } from '@/componentes/admin/FalloAdmin';
import { exigeAdministrador } from '@/lib/admin-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Recuperaciones — Fondo Popular' };

export default async function Recuperaciones() {
  await exigeAdministrador();
  let filas: { id: string; correo_sha: string; creado_en: string }[] = [];
  try {
    filas = await consulta(`
      select id::text, correo_sha, creado_en::text
        from app.recuperacion_solicitud
       where atendida_en is null
       order by creado_en asc limit 200`, [], { rol: 'app' });
  } catch {
    return <FalloAdmin que="las recuperaciones" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-titulo font-bold text-[var(--texto)]">Recuperaciones pendientes</h1>
      <p className="m-0 text-tabla text-[var(--texto-suave)]">Solicitudes sin atender. El correo no se guarda en claro; el SHA-256 permite localizarlo en la ficha de la cuenta.</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {filas.map((f) => (
          <li key={f.id} className="rounded-[var(--radius-control)] border border-[var(--borde)] bg-[var(--fondo-elevado)] px-3 py-2 text-tabla">
            <code className="break-all text-etiqueta text-[var(--texto-suave)]">{f.correo_sha}</code>
            <span className="ml-2 text-nota text-[var(--texto-suave)]">{f.creado_en.slice(0, 16).replace('T', ' ')}</span>
          </li>
        ))}
        {filas.length === 0 && <li className="text-tabla text-[var(--texto-suave)]">No hay solicitudes pendientes.</li>}
      </ul>
    </div>
  );
}
