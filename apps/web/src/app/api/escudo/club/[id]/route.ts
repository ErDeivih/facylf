import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { escudoNoEncontrado, respuestaDeEscudo } from '@/lib/escudos-http';

export const dynamic = 'force-dynamic';

/**
 * Escudo de club: `GET /api/escudo/club/<clubId>`.
 *
 * Sirve el binario del registro VIGENTE de `core.club_asset` (`tipo='escudo'`). El escudo pertenece al
 * club, no al equipo-temporada, así que la misma URL vale para todas sus temporadas.
 *
 * Se lee con el rol de lectura de la web (`facylf_lector`), que tiene SELECT sobre la tabla desde la
 * 0017: no hace falta el publicador para leer un binario público. El texto de la consulta es fijo y el
 * id va como parámetro `$1`: aquí no se interpola SQL.
 *
 * Un id que no es un entero positivo es un 404, no un 400 con explicación: la ruta sólo existe para
 * escudos que existen, y el `<img>` no enseña cuerpos de error.
 */
function idDeClub(crudo: string): number | null {
  if (!/^\d{1,18}$/.test(crudo)) return null;
  const id = Number(crudo);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: crudo } = await params;
  const clubId = idDeClub(crudo);
  if (clubId === null) return escudoNoEncontrado();

  const motivo = motivoSinCanonico();
  if (motivo) return Response.json({ motivo }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  try {
    const filas = await consulta<{ mime_type: string; contenido: Buffer }>(
      `select mime_type, contenido
         from core.club_asset
        where club_id = $1 and tipo = 'escudo' and vigente
        order by observado_en desc
        limit 1`,
      [clubId]);
    const fila = filas[0];
    if (fila === undefined) return escudoNoEncontrado();
    return respuestaDeEscudo(fila);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      console.error('[escudo] fallo:', error instanceof Error ? error.message : error);
      return Response.json({ motivo: 'No se ha podido cargar el escudo.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    throw error;
  }
}
