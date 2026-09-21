/**
 * La RETIRADA canónica: borrar con diario y poder deshacerlo.
 *
 * Estas pruebas son las que fijan la pieza que faltaba. Antes de la migración 0015 el diario sólo admitía
 * `insert` y `update`, así que un lote que borrara filas era **irreversible**: `revierteLote` lo habría dado
 * por revertido sin reponer nada, en silencio. Eso es exactamente lo que se comprueba aquí, y por eso la
 * prueba central compara la **huella lógica del ámbito** antes de retirar y después de revertir.
 *
 * Se saltan con aviso si no hay canónico. Todo ocurre sobre una cola SQLite SINTÉTICA, en un directorio
 * temporal y con una federación de pruebas propia: no tocan ninguna cola real ni ningún dato real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from '../src/origen/sqlite.js';
import { canonicoDisponible, creaPool, type ClienteCanonico, type PoolCanonico } from '../src/destino/pool.js';
import { importaFederacion } from '../src/lote.js';
import { revierteLote } from '../src/reversion.js';
import { aplicaRetirada, ordenaParaBorrar, type FilaARetirar } from '../src/retirada.js';

/* Federación propia: `lote.test.ts` usa «pruebas» y las dos suites se ejecutan a la vez. Compartir código
 * de federación haría que una limpiara el ámbito de la otra y las pruebas saldrían intermitentes. */
const FEDERACION = 'pruebas-retirada';

const ESQUEMA = `
create table temporadas (codigo text primary key, etiqueta text not null, origen text not null default 'web', comprobada_en text);
create table competiciones (temporada text not null, codigo text not null, nombre text not null, origen text not null default 'web', comprobada_en text, grupos_comprobados_en text, primary key (temporada, codigo));
create table grupos (temporada text not null, competicion text not null, codigo text not null, nombre text not null, estado text not null default 'presente', jornadas integer, comprobado_en text, jornadas_comprobadas_en text, primary key (temporada, competicion, codigo));
create table jornadas (temporada text not null, competicion text not null, grupo text not null, numero integer not null, fecha text, archivo text, hash text, comprobada_en text, primary key (temporada, competicion, grupo, numero));
create table equipos (temporada text not null, codigo text not null, nombre text not null, primera_jornada integer, primary key (temporada, codigo));
create table partidos (temporada text not null, competicion text not null, grupo text not null, jornada integer not null, orden integer not null, codigo_acta text, equipo_local_codigo text, equipo_visitante_codigo text, local text not null, visitante text not null, goles_local integer, goles_visitante integer, fecha text, hora text, campo text, campo_codigo text, arbitro text, actualizado_en text not null, primary key (temporada, competicion, grupo, jornada, orden));
create table actas (codigo text not null, temporada text not null, competicion text not null, grupo text not null, jornada integer not null, menores integer not null default 0, estado text not null, archivo text, hash text, datos text, comprobada_en text, version_parser integer not null default 0, calidad text, incidencias text, primary key (temporada, competicion, grupo, jornada, codigo));
create table participaciones (temporada text not null, competicion text not null, grupo text not null, jornada integer not null, acta text not null, lado text not null, condicion text not null, orden integer not null, jugador_codigo text, nombre text not null, dorsal integer, portero integer not null default 0, menores integer not null default 0, primary key (temporada, competicion, grupo, jornada, acta, lado, condicion, orden));
create table eventos_acta (temporada text not null, competicion text not null, grupo text not null, jornada integer not null, acta text not null, orden integer not null, tipo text not null, minuto integer, lado text, jugador_codigo text, nombre text, menores integer not null default 0, subtipo text, minuto_base integer, minuto_anadido integer, sujeto_tipo text, lado_beneficiado text, primary key (temporada, competicion, grupo, jornada, acta, orden));
create table tecnicos_acta (temporada text not null, competicion text not null, grupo text not null, jornada integer not null, acta text not null, lado text, rol text not null, nombre text not null, menores integer not null default 0, primary key (temporada, competicion, grupo, jornada, acta, lado, rol, nombre));
create table personas (codigo text primary key, nombre text not null, primera_acta text, ultima_acta text, actualizado_en text not null);
create table metadatos (clave text primary key, valor text not null);
`;

type Cola = { raiz: string; cierra: () => void };

/** Una jornada con dos partidos: es lo mínimo para tener partidos, inscripciones y procedencia (`match_source`). */
function creaCola(): Cola {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-retirada-'));
  mkdirSync(join(raiz, 'config'), { recursive: true });
  writeFileSync(join(raiz, 'config', 'federaciones-espana.json'), JSON.stringify({
    fuentes: [{ codigo: FEDERACION, nombre: 'Federación de Pruebas de Retirada', portal: 'https://ejemplo.test/', adaptador: 'pnfg', estado: 'activo' }],
  }));
  const carpeta = join(raiz, `descargas-${FEDERACION}`, 'recolector-local');
  mkdirSync(carpeta, { recursive: true });
  const db = new DatabaseSync(join(carpeta, 'cola-v2.sqlite'));
  db.exec(ESQUEMA);
  db.prepare("insert into metadatos (clave, valor) values ('version_esquema', '4')").run();
  db.prepare("insert into temporadas (codigo, etiqueta, comprobada_en) values ('21', '2025-26', '2026-09-01T00:00:00Z')").run();
  db.prepare(`insert into competiciones (temporada, codigo, nombre, comprobada_en, grupos_comprobados_en)
    values ('21', '900', 'LIGA DE PRUEBAS JUVENIL', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run();
  db.prepare(`insert into grupos (temporada, competicion, codigo, nombre, jornadas, comprobado_en, jornadas_comprobadas_en)
    values ('21', '900', '9001', 'GRUPO ÚNICO', 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run();
  db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21', 'E1', 'C.D. RIBERT \"A\"', 1)").run();
  db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21', 'E2', 'S.D. SAN JOSE \"B\"', 1)").run();
  db.prepare("insert into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en) values ('21','900','9001',1,'2026-09-06','j1.html','h1','2026-09-07T00:00:00Z')").run();
  db.prepare(`insert into partidos values ('21','900','9001',1,0,'A1','E1','E2','C.D. RIBERT "A"','S.D. SAN JOSE "B"',2,0,'2026-09-06','12:00','CAMPO DE PRUEBAS','C1','GARCÍA PÉREZ, LUIS','2026-09-07T00:00:00Z')`).run();
  db.prepare(`insert into partidos values ('21','900','9001',1,1,null,'E2','E1','S.D. SAN JOSE "B"','C.D. RIBERT "A"',null,null,'2026-09-06','13:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();
  db.prepare(`insert into actas values ('A1','21','900','9001',1,0,'hecha','acta-A1.html','ha','{}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();
  db.close();
  return { raiz, cierra: () => rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

async function conCliente<T>(pool: PoolCanonico, trabajo: (c: ClienteCanonico) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    return await trabajo(cliente);
  } finally {
    cliente.release();
  }
}

async function cuenta(pool: PoolCanonico, sql: string, parametros: unknown[] = []): Promise<number> {
  return conCliente(pool, async (c) => Number((await c.query<{ n: string }>(sql, parametros)).rows[0]?.n ?? 0));
}

/**
 * Todo lo que cuelga del ámbito, con la columna por la que se filtra. No es una lista decorativa: dejar una
 * tabla fuera hace que el borrado falle por clave foránea, y ahí se ve que `standing_snapshot` cuelga del
 * GRUPO (no del partido) mientras que las demás cuelgan del partido.
 */
const DEPENDIENTES: ReadonlyArray<{ tabla: string; porGrupo?: boolean }> = [
  { tabla: 'core.match_event' },
  { tabla: 'core.match_staff' },
  { tabla: 'core.match_official' },
  { tabla: 'core.appearance' },
  { tabla: 'core.match_report' },
  { tabla: 'core.match_source' },
  { tabla: 'core.standing_snapshot', porGrupo: true },
];

const TABLAS_DEL_PARTIDO: readonly string[] = DEPENDIENTES.map((d) => d.tabla);

/** Subconsulta del grupo, acotada por federación: el código de grupo se repite entre competiciones. */
const GRUPO = `in (select g.id from core.phase_group g
  join core.competition_edition e on e.id = g.competition_edition_id
  join core.federation f on f.id = e.federation_id
  where g.codigo_externo = $1 and f.codigo = $2)`;

/** El filtro de una tabla dependiente, en función de cómo cuelga del ámbito. */
const filtroDe = (tabla: string, porGrupo: boolean | undefined, grupo = true): string => {
  if (porGrupo) return `phase_group_id ${GRUPO}`;
  if (tabla === 'core.match') return `phase_group_id ${GRUPO}`;
  return `match_id in (select id from core.match where phase_group_id ${GRUPO})`;
};

/**
 * Huella LÓGICA del ámbito: las filas enteras de todo lo que la retirada toca, en orden y sin columnas de
 * auditoría. Es lo que permite decir «quedó igual» sin depender de cuándo se escribió.
 *
 * El orden va por el texto de la fila y no por `id`: `core.match_report` no tiene `id` —su clave es
 * `match_id`— y ordenar por una columna que no existe hace fallar la consulta entera.
 */
async function huellaDelAmbito(pool: PoolCanonico, grupo: string): Promise<string> {
  return conCliente(pool, async (c) => {
    const partes: string[] = [];
    for (const d of [{ tabla: 'core.team_entry', porGrupo: true }, { tabla: 'core.match', porGrupo: true }, ...DEPENDIENTES]) {
      const { rows } = await c.query<{ fila: unknown }>(
        `select to_jsonb(t) as fila from ${d.tabla} t where ${filtroDe(d.tabla, d.porGrupo)} order by to_jsonb(t)::text`,
        [grupo, FEDERACION],
      );
      partes.push(`${d.tabla}:${JSON.stringify(rows.map((r) => r.fila))}`);
    }
    return partes.join('\n');
  });
}

/** Las filas del ámbito que la retirada se llevaría: las inscripciones, sus partidos y TODO lo que cuelga de ellos. */
async function filasDelAmbito(pool: PoolCanonico, grupo: string): Promise<FilaARetirar[]> {
  return conCliente(pool, async (c) => {
    const filas: FilaARetirar[] = [];
    const { rows: entradas } = await c.query<{ fila: Record<string, unknown> }>(
      `select to_jsonb(t) as fila from core.team_entry t where phase_group_id ${GRUPO}`, [grupo, FEDERACION]);
    for (const e of entradas) filas.push({ tabla: 'core.team_entry', fila: e.fila });
    const { rows: partidos } = await c.query<{ fila: Record<string, unknown> }>(
      `select to_jsonb(t) as fila from core.match t where phase_group_id ${GRUPO}`, [grupo, FEDERACION]);
    for (const p of partidos) filas.push({ tabla: 'core.match', fila: p.fila });
    for (const d of DEPENDIENTES) {
      const { rows } = await c.query<{ fila: Record<string, unknown> }>(
        `select to_jsonb(t) as fila from ${d.tabla} t where ${filtroDe(d.tabla, d.porGrupo)}`,
        [grupo, FEDERACION]);
      for (const f of rows) filas.push({ tabla: d.tabla, fila: f.fila });
    }
    return filas;
  });
}

let pool: PoolCanonico | null = null;
let disponible = false;
let cola: Cola | null = null;

async function limpiaCanonico(): Promise<void> {
  if (!pool) return;
  await conCliente(pool, async (c) => {
    await c.query('begin');
    // Cada sentencia lleva sus parámetros: hay una que NO usa la federación (la de personas huérfanas) y
    // pasarle un parámetro de más hace que PostgreSQL rechace el `bind` entero.
    const sentencias: Array<[string, unknown[]]> = [
      [`delete from ops.batch_cambio where batch_id in (select id from ops.batch where federation_id = (select id from core.federation where codigo = $1))`, [FEDERACION]],
      [`delete from ops.normalizacion_error where batch_id in (select id from ops.batch where federation_id = (select id from core.federation where codigo = $1))`, [FEDERACION]],
      [`delete from core.match_event where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.match_staff where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.match_official where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.appearance where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.match_report where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.match_source where match_id in (select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.match where phase_group_id in (select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.standing_snapshot where phase_group_id in (select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.matchday where phase_group_id in (select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.team_entry where phase_group_id in (select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from ops.coverage_checkpoint where phase_group_id in (select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.phase_group where competition_edition_id in (select e.id from core.competition_edition e join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from source.external_ref where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from core.competition_edition where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from ops.batch where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from core.team_alias where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from core.person_name where person_id in (select p.id from core.person p join core.person_source_identity psi on psi.person_id = p.id join core.federation f on f.id = psi.federation_id where f.codigo = $1)`, [FEDERACION]],
      [`delete from core.person_source_identity where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from core.person where id not in (select person_id from core.person_source_identity)`, []],
      [`delete from core.team_season where club_id in (select id from core.club where federation_id = (select id from core.federation where codigo = $1))`, [FEDERACION]],
      [`delete from core.club where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
      [`delete from core.venue where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]],
    ];
    for (const [sql, parametros] of sentencias) await c.query(sql, parametros);
    await c.query('commit');
  });
}

beforeAll(async () => {
  const estado = await canonicoDisponible();
  disponible = estado.disponible;
  if (!disponible) {
    console.warn(`⚠️  Pruebas de retirada SALTADAS: no hay canónico disponible (${estado.motivo}).`);
    return;
  }
  pool = creaPool();
  await limpiaCanonico();
});

beforeEach(async () => {
  if (!pool) return;
  await limpiaCanonico();
  cola?.cierra();
  cola = creaCola();
  await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001', seco: false });
});

afterAll(async () => {
  cola?.cierra();
  if (pool) {
    await limpiaCanonico();
    await pool.end();
  }
});

describe('retirada canónica con diario', () => {
  it('retira la inscripción y sus partidos, y la REVERSIÓN los repone con la huella lógica idéntica', async () => {
    if (!disponible) return;
    const antes = await huellaDelAmbito(pool!, '9001');
    const filas = await filasDelAmbito(pool!, '9001');
    expect(filas.filter((f) => f.tabla === 'core.team_entry').length).toBe(2);
    expect(filas.filter((f) => f.tabla === 'core.match').length).toBe(2);
    expect(filas.filter((f) => f.tabla === 'core.match_source').length).toBeGreaterThan(0);

    const informe = await aplicaRetirada(pool!, {
      federacion: FEDERACION,
      motivo: 'prueba: inscripción fantasma de descanso y sus partidos',
      temporada: '2025-26', competicion: '900', grupo: '9001',
      filas,
    });
    expect(informe.borradas).toBe(filas.length);
    expect(informe.porTabla['core.team_entry']).toBe(2);
    expect(await cuenta(pool!, `select count(*) n from core.team_entry where phase_group_id ${GRUPO}`, ['9001', FEDERACION])).toBe(0);
    expect(await cuenta(pool!, `select count(*) n from core.match where phase_group_id ${GRUPO}`, ['9001', FEDERACION])).toBe(0);

    // El diario guarda la acción nueva y la fila ENTERA: sin ella no habría nada que reponer.
    const guardadas = await cuenta(pool!, `select count(*) n from ops.batch_cambio where batch_id = $1 and accion = 'borrado' and anterior is not null`, [informe.batchId]);
    expect(guardadas).toBe(filas.length);

    const reversion = await revierteLote(pool!, informe.batchId);
    expect(reversion.reinsertadas).toBe(filas.length);
    expect(reversion.fallos).toEqual([]);
    expect(await huellaDelAmbito(pool!, '9001')).toEqual(antes);
  });

  it('se NIEGA a retirar si la fila cambió desde que se preparó el lote', async () => {
    if (!disponible) return;
    const filas = await filasDelAmbito(pool!, '9001');
    const entrada = filas.find((f) => f.tabla === 'core.team_entry')!;
    // Se prepara el lote y, después, alguien cambia la fila: el lote tiene que darse cuenta.
    await conCliente(pool!, async (c) => {
      await c.query('update core.team_entry set nombre_en_fuente = $1 where id = $2', ['OTRO NOMBRE', Number(entrada.fila.id)]);
    });
    await expect(aplicaRetirada(pool!, { federacion: FEDERACION, motivo: 'prueba', filas }))
      .rejects.toThrow(/cambió desde que se preparó el lote/);
    // Y no ha borrado nada: la transacción entera se deshace.
    expect(await cuenta(pool!, `select count(*) n from core.team_entry where phase_group_id ${GRUPO}`, ['9001', FEDERACION])).toBe(2);
    // La comprobación va acotada a ESTA federación de pruebas: contar los `borrado` de toda la base incluiría
    // los de los lotes reales —la retirada del canónico de Euskadi dejó 3— y la aserción diría lo que no es.
    expect(await cuenta(pool!, `select count(*) n from ops.batch_cambio
      where accion = 'borrado' and batch_id in (
        select id from ops.batch where federation_id = (select id from core.federation where codigo = $1))`,
    [FEDERACION])).toBe(0);
  });

  it('se NIEGA a retirar una fila que ya no está: no borra «lo que haya»', async () => {
    if (!disponible) return;
    const filas = await filasDelAmbito(pool!, '9001');
    const hoja = filas.find((f) => f.tabla === 'core.match_report' || f.tabla === 'core.match_source');
    expect(hoja).toBeDefined();
    // `core.match_report` no tiene `id`: su clave es `match_id`. La retirada tiene que sacarla del catálogo.
    const clave = hoja!.tabla === 'core.match_report' ? { match_id: Number(hoja!.fila.match_id) } : { id: Number(hoja!.fila.id) };
    await conCliente(pool!, async (c) => {
      await c.query(`delete from ${hoja!.tabla} where ${Object.keys(clave)[0]} = $1`, [Object.values(clave)[0]]);
    });
    await expect(aplicaRetirada(pool!, { federacion: FEDERACION, motivo: 'prueba', filas: [hoja!] }))
      .rejects.toThrow(/la fila ya no está/);
  });

  it('una retirada sin motivo no se aplica: el diario tiene que poder explicarse', async () => {
    if (!disponible) return;
    const filas = await filasDelAmbito(pool!, '9001');
    await expect(aplicaRetirada(pool!, { federacion: FEDERACION, motivo: '   ', filas }))
      .rejects.toThrow(/necesita motivo/);
  });

  it('el orden de borrado lo pone la herramienta: los hijos antes que los padres', () => {
    const filas: FilaARetirar[] = [
      { tabla: 'core.team_entry', clave: { id: 1 }, fila: { id: 1 } },
      { tabla: 'core.match_source', clave: { id: 3 }, fila: { id: 3 } },
      { tabla: 'core.match', clave: { id: 2 }, fila: { id: 2 } },
    ];
    expect(ordenaParaBorrar(filas).map((f) => f.tabla)).toEqual(['core.match_source', 'core.match', 'core.team_entry']);
  });

  it('una tabla fuera del orden conocido DETIENE el lote en vez de colocarse en cualquier sitio', () => {
    expect(() => ordenaParaBorrar([{ tabla: 'core.tabla_inventada', clave: { id: 1 }, fila: { id: 1 } }]))
      .toThrow(/fuera del orden de borrado conocido/);
  });
});
