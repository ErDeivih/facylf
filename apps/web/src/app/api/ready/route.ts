import { NextResponse } from 'next/server';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';

/** Disponibilidad real: la base de lectura responde. Para Docker/blackbox, no para el navegador. */
export async function GET() {
  try {
    const [fila] = await Promise.race([
      consulta<{ ok: number }>('select 1 as ok', [], { presupuestoMs: 800 }),
      new Promise<never>((_, rechaza) => setTimeout(() => rechaza(new Error('timeout')), 1_000)),
    ]);
    return NextResponse.json({ estado: fila?.ok === 1 ? 'listo' : 'degradado' }, {
      status: fila?.ok === 1 ? 200 : 503, headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ estado: 'no-disponible' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
