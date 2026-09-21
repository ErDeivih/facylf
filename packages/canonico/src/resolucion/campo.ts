/**
 * Campos (venues).
 *
 * §3 de IMPORTADOR-SQLITE.md: `partidos.campo` es texto y `campo_codigo` falta en la mayoría de los
 * partidos (658 de 2.725 en Canarias tienen código). El venue se resuelve por código cuando existe y
 * por nombre normalizado DENTRO de la federación cuando no. Un campo sin nombre no crea fila.
 */
import type { ClienteCanonico } from '../destino/pool.js';
import type { Repositorio } from '../destino/repositorio.js';
import type { Normalizador } from './contexto.js';

export async function resuelveCampo(
  cliente: ClienteCanonico,
  repo: Repositorio,
  normalizador: Normalizador,
  datos: { federacionId: number; nombre: string | null; codigo: string | null },
): Promise<number | null> {
  const nombre = String(datos.nombre ?? '').trim();
  const codigo = String(datos.codigo ?? '').trim();
  if (nombre === '' && codigo === '') return null;

  if (codigo !== '') {
    const { rows } = await cliente.query<{ id: string }>(
      'select id from core.venue where federation_id = $1 and codigo_externo = $2',
      [datos.federacionId, codigo],
    );
    if (rows[0]) return Number(rows[0].id);
    return repo.upsert(
      'core.venue',
      { federation_id: datos.federacionId, codigo_externo: codigo, nombre: nombre === '' ? codigo : nombre, municipio: null },
      ['federation_id', 'codigo_externo'],
    );
  }

  const norm = await normalizador.normaliza(nombre);
  const { rows } = await cliente.query<{ id: string }>(
    'select id from core.venue where federation_id = $1 and nombre_norm = $2 and codigo_externo is null',
    [datos.federacionId, norm],
  );
  if (rows[0]) return Number(rows[0].id);
  return repo.upsert(
    'core.venue',
    { federation_id: datos.federacionId, codigo_externo: null, nombre, municipio: null },
    ['federation_id', 'nombre_norm'],
    // El índice único del campo sin código es PARCIAL (migración 0010): el árbitro del conflicto
    // tiene que declarar el mismo predicado.
    { predicado: 'codigo_externo is null' },
  );
}
