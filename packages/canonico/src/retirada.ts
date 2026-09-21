/**
 * Retirada de filas canónicas: borrar **con diario**, para poder deshacerlo.
 *
 * Por qué existe: el importador sólo sabe escribir y actualizar. Cuando la fuente deja de publicar algo —una
 * jornada que se corrige, un pseudo-equipo que era el bloque de descanso— el canónico se queda con filas que
 * ya no tienen origen, y la regla de la casa prohíbe borrarlas a mano. Esta pieza hace ese borrado de la
 * única forma admisible: dentro de una transacción, con cada fila ENTERA guardada en `ops.batch_cambio`
 * (`accion = 'borrado'`, migración 0015) y con `revierteLote` sabiendo reponerla.
 *
 * Tres cosas que NO hace, a propósito:
 *
 *   1. **No decide qué se retira.** La solicitud trae las filas, y vienen de un lote preparado y revisado
 *      —hoy, `scripts/preparar-lote-canonico-descansos.mjs`—. Decidir es de la herramienta que compara la
 *      cola con el HTML, no de ésta.
 *   2. **No borra a ciegas.** Antes de cada `delete` vuelve a leer la fila y la compara con la que el lote
 *      guardó: si cambió desde que se preparó, el lote SE DETIENE. Un lote que borra «lo que haya ahí» es un
 *      lote que borra otra cosa que la que revisó alguien.
 *   3. **No toca ni una fila fuera de las claves que le dan.** Cada `delete` va por la clave primaria y tiene
 *      que afectar exactamente a una fila; si afecta a cero, el lote se cae y la transacción se deshace.
 */
import type { PoolCanonico } from './destino/pool.js';
import { enTransaccion } from './destino/repositorio.js';
import { VERSION_NORMALIZADOR, VERSION_PARSER } from './lote.js';
import { ORDEN_DE_BORRADO } from './reversion.js';

/** Una fila canónica condenada, con todo lo necesario para borrarla y para reponerla. */
export type FilaARetirar = {
  /** `esquema.tabla`, tal y como aparece en el diario. */
  tabla: string;
  /**
   * Valores de la clave primaria. Es OPCIONAL a propósito: la clave real la lee `aplicaRetirada` del catálogo
   * y, si no se le da, la saca de la propia fila. Escribirla a mano invita al error que ya pasó una vez en
   * este trabajo: dar por hecho que todas las tablas se identifican con `id`, y `core.match_report` no tiene
   * `id` —su clave es `match_id`—.
   */
  clave?: Record<string, string | number>;
  /** La fila entera tal y como está AHORA. Es lo que la reversión vuelve a insertar. */
  fila: Record<string, unknown>;
  /** Por qué se retira esta fila. Va al diario para que dentro de un año se entienda sin abrir el informe. */
  motivo?: string;
};

export type SolicitudRetirada = {
  federacion: string;
  /** Motivo del lote. Obligatorio: un borrado sin motivo escrito es un borrado que nadie puede auditar. */
  motivo: string;
  /** Ámbito del que sale, para el cursor del lote. */
  temporada?: string;
  competicion?: string;
  grupo?: string;
  /** Las filas a retirar. Se ordenan solas por el orden de borrado; no hace falta que vengan ordenadas. */
  filas: readonly FilaARetirar[];
};

export type InformeRetirada = {
  batchId: number;
  borradas: number;
  porTabla: Record<string, number>;
  /** El detalle de lo que se ha borrado, para poder decirlo sin volver a mirar el diario. */
  detalle: Array<{ tabla: string; clave: Record<string, string | number>; motivo: string | null }>;
};

const TABLA_VALIDA = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

/**
 * Ordena las filas para borrarlas: primero los hijos. Una tabla que no esté en el orden conocido **detiene el
 * lote** en vez de colocarse en cualquier sitio: un borrado en el orden equivocado falla por clave foránea
 * —que es lo bueno— o pasa donde no debía —que es lo malo—.
 */
export function ordenaParaBorrar(filas: readonly FilaARetirar[]): FilaARetirar[] {
  /*
   * La comprobación va en una pasada propia y NO dentro del comparador: con una sola fila el comparador no
   * llega a ejecutarse nunca, y una tabla desconocida se colaría sin que nadie la mirara. Es el tipo de
   * agujero que sólo se ve cuando el lote lleva una fila —justo el caso pequeño y confiado—.
   */
  const conOrden = filas.map((fila) => {
    const indice = ORDEN_DE_BORRADO.indexOf(fila.tabla as (typeof ORDEN_DE_BORRADO)[number]);
    if (indice < 0) {
      throw new Error(`Tabla fuera del orden de borrado conocido: ${fila.tabla}. `
        + 'Añádela a ORDEN_DE_BORRADO antes de retirar nada de ahí.');
    }
    return { fila, indice };
  });
  return conOrden.sort((a, b) => a.indice - b.indice).map((x) => x.fila);
}

/** Clave primaria real de una tabla, leída del catálogo. No se acepta la que diga la solicitud. */
async function clavePrimaria(
  cliente: { query: (sql: string, valores?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  tabla: string,
): Promise<string[]> {
  const [esquema, nombre] = tabla.split('.') as [string, string];
  const { rows } = await cliente.query(
    `select a.attname
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
      where i.indisprimary and n.nspname = $1 and c.relname = $2
      order by array_position(i.indkey, a.attnum)`,
    [esquema, nombre],
  );
  if (rows.length === 0) throw new Error(`La tabla ${tabla} no tiene clave primaria: no se puede retirar una fila suya sin poder señalarla.`);
  return rows.map((r) => String(r.attname));
}

export async function aplicaRetirada(pool: PoolCanonico, solicitud: SolicitudRetirada): Promise<InformeRetirada> {
  if (!solicitud.motivo?.trim()) throw new Error('Una retirada necesita motivo: sin él, el diario no explica nada.');
  if (solicitud.filas.length === 0) throw new Error('La retirada no trae ninguna fila: un lote vacío no se aplica, se declara.');

  const plan = ordenaParaBorrar(solicitud.filas);
  const cliente = await pool.connect();
  try {
    return await enTransaccion(cliente, async () => {
      const { rows: federacion } = await cliente.query<{ id: number }>(
        'select id from core.federation where codigo = $1',
        [solicitud.federacion],
      );
      if (!federacion[0]) throw new Error(`No existe la federación «${solicitud.federacion}» en el canónico`);

      const cursor = [
        solicitud.temporada ? `temporada=${solicitud.temporada}` : null,
        solicitud.competicion ? `competicion=${solicitud.competicion}` : null,
        solicitud.grupo ? `grupo=${solicitud.grupo}` : null,
      ].filter(Boolean).join(';') || null;

      const { rows: lote } = await cliente.query<{ id: string }>(
        `insert into ops.batch (federation_id, sqlite_origen, cursor_hasta, parser_version, normalizador_version, estado)
         values ($1, $2, $3, $4, $5, 'en_curso') returning id`,
        [federacion[0].id, `retirada:${solicitud.motivo.slice(0, 200)}`, cursor, VERSION_PARSER, VERSION_NORMALIZADOR],
      );
      const batchId = Number(lote[0]!.id);

      const porTabla: Record<string, number> = {};
      const detalle: InformeRetirada['detalle'] = [];
      let borradas = 0;
      for (const pendiente of plan) {
        if (!TABLA_VALIDA.test(pendiente.tabla)) throw new Error(`Nombre de tabla no admisible: «${pendiente.tabla}»`);
        const columnasClave = await clavePrimaria(cliente, pendiente.tabla);
        const clavesPedidas = Object.keys(pendiente.clave ?? {});
        if (clavesPedidas.length > 0 && clavesPedidas.some((c) => !columnasClave.includes(c))) {
          throw new Error(`${pendiente.tabla}: la clave de la solicitud (${clavesPedidas.join(', ')}) `
            + `no es la clave primaria real (${columnasClave.join(', ')})`);
        }
        // La clave se toma de la clave si viene, y si no, de la propia fila: la verdad está en el catálogo.
        const clave: Record<string, string | number> = {};
        for (const c of columnasClave) {
          const valor = pendiente.clave?.[c] ?? pendiente.fila[c];
          if (valor === undefined || valor === null) {
            throw new Error(`${pendiente.tabla}: la fila no trae el valor de su clave «${c}», así que no se puede señalar qué se retira`);
          }
          clave[c] = valor as string | number;
        }
        const condicion = columnasClave.map((c, i) => `${c} = $${i + 1}`).join(' and ');
        const valoresClave = columnasClave.map((c) => clave[c] as string | number);

        const { rows: actuales } = await cliente.query<{ fila: Record<string, unknown> }>(
          `select to_jsonb(t) as fila from ${pendiente.tabla} t where ${condicion}`,
          valoresClave,
        );
        const actual = actuales[0]?.fila;
        if (!actual) {
          throw new Error(`${pendiente.tabla} (${JSON.stringify(clave)}): la fila ya no está. `
            + 'El lote se preparó sobre otro estado: vuelve a prepararlo en vez de retirar «lo que haya».');
        }
        /*
         * La comprobación que hace que esto sea un lote y no un `delete`: lo que hay AHORA tiene que ser lo
         * mismo que se revisó. Se comparan sólo las columnas que el lote guardó, porque son las que leyó.
         */
        const discrepancias = Object.keys(pendiente.fila).filter((c) => {
          const antes = pendiente.fila[c];
          const ahora = actual[c];
          if (antes === null || ahora === null) return (antes ?? null) !== (ahora ?? null);
          if (typeof antes === 'object' || typeof ahora === 'object') return JSON.stringify(antes) !== JSON.stringify(ahora);
          return String(antes) !== String(ahora);
        });
        if (discrepancias.length > 0) {
          throw new Error(`${pendiente.tabla} (${JSON.stringify(clave)}): la fila cambió desde que se `
            + `preparó el lote (${discrepancias.slice(0, 4).join(', ')}). No se retira nada.`);
        }

        // El diario se escribe ANTES del borrado: si el borrado falla, la transacción se deshace entera.
        await cliente.query(
          `insert into ops.batch_cambio (batch_id, tabla, accion, clave, anterior)
           values ($1, $2, 'borrado', $3::jsonb, $4::jsonb)`,
          [batchId, pendiente.tabla, JSON.stringify(clave), JSON.stringify(actual)],
        );
        const { rowCount } = await cliente.query(`delete from ${pendiente.tabla} where ${condicion}`, valoresClave);
        if (rowCount !== 1) throw new Error(`${pendiente.tabla} (${JSON.stringify(clave)}): el borrado afectó a ${rowCount ?? 0} filas y tenía que afectar a una`);
        borradas += 1;
        porTabla[pendiente.tabla] = (porTabla[pendiente.tabla] ?? 0) + 1;
        detalle.push({ tabla: pendiente.tabla, clave, motivo: pendiente.motivo ?? null });
      }

      await cliente.query(
        `update ops.batch set estado = 'validado', terminado_en = now(), filas_rechazadas = 0,
           validacion = $2::jsonb
         where id = $1`,
        [batchId, JSON.stringify({ retirada: { motivo: solicitud.motivo, filas: borradas, por_tabla: porTabla } })],
      );
      return { batchId, borradas, porTabla, detalle };
    });
  } finally {
    cliente.release();
  }
}
