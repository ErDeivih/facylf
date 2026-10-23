/**
 * Reversión de un lote: deja la base como estaba antes de importarlo.
 *
 * Se apoya en `ops.batch_cambio`, que guarda qué filas creó el lote y qué filas actualizó con sus
 * valores anteriores. El orden es el inverso al de escritura (hechos antes que catálogo) y las filas
 * de catálogo que otros lotes necesitan NO se borran: si una clave foránea lo impide, se conserva.
 */
import type { PoolCanonico } from './destino/pool.js';
import { enTransaccion } from './destino/repositorio.js';

export type InformeReversion = {
  batchId: number;
  borradas: number;
  restauradas: number;
  /**
   * Filas que el lote había RETIRADO y la reversión ha vuelto a insertar, con su `id`. Va aparte de
   * `restauradas` porque no es lo mismo: una restauración es un `update` sobre una fila que seguía ahí, y
   * esto es reinsertar una fila que ya no existía.
   */
  reinsertadas: number;
  conservadas: number;
  estado: string;
  /** Filas que no se han podido borrar ni reponer y por qué (normalmente las necesita otro lote). */
  fallos: Array<{ tabla: string; motivo: string }>;
};

/**
 * Orden de BORRADO: los hechos antes que el catálogo, y los hijos antes que los padres.
 *
 * Es el orden inverso al de escritura de un lote, y sirve para las dos direcciones de la vida de una fila:
 * al retirar se recorre tal cual —nada puede quedar apuntando a algo que ya no está— y al reponer se recorre
 * **al revés**, porque una clave foránea impide insertar un partido antes que su inscripción.
 */
export const ORDEN_DE_BORRADO = [
  'core.match_event',
  'core.match_staff',
  'core.match_official',
  'core.appearance',
  'core.match_report',
  'core.match_source',
  'core.standing_snapshot',
  'core.match',
  'core.team_alias',
  'core.team_entry',
  'core.team_season',
  'core.club',
  'core.person_name',
  'core.person_source_identity',
  'core.person',
  'core.venue',
  'core.matchday',
  'core.phase_group',
  'core.competition_edition',
  'core.season',
  'core.federation',
  'source.external_ref',
] as const;

/** Orden de ESCRITURA: el de borrado al revés. Es el que usa la reposición de una retirada. */
export const ORDEN_DE_ESCRITURA: readonly string[] = [...ORDEN_DE_BORRADO].reverse();

/** Sólo se aceptan nombres de tabla con forma `esquema.tabla`: el diario es una tabla y no se interpola a ciegas. */
const TABLA_VALIDA = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Columnas de una tabla que se pueden insertar explícitamente: fuera las GENERADAS (se recalculan solas) y
 * fuera las que no están en la fila guardada. Devuelve además si hay una identidad `ALWAYS`, porque entonces
 * la inserción necesita `overriding system value` para respetar el `id` que la fila tenía.
 */
async function columnasInsertables(
  cliente: { query: (sql: string, valores?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  tabla: string,
  disponibles: Set<string>,
  cache: Map<string, { columnas: string[]; identidadAlways: boolean }>,
): Promise<{ columnas: string[]; identidadAlways: boolean }> {
  const guardado = cache.get(tabla);
  if (guardado) return { columnas: guardado.columnas.filter((c) => disponibles.has(c)), identidadAlways: guardado.identidadAlways };
  const [esquema, nombre] = tabla.split('.') as [string, string];
  const { rows } = await cliente.query(
    `select a.attname, a.attgenerated, a.attidentity
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [esquema, nombre],
  );
  if (rows.length === 0) throw new Error(`La tabla ${tabla} no existe: el diario apunta a algo que no está.`);
  const columnas = rows.filter((r) => r.attgenerated === '').map((r) => String(r.attname));
  const identidadAlways = rows.some((r) => r.attidentity === 'a');
  cache.set(tabla, { columnas, identidadAlways });
  return { columnas: columnas.filter((c) => disponibles.has(c)), identidadAlways };
}

/** Vuelve a insertar una fila guardada en `anterior`, con su `id` y sin las columnas generadas. */
async function reinsertaFila(
  cliente: { query: (sql: string, valores?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  tabla: string,
  anterior: Record<string, unknown>,
  cache: Map<string, { columnas: string[]; identidadAlways: boolean }>,
): Promise<void> {
  if (!TABLA_VALIDA.test(tabla)) throw new Error(`Nombre de tabla no admisible en el diario: «${tabla}»`);
  const { columnas, identidadAlways } = await columnasInsertables(cliente, tabla, new Set(Object.keys(anterior)), cache);
  if (columnas.length === 0) throw new Error(`No hay ninguna columna reinsertable en ${tabla}`);
  const valores = columnas.map((c) => {
    const valor = anterior[c] ?? null;
    // Un `jsonb` vuelve como objeto o lista de JavaScript: hay que devolverlo como texto JSON, porque si no
    // node-postgres lo manda como literal de array de PostgreSQL.
    return valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : valor;
  });
  const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
  await cliente.query(
    `insert into ${tabla} (${columnas.join(', ')})${identidadAlways ? ' overriding system value' : ''} values (${marcadores})`,
    valores,
  );
}

export async function revierteLote(pool: PoolCanonico, batchId: number): Promise<InformeReversion> {
  const cliente = await pool.connect();
  try {
    return await enTransaccion(cliente, async () => {
      const { rows: lote } = await cliente.query<{ id: string; estado: string; federation_id: number; validacion: { diario?: string } | null }>(
        'select id, estado, federation_id, validacion from ops.batch where id = $1 for update',
        [batchId],
      );
      const fila = lote[0];
      if (!fila) throw new Error(`No existe el lote ${batchId}`);

      const { rows: cambios } = await cliente.query<{ tabla: string; accion: string; clave: Record<string, string | number>; anterior: Record<string, unknown> | null }>(
        'select tabla, accion, clave, anterior from ops.batch_cambio where batch_id = $1 order by id desc',
        [batchId],
      );
      if (cambios.length === 0 && fila.estado !== 'revertido') {
        // Se distingue el motivo. Un lote cargado con `--sin-diario` NUNCA tuvo diario, y decir que «lo
        // sustituyó un lote posterior» sería mentir sobre por qué no se puede revertir.
        throw new Error(fila.validacion?.diario === 'omitido'
          ? `El lote ${batchId} se importó con --sin-diario: no guarda diario de cambios, así que no se puede revertir. `
            + 'Si hay que deshacerlo, vuelve a importar el grupo (la importación es idempotente) o retíralo por ámbito.'
          : fila.validacion?.diario === 'podado'
            // 0049: la retención del diario (ops.poda_diario_lotes) lo borró por antiguo. Se dice así, no como
            // si lo hubiera sustituido otro lote.
            ? `El lote ${batchId} ya no tiene diario: se podó por antigüedad (retención de ops.batch_cambio, migración 0049). `
              + 'Para deshacerlo, retira el grupo por ámbito y vuelve a importarlo.'
            : `El lote ${batchId} no tiene diario: no se puede revertir con exactitud (lo sustituyó un lote posterior del mismo ámbito).`);
      }

      let borradas = 0;
      let restauradas = 0;
      let reinsertadas = 0;
      let conservadas = 0;
      const fallos: Array<{ tabla: string; motivo: string }> = [];
      const cacheColumnas = new Map<string, { columnas: string[]; identidadAlways: boolean }>();
      for (const tabla of ORDEN_DE_BORRADO) {
        const delTabla = cambios.filter((c) => c.tabla === tabla);
        if (delTabla.length === 0) continue;
        for (const cambio of delTabla) {
          // La clave del diario son las columnas reales de la clave primaria de esa tabla.
          const columnasClave = Object.keys(cambio.clave ?? {});
          if (columnasClave.length === 0) continue;
          const condicion = columnasClave.map((c, i) => `${c} = $${i + 1}`).join(' and ');
          const valoresClave = columnasClave.map((c) => cambio.clave[c]);
          if (cambio.accion === 'insert') {
            // Cada borrado va en su propio SAVEPOINT: en PostgreSQL un error aborta la transacción
            // entera, y aquí un fallo esperado (una clave foránea que lo necesita otro lote) no puede
            // tumbar la reversión completa.
            const punto = `rev_${tabla.replace(/\W/g, '_')}_${valoresClave.join('_')}`;
            await cliente.query(`savepoint ${punto}`);
            try {
              await cliente.query(`delete from ${tabla} where ${condicion}`, valoresClave);
              await cliente.query(`release savepoint ${punto}`);
              borradas += 1;
            } catch (error) {
              await cliente.query(`rollback to savepoint ${punto}`);
              conservadas += 1;
              if (fallos.length < 6) fallos.push({ tabla, motivo: error instanceof Error ? error.message : String(error) });
            }
          } else if (cambio.accion === 'update' && cambio.anterior) {
            // Se restauran las columnas guardadas menos la clave, el `id` y las GENERADAS: en este
            // esquema todas las columnas generadas terminan en `_norm` (club, equipo, alias, persona,
            // nombre de persona y campo) y PostgreSQL no deja asignarles un valor.
            const columnas = Object.keys(cambio.anterior)
              .filter((c) => !columnasClave.includes(c) && c !== 'id' && !c.endsWith('_norm'));
            if (columnas.length === 0) continue;
            const asignaciones = columnas.map((c, i) => `${c} = $${i + 1 + columnasClave.length}`).join(', ');
            await cliente.query(`update ${tabla} set ${asignaciones} where ${condicion}`,
              [
                ...valoresClave,
                // Un valor jsonb vuelve como objeto o lista de JavaScript; hay que devolverlo como
                // texto JSON, porque si no node-postgres lo manda como literal de array de PostgreSQL.
                ...columnas.map((c) => {
                  const valor = cambio.anterior?.[c] ?? null;
                  return valor !== null && typeof valor === 'object' ? JSON.stringify(valor) : valor;
                }),
              ]);
            restauradas += 1;
          }
        }
      }
      /*
       * ── Y las filas que el lote RETIRÓ, se vuelven a INSERTAR ────────────────────────────────────
       *
       * Va en una pasada aparte y en el orden de ESCRITURA —padres antes que hijos—, al revés que los
       * borrados: un partido no se puede insertar antes que la inscripción a la que apunta. Es la pieza que
       * hacía falta para que una retirada sea reversible; antes sólo se sabía deshacer lo insertado y lo
       * actualizado, y un borrado con el diario viejo se quedaba sin deshacer en silencio.
       */
      for (const tabla of ORDEN_DE_ESCRITURA) {
        const retiradas = cambios.filter((c) => c.tabla === tabla && c.accion === 'borrado');
        if (retiradas.length === 0) continue;
        for (const cambio of retiradas) {
          if (!cambio.anterior) {
            if (fallos.length < 6) fallos.push({ tabla, motivo: 'el diario no guardó la fila entera: no hay nada que reponer' });
            continue;
          }
          const punto = `rep_${tabla.replace(/\W/g, '_')}_${String(cambio.clave?.id ?? '')}`;
          await cliente.query(`savepoint ${punto}`);
          try {
            await reinsertaFila(cliente, tabla, cambio.anterior, cacheColumnas);
            await cliente.query(`release savepoint ${punto}`);
            reinsertadas += 1;
          } catch (error) {
            await cliente.query(`rollback to savepoint ${punto}`);
            if (fallos.length < 6) fallos.push({ tabla, motivo: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      await cliente.query('delete from ops.batch_cambio where batch_id = $1', [batchId]);
      await cliente.query("update ops.batch set estado = 'revertido', terminado_en = now() where id = $1", [batchId]);
      return { batchId, borradas, restauradas, reinsertadas, conservadas, estado: 'revertido', fallos };
    });
  } finally {
    cliente.release();
  }
}

export type EstadoLotes = {
  lotes: Array<{ id: number; federacion: string; cursor: string | null; estado: string; iniciado: string; insertadas: number; actualizadas: number; rechazadas: number }>;
  cobertura: Array<{ grupo: string; partidos: number; con_resultado: number; actas_parseadas: number; hasta_jornada: number | null; visibilidad: string }>;
};

export async function estadoLotes(pool: PoolCanonico, federacion?: string): Promise<EstadoLotes> {
  const cliente = await pool.connect();
  try {
    const { rows: lotes } = await cliente.query(
      `select b.id, f.codigo as federacion, b.cursor_hasta as cursor, b.estado, b.iniciado_en as iniciado,
         b.filas_insertadas as insertadas, b.filas_actualizadas as actualizadas, b.filas_rechazadas as rechazadas
       from ops.batch b join core.federation f on f.id = b.federation_id
       ${federacion ? 'where f.codigo = $1' : ''}
       order by b.id desc limit 40`,
      federacion ? [federacion] : [],
    );
    const { rows: cobertura } = await cliente.query(
      `select g.codigo_externo as grupo, c.jornadas_cerradas as partidos, c.partidos_con_resultado as con_resultado,
         c.actas_parseadas, c.complete_through_matchday as hasta_jornada, c.visibility_state as visibilidad
       from ops.coverage_checkpoint c join core.phase_group g on g.id = c.phase_group_id
       order by c.calculado_en desc limit 40`,
    );
    return { lotes: lotes as EstadoLotes['lotes'], cobertura: cobertura as EstadoLotes['cobertura'] };
  } finally {
    cliente.release();
  }
}
