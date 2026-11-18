import { NextResponse } from 'next/server';

/** Sonda de vida para Docker/Coolify. No consulta la base: sólo dice que el proceso Next responde. */
export function GET() {
  return NextResponse.json({ estado: 'ok', servicio: 'fondo-popular' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
