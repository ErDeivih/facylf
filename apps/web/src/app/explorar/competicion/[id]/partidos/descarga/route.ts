import { notFound } from 'next/navigation';

import { GRUPO_POR_ID, PARTIDOS_CSV_DEL_GRUPO } from '@/consultas/competiciones';
import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';

/** CSV de los partidos jugados del grupo. Cabecera estable: fecha, jornada, local, visitante, goles, campo. */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) notFound();

  try {
    const [grupo, filas] = await Promise.all([
      consulta(GRUPO_POR_ID.sql, [numero]),
      consulta(PARTIDOS_CSV_DEL_GRUPO.sql, [numero], { presupuestoMs: PARTIDOS_CSV_DEL_GRUPO.presupuestoMs }),
    ]);
    if (!grupo[0]) notFound();

    const escapa = (valor: unknown) => {
      const texto = valor === null || valor === undefined ? '' : String(valor);
      return /[",;\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
    };
    const lineas = [
      'fecha;jornada;local;visitante;goles_local;goles_visitante;campo',
      ...filas.map((f) => [f.fecha, f.jornada, f.local, f.visitante, f.goles_local, f.goles_visitante, f.campo]
        .map(escapa).join(';')),
    ];
    // BOM para que Excel abra bien los acentos.
    const cuerpo = '\uFEFF' + lineas.join('\r\n') + '\r\n';
    const nombre = `${grupo[0].edicion} ${grupo[0].grupo}`.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
    return new Response(cuerpo, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="partidos-${nombre}.csv"`,
        'cache-control': 'public, max-age=300',
      },
    });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return new Response('canonico_no_disponible', { status: 503 });
    }
    throw error;
  }
}
