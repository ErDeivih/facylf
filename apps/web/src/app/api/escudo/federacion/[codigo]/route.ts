import { CanonicoNoDisponible, consulta, motivoSinCanonico } from '@/consultas/adaptadores/postgres/conexion';
import { escudoNoEncontrado, respuestaDeEscudo } from '@/lib/escudos-http';
import { esFederacionVisible } from '@/lib/federaciones-excluidas';

export const dynamic = 'force-dynamic';

/**
 * Escudo de federación: `GET /api/escudo/federacion/<codigo>`.
 *
 * Sirve el binario del registro VIGENTE de `core.federation_asset` (0056) buscando por el `codigo`
 * estable de `core.federation` («castilla-leon», «rfef»…), que es lo que ya usa el resto del producto;
 * no por el id interno, que no aparece en ninguna URL.
 *
 * Se lee con `facylf_lector`, que tiene SELECT desde la 0056. El texto de la consulta es fijo y el
 * código va como parámetro `$1`. El formato del código se valida antes: minúsculas, dígitos y guiones,
 * el mismo patrón que usa el resto del producto para los códigos de federación.
 */
const CODIGO_DE_FEDERACION = /^[a-z0-9-]{2,40}$/;

export async function GET(_peticion: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!CODIGO_DE_FEDERACION.test(codigo) || !esFederacionVisible(codigo)) return escudoNoEncontrado();

  const motivo = motivoSinCanonico();
  if (motivo) return Response.json({ motivo }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  try {
    const filas = await consulta<{ mime_type: string; contenido: Buffer }>(
      `select a.mime_type, a.contenido
         from core.federation_asset a
         join core.federation f on f.id = a.federation_id
        where f.codigo = $1 and a.tipo = 'escudo' and a.vigente
        order by a.observado_en desc
        limit 1`,
      [codigo]);
    const fila = filas[0];
    if (fila === undefined) return escudoNoEncontrado();
    return respuestaDeEscudo(fila);
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return Response.json({ motivo: error.message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    throw error;
  }
}
