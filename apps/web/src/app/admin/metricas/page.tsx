import type { Metadata } from 'next';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { FalloAdmin } from '@/componentes/admin/FalloAdmin';
import { exigeAdministrador } from '@/lib/admin-servidor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Métricas web — Fondo Popular' };

type Fila = { ruta: string; visitas: number; ultima: string | null };

export default async function PaginaMetricas() {
  await exigeAdministrador();
  let filas: Fila[] = [];
  let hoy = 0;
  try {
    filas = await consulta<Fila>(`
      select ruta, count(*)::int visitas, max(creado_en)::text ultima
        from app.evento_web
       where creado_en > now() - interval '30 days'
       group by ruta
       order by visitas desc, ruta
       limit 50`, [], { rol: 'app' });
    const [total] = await consulta<{ n: string }>(
      "select count(*)::text n from app.evento_web where creado_en > now() - interval '1 day'", [], { rol: 'app' });
    hoy = Number(total?.n ?? 0);
  } catch {
    return <FalloAdmin que="las métricas" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="m-0 text-titulo font-bold text-[var(--texto)]">Métricas web</h1>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">Vistas por ruta en los últimos 30 días · {hoy} en las últimas 24 h. Sin cookies ni identidad.</p>
      </header>
      <div className="overflow-x-auto rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <table className="w-full border-collapse text-tabla">
          <caption className="sr-only">Rutas más vistas</caption>
          <thead><tr className="text-left text-etiqueta text-[var(--texto-suave)]"><th className="px-3 py-2 font-semibold">Ruta</th><th className="px-3 py-2 text-right font-semibold">Visitas</th><th className="px-3 py-2 text-right font-semibold">Última</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.ruta} className="border-t border-[var(--fondo-sutil)]">
                <th scope="row" className="max-w-[420px] truncate px-3 py-1.5 text-left font-medium text-[var(--texto)]">{f.ruta}</th>
                <td className="px-3 py-1.5 text-right tabular-nums">{f.visitas}</td>
                <td className="px-3 py-1.5 text-right text-etiqueta text-[var(--texto-suave)]">{f.ultima?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-[var(--texto-suave)]">Sin visitas registradas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
