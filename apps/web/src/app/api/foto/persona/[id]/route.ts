import { NextResponse } from 'next/server';
import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { fotoPermitida, modoDeFotos } from '@/lib/fotos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Foto de ficha de una persona: `GET /api/foto/persona/<personId>`.
 *
 * Sirve el registro VIGENTE de `core.person_asset` (0066). Si la instancia no publica fotos, si la
 * persona es menor y no se han pedido expresamente (`lib/fotos.ts`), si no hay foto o si la tabla
 * todavía no existe, responde 404 sin cuerpo: la ficha
 * pinta entonces las iniciales, que es lo que ya hacía.
 *
 * La caché es `private`: es la imagen de una persona, a menudo menor, y no debe quedarse en una caché
 * compartida entre el servidor y el navegador.
 */
const NO_HAY = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  if (modoDeFotos() === 'ninguna' || !/^\d{1,18}$/.test(crudo)) return NO_HAY();
  const personId = Number(crudo);
  if (!Number.isSafeInteger(personId) || personId <= 0 || motivoSinCanonico()) return NO_HAY();

  try {
    const [fila] = await consulta<{ mime_type: string; contenido: Buffer; es_menor: boolean | null }>(
      `select a.mime_type, a.contenido, p.es_menor
         from core.person_asset a
         join core.person p on p.id = a.person_id
        where a.person_id = $1 and a.tipo = 'foto' and a.vigente
          and exists (
            select 1 from core.appearance ap
              join core.team_entry te on te.id = ap.team_entry_id
              join core.phase_group g on g.id = te.phase_group_id
              join core.competition_edition e on e.id = g.competition_edition_id
              join core.federation f on f.id = e.federation_id
             where ap.person_id = p.id and (${SQL_FEDERACION_NO_EXCLUIDA})
          )
        order by a.observado_en desc
        limit 1`,
      [personId]);
    // La regla de menores se aplica también aquí, no sólo en la ficha: la URL se puede pedir a mano.
    if (fila === undefined || !fotoPermitida(fila.es_menor)) return NO_HAY();
    return new NextResponse(new Uint8Array(fila.contenido), {
      status: 200,
      headers: {
        'Content-Type': fila.mime_type,
        'Content-Length': String(fila.contenido.length),
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) return NO_HAY();
    // Antes de aplicar la 0066 la tabla no existe: no es un fallo de la ficha, es «no hay foto».
    if ((error as { code?: string } | null)?.code === '42P01') return NO_HAY();
    throw error;
  }
}
