import { NextResponse } from 'next/server';
import { buscarGlobal } from '@/lib/busqueda';
import { federacionDesde } from '@/lib/repositorio-local';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const fedParam = searchParams.get('federacion');
  const federacion = !fedParam || fedParam === 'todas' ? 'todas' : federacionDesde(fedParam);
  const resultado = buscarGlobal(q, { porTipo: 6, federacion });
  return NextResponse.json(resultado);
}
