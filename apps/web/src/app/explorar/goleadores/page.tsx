import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { RANKING_GOLEADORES, type FilaRanking } from '@/consultas/paneles';
import { SinCanonico } from '@/componentes/SinCanonico';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Goleadores — Fondo Popular' };

const CATEGORIAS = [
  ['aficionados', 'Aficionados'],
  ['juvenil', 'Juvenil'],
  ['cadete', 'Cadete'],
  ['infantil', 'Infantil'],
  ['alevin', 'Alevín'],
  ['benjamin', 'Benjamín'],
  ['prebenjamin', 'Prebenjamín'],
] as const;

/** Goleadores de una categoría concreta, nunca mezclando alevines con Tercera Federación. */
export default async function PantallaGoleadores({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const categoria = typeof p.categoria === 'string' && CATEGORIAS.some(([c]) => c === p.categoria)
    ? p.categoria : 'aficionados';
  let filas: FilaRanking[] = [];
  try {
    filas = await consulta<FilaRanking>(RANKING_GOLEADORES.sql,
      ['castilla-leon', '2026-27', categoria, null, null, 3, 200]);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return <SinCanonico titulo="Goleadores" motivo={error.message} />;
    throw error;
  }
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="m-0 text-titulo font-bold tracking-[-0.02em] text-[var(--texto)]">Goleadores</h1>
        <p className="m-0 mt-1 text-tabla text-[var(--texto-suave)]">
          Castilla y León · temporada 2026-27 · una categoría cada vez, con al menos 3 partidos.
        </p>
      </header>
      <nav aria-label="Categorías" className="flex flex-wrap gap-1.5">
        {CATEGORIAS.map(([clave, texto]) => (
          <Link key={clave} href={`/explorar/goleadores?categoria=${clave}` as Route}
            aria-current={clave === categoria ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-tabla font-semibold ${clave === categoria ? 'border-[var(--accion)] bg-[var(--accion)] text-[var(--texto-inverso)]' : 'border-[var(--borde)] bg-[var(--fondo-elevado)] text-[var(--texto)] hover:border-[var(--accion)]'}`}>
            {texto}
          </Link>
        ))}
      </nav>
      <section className="overflow-hidden rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)]">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de goleadores">
          <table className="w-full border-collapse text-tabla">
            <thead><tr className="text-left text-etiqueta text-[var(--texto-suave)]">
              <th scope="col" className="px-2 py-2 font-semibold">#</th>
              <th scope="col" className="px-2 py-2 font-semibold">Jugador</th>
              <th scope="col" className="px-2 py-2 font-semibold">Equipo / competición</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Goles</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-semibold md:table-cell">Partidos</th>
            </tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.persona_id}-${f.equipo_id}`} className="border-t border-[var(--fondo-sutil)]">
                  <td className="px-2 py-1.5 tabular-nums text-[var(--texto-suave)]">{f.posicion}</td>
                  <td className="px-2 py-1.5 text-[var(--texto)]">
                    <Link className="font-semibold hover:underline" href={`/explorar/jugador/${f.persona_id}` as Route}>{f.nombre}</Link>
                  </td>
                  <td className="px-2 py-1.5 text-etiqueta text-[var(--texto-suave)]">{f.equipo} · {f.edicion}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold text-[var(--texto)]">{f.goles}</td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums text-[var(--texto-suave)] md:table-cell">{f.partidos}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-[var(--texto-suave)]">Sin goleadores con 3 partidos en esta categoría.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
