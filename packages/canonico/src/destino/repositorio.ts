/**
 * Escrituras en el canónico: upserts por clave natural, contadores y diario de cambios.
 *
 *  · Claves naturales, no identificadores de origen: el destino gobierna el `on conflict`.
 *  · Nada se escribe por concatenación de cadenas: todas las consultas van parametrizadas y los
 *    nombres de tabla/columna salen de listas cerradas.
 *  · Cada fila tocada queda anotada en el diario del lote, para que `--revertir` pueda deshacerlo.
 */
import type { ClienteCanonico, PoolCanonico } from './pool.js';

export type Valores = Record<string, unknown>;
export type Contadores = Map<string, { insertadas: number; actualizadas: number }>;

/** Identificador de fila del canónico: los hechos usan `id`, las claves se expresan en jsonb. */
export type Clave = Record<string, string | number>;

export type Cambio = { tabla: string; accion: 'insert' | 'update'; clave: Clave; anterior: Valores | null };

export class Repositorio {
  private readonly cambios: Cambio[] = [];

  constructor(
    private readonly cliente: ClienteCanonico,
    private readonly batchId: number,
    private readonly contadores: Contadores,
    /**
     * `false` = modo masivo: no se mantiene el diario de cambios de este lote.
     *
     * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────────
     *
     * El diario existe para que `--revertir` pueda deshacer un lote: por cada fila tocada se lee la fila
     * anterior y se guarda entera. Es lo correcto para importar un grupo a mano y poder arrepentirse.
     *
     * Pero medido el 24/09/2026, con 242 grupos importados, `ops.batch_cambio` ocupaba **601 MB de una
     * base de 1.196 MB**: la mitad del canónico era diario. Y cargar los 28.382 grupos que esperan en las
     * colas habría sido decenas de gigas de diario que nadie va a revertir nunca — no se revierte un grupo
     * de benjamines de 2016.
     *
     * Con `false`: no se leen las filas anteriores (una consulta menos por tanda), no se acumulan cambios en
     * memoria y `persisteDiario()` no escribe nada. El lote sigue siendo UNA transacción: si algo falla, se
     * revierte entero igual que antes. Lo único que se pierde es poder deshacerlo DESPUÉS con `--revertir`,
     * así que el lote lo declara y `--revertir` se niega en vez de hacer como que revierte.
     */
    private readonly conDiario: boolean = true,
  ) {}

  get diario(): Cambio[] {
    return this.cambios;
  }

  /** ¿Este lote guarda diario? Lo declara quien lo cierra y lo consulta `--revertir`. */
  get guardaDiario(): boolean {
    return this.conDiario;
  }

  private cuenta(tabla: string, accion: 'insertadas' | 'actualizadas'): void {
    const actual = this.contadores.get(tabla) ?? { insertadas: 0, actualizadas: 0 };
    actual[accion] += 1;
    this.contadores.set(tabla, actual);
  }

  /** Fila que había antes con esa clave natural, para que la reversión pueda restaurarla. */
  private async leeAnterior(tabla: string, conflicto: string[], columnas: Valores, predicado?: string): Promise<Valores | null> {
    // Si alguna columna del conflicto es generada (por ejemplo `nombre_norm`) no está en `columnas`
    // y no se puede construir la condición: en ese caso el llamante debe pasar `anterior`.
    if (conflicto.some((c) => columnas[c] === undefined)) return null;
    const condicion = conflicto.map((c, i) => `${c} = $${i + 1}`).join(' and ');
    let rows: Valores[];
    try {
      ({ rows } = await this.cliente.query<Valores>(
        `select * from ${tabla} where ${condicion}${predicado ? ` and ${predicado}` : ''} limit 1`,
        conflicto.map((c) => columnas[c]),
      ));
    } catch (error) {
      throw new Error(`leeAnterior en ${tabla} (${conflicto.join(', ')}): ${error instanceof Error ? error.message : String(error)}`);
    }
    return rows[0] ?? null;
  }

  /**
   * Inserta o actualiza una fila por su clave natural y devuelve su `id`.
   *
   * `conflicto` son las columnas de la restricción única (pueden incluir una columna generada, como
   * `nombre_norm`, que no se inserta). `xmax = 0` distingue inserción de actualización sin consulta
   * previa; la fila que había antes se lee para el diario, que es lo que permite que `--revertir`
   * restaure en vez de borrar lo que el lote no creó.
   */
  async upsert(
    tabla: string,
    columnas: Valores,
    conflicto: string[],
    opciones: { devolver?: string; anterior?: Valores | null; predicado?: string; clavePrimaria?: string[] } = {},
  ): Promise<number> {
    const devolver = opciones.devolver ?? 'id';
    const nombres = Object.keys(columnas);
    if (nombres.length === 0) throw new Error(`upsert ${tabla}: sin columnas`);
    const valores = nombres.map((c) => columnas[c]);
    const marcadores = nombres.map((_, i) => `$${i + 1}`);
    const asignaciones = nombres
      .filter((c) => !conflicto.includes(c))
      .map((c) => `${c} = excluded.${c}`);
    // Un índice único PARCIAL sólo se puede usar como árbitro si el `on conflict` declara su mismo
    // predicado (es el caso de `person_source_identity`, con un índice para los que tienen código y
    // otro para los que no).
    const destino = `(${conflicto.join(', ')})${opciones.predicado ? ` where ${opciones.predicado}` : ''}`;
    const sql = `insert into ${tabla} (${nombres.join(', ')}) values (${marcadores.join(', ')})
      on conflict ${destino} do update set
        ${asignaciones.length ? asignaciones.join(', ') : `${nombres[0]} = excluded.${nombres[0]}`}
      returning ${devolver} as id, (xmax = 0) as insertada`;
    let rows: Array<{ id: string | number; insertada: boolean }>;
    try {
      ({ rows } = await this.cliente.query<{ id: string | number; insertada: boolean }>(sql, valores));
    } catch (error) {
      throw new Error(`upsert en ${tabla} (${conflicto.join(', ')})${opciones.predicado ? ` where ${opciones.predicado}` : ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const fila = rows[0];
    if (!fila) throw new Error(`upsert ${tabla}: la base no devolvió fila`);
    const id = Number(fila.id);
    // La clave del diario son las columnas de la clave PRIMARIA real, no siempre `id`: hay tablas
    // (core.match_report, core.standing_snapshot) cuya clave es otra, y suponer `id` hacía que el
    // borrado de la reversión fallara y, en cadena, que no se pudiera borrar nada que la referenciara.
    const clave = claveDelDiario(opciones.clavePrimaria ?? ['id'], columnas, id);
    if (fila.insertada) {
      this.cuenta(tabla, 'insertadas');
      this.cambios.push({ tabla, accion: 'insert', clave, anterior: null });
    } else {
      this.cuenta(tabla, 'actualizadas');
      const anterior = opciones.anterior ?? await this.leeAnterior(tabla, conflicto, columnas, opciones.predicado);
      this.cambios.push({ tabla, accion: 'update', clave, anterior });
    }
    return id;
  }

  /**
   * Inserta o actualiza muchas filas iguales de una vez, por tandas dentro del lote lógico.
   *
   * Antes de cada tanda se leen las filas que YA existían con esas claves naturales: así el diario
   * puede guardar sus valores anteriores y `--revertir` restaura en vez de borrar lo que no creó.
   */
  async upsertMasivo(
    tabla: string,
    filas: Array<{ valores: Valores; conflicto: string[]; clavePrimaria?: string[] }>,
    opciones: { devolver?: string; tamanoTanda?: number; columnasPrevias?: string[] } = {},
  ): Promise<number[]> {
    const devolver = opciones.devolver ?? 'id';
    const tamanoTanda = opciones.tamanoTanda ?? 500;
    const ids: number[] = [];
    for (let inicio = 0; inicio < filas.length; inicio += tamanoTanda) {
      const tanda = filas.slice(inicio, inicio + tamanoTanda);
      if (tanda.length === 0) continue;
      const conflicto = tanda[0]!.conflicto;
      const nombres = Object.keys(tanda[0]!.valores);
      /*
       * ── UNA CLAVE REPETIDA EN LA MISMA TANDA ROMPE EL INSERT MÚLTIPLE (17/11/2026) ──────────────────
       *
       * PostgreSQL rechaza `INSERT ... ON CONFLICT` cuando dos filas del mismo lote tienen la misma clave
       * («ON CONFLICT DO UPDATE command cannot affect row a second time»). Pasa cuando el acta lista dos
       * veces a la misma persona en el mismo partido: el grupo 24219109 de 2026-27 se quedaba sin importar
       * por esto. En ese caso se hace fila a fila, que sí resuelve duplicados sin ambigüedad.
       */
      const clavesDeTanda = tanda.map((f) => conflicto.map((c) => String(f.valores[c] ?? '')).join('|'));
      if (new Set(clavesDeTanda).size !== clavesDeTanda.length) {
        for (const f of tanda) {
          const id = await this.upsert(tabla, f.valores, f.conflicto, { devolver, clavePrimaria: f.clavePrimaria });
          ids.push(id);
        }
        continue;
      }
      // Filas que YA existían con esas claves naturales: son las que la reversión tendrá que
      // restaurar, así que sus valores anteriores se guardan en el diario.
      const previas = new Map<string, Valores>();
      if (this.conDiario && conflicto.every((c) => nombres.includes(c))) {
        const parametrosPrevios: unknown[] = [];
        const tuplas = tanda.map((fila) => {
          const base = parametrosPrevios.length;
          const marcadores = conflicto.map((_, i) => `$${base + i + 1}`);
          parametrosPrevios.push(...conflicto.map((c) => fila.valores[c]));
          return `(${marcadores.join(', ')})`;
        });
        const { rows: anteriores } = await this.cliente.query<Valores>(
          `select * from ${tabla} where (${conflicto.join(', ')}) in (${tuplas.join(', ')})`,
          parametrosPrevios,
        );
        for (const fila of anteriores) {
          previas.set(conflicto.map((c) => String(fila[c])).join('|'), fila);
        }
      }
      const parametros: unknown[] = [];
      const grupos: string[] = [];
      for (const fila of tanda) {
        // Los marcadores avanzan con el índice: si se usara sólo `parametros.length + 1`, las nueve
        // columnas de una fila compartirían el mismo `$1` y PostgreSQL rechazaría la consulta por
        // «inconsistent types deduced».
        const base = parametros.length;
        const marcadores = nombres.map((_, i) => `$${base + i + 1}`);
        parametros.push(...nombres.map((c) => fila.valores[c]));
        grupos.push(`(${marcadores.join(', ')})`);
      }
      const asignaciones = nombres
        .filter((c) => !conflicto.includes(c))
        .map((c) => `${c} = excluded.${c}`);
      const sql = `insert into ${tabla} (${nombres.join(', ')}) values ${grupos.join(', ')}
        on conflict (${conflicto.join(', ')}) do update set
          ${asignaciones.length ? asignaciones.join(', ') : `${nombres[0]} = excluded.${nombres[0]}`}
        returning ${devolver} as id, (xmax = 0) as insertada`;
      let filasDevueltas: Array<{ id: string | number; insertada: boolean }>;
      try {
        ({ rows: filasDevueltas } = await this.cliente.query<{ id: string | number; insertada: boolean }>(sql, parametros));
      } catch (error) {
        throw new Error(`upsertMasivo en ${tabla} (${conflicto.join(', ')}), tanda de ${tanda.length}: ${error instanceof Error ? error.message : String(error)}`);
      }
      for (let i = 0; i < filasDevueltas.length; i += 1) {
        const fila = filasDevueltas[i]!;
        const id = Number(fila.id);
        ids.push(id);
        if (!this.conDiario) { this.cuenta(tabla, fila.insertada ? 'insertadas' : 'actualizadas'); continue; }
        const valores = tanda[i]!.valores;
        const clave = claveDelDiario(tanda[i]!.clavePrimaria ?? conflicto, valores, id);
        if (fila.insertada) {
          this.cuenta(tabla, 'insertadas');
          this.cambios.push({ tabla, accion: 'insert', clave, anterior: null });
        } else {
          this.cuenta(tabla, 'actualizadas');
          const anterior = previas.get(conflicto.map((c) => String(valores[c])).join('|')) ?? null;
          this.cambios.push({ tabla, accion: 'update', clave, anterior });
        }
      }
    }
    return ids;
  }

  /**
   * Actualiza columnas concretas de una fila que YA existe, dejando en el diario el estado anterior.
   *
   * Hace falta cuando el valor correcto de una columna no se conoce al insertar la fila y sólo se
   * averigua más tarde dentro del mismo lote. El caso que lo motivó: `core.match.home_team_entry_id`
   * se escribe desde el calendario de la cola y sólo al leer el acta del partido se sabe si la pareja
   * de equipos del calendario es la que jugó de verdad. Un `upsert` no sirve aquí porque exigiría
   * reenviar todas las columnas `not null` de la fila, y un `update` sin diario rompería `--revertir`.
   *
   * `clave` son las columnas de la clave PRIMARIA real (no siempre `id`) con sus valores.
   */
  async actualiza(tabla: string, columnas: Valores, clave: Clave): Promise<void> {
    const nombres = Object.keys(columnas);
    if (nombres.length === 0) throw new Error(`actualiza ${tabla}: sin columnas`);
    const columnasClave = Object.keys(clave);
    if (columnasClave.length === 0) throw new Error(`actualiza ${tabla}: sin clave`);
    const valoresClave = columnasClave.map((c) => clave[c]);
    // Dos condiciones distintas sobre las mismas columnas de clave: la del `select` numera desde $1
    // y la del `update` desde detrás de las columnas que se escriben.
    const condicionSelect = columnasClave.map((c, i) => `${c} = $${i + 1}`).join(' and ');
    const condicionUpdate = columnasClave.map((c, i) => `${c} = $${nombres.length + i + 1}`).join(' and ');
    const { rows: previas } = this.conDiario
      ? await this.cliente.query<Valores>(`select * from ${tabla} where ${condicionSelect} limit 1`, valoresClave)
      : { rows: [] as Valores[] };
    const asignaciones = nombres.map((c, i) => `${c} = $${i + 1}`).join(', ');
    try {
      await this.cliente.query(
        `update ${tabla} set ${asignaciones} where ${condicionUpdate}`,
        [...nombres.map((c) => columnas[c]), ...valoresClave],
      );
    } catch (error) {
      throw new Error(`actualiza en ${tabla} (${columnasClave.join(', ')}): ${error instanceof Error ? error.message : String(error)}`);
    }
    this.cuenta(tabla, 'actualizadas');
    if (this.conDiario) this.cambios.push({ tabla, accion: 'update', clave, anterior: previas[0] ?? null });
  }

  /**
   * Inserta una fila SIN clave natural (no hay `on conflict` posible) y devuelve su `id`.
   *
   * Se usa sólo donde el modelo dice expresamente que no existe clave natural: `core.person`, donde
   * el nombre NO es identidad (dos personas distintas pueden llamarse igual). La idempotencia la
   * garantiza quien llama, que antes comprueba `person_source_identity`.
   */
  async inserta(tabla: string, columnas: Valores, devolver = 'id'): Promise<number> {
    const nombres = Object.keys(columnas);
    if (nombres.length === 0) throw new Error(`inserta ${tabla}: sin columnas`);
    const marcadores = nombres.map((_, i) => `$${i + 1}`);
    const { rows } = await this.cliente.query<{ id: string | number }>(
      `insert into ${tabla} (${nombres.join(', ')}) values (${marcadores.join(', ')}) returning ${devolver} as id`,
      nombres.map((c) => columnas[c]),
    );
    const id = Number(rows[0]?.id);
    if (!Number.isFinite(id)) throw new Error(`inserta ${tabla}: la base no devolvió id`);
    this.cuenta(tabla, 'insertadas');
    if (this.conDiario) this.cambios.push({ tabla, accion: 'insert', clave: { id }, anterior: null });
    return id;
  }

  /** Escribe el diario del lote en `ops.batch_cambio` (una vez, al cerrar el lote). */
  async persisteDiario(): Promise<number> {
    // En modo masivo no se escribe diario: ver el porqué en el constructor.
    if (!this.conDiario) return 0;
    const tamano = 1000;
    let escritos = 0;
    for (let inicio = 0; inicio < this.cambios.length; inicio += tamano) {
      const tanda = this.cambios.slice(inicio, inicio + tamano);
      const parametros: unknown[] = [];
      const grupos = tanda.map((c) => {
        const base = parametros.length;
        parametros.push(this.batchId, c.tabla, c.accion, JSON.stringify(c.clave), c.anterior ? JSON.stringify(c.anterior) : null);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::jsonb)`;
      });
      await this.cliente.query(
        `insert into ops.batch_cambio (batch_id, tabla, accion, clave, anterior) values ${grupos.join(', ')}`,
        parametros,
      );
      escritos += tanda.length;
    }
    return escritos;
  }
}

export function claveDe(clavesNaturales: string[], valores: Valores): string {
  return clavesNaturales.map((c) => `${c}=${String(valores[c])}`).join('|');
}

/** Clave del diario: los valores de la clave primaria real, tomados de la fila o del id devuelto. */
export function claveDelDiario(clavePrimaria: string[], columnas: Valores, idDevuelto: number): Clave {
  const clave: Clave = {};
  for (const columna of clavePrimaria) {
    const valor = columnas[columna];
    clave[columna] = (valor === undefined || valor === null) ? idDevuelto : (valor as string | number);
  }
  return clave;
}

/** Índice de filas previas por clave natural, para saber qué es inserción y qué es actualización. */
export function indexaPrevios(filas: Valores[], clavesNaturales: string[]): Map<string, Valores> {
  const mapa = new Map<string, Valores>();
  for (const fila of filas) mapa.set(claveDe(clavesNaturales, fila), fila);
  return mapa;
}

export async function enTransaccion<T>(cliente: ClienteCanonico, operacion: () => Promise<T>): Promise<T> {
  await cliente.query('begin');
  try {
    const salida = await operacion();
    await cliente.query('commit');
    return salida;
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  }
}

export async function conCliente<T>(pool: PoolCanonico, operacion: (cliente: ClienteCanonico) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    return await operacion(cliente);
  } finally {
    cliente.release();
  }
}
