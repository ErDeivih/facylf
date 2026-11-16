/**
 * Pruebas obligatorias de §9 del encargo, contra un PostgreSQL real.
 *
 * Se saltan con aviso si no hay canónico disponible. Todo ocurre sobre una cola SQLite SINTÉTICA en
 * un directorio temporal y una federación de pruebas: no tocan ninguna cola real ni ningún dato real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from '../src/origen/sqlite.js';
import { canonicoDisponible, creaPool, type PoolCanonico } from '../src/destino/pool.js';
import { importaFederacion } from '../src/lote.js';
import { revierteLote } from '../src/reversion.js';

const FEDERACION = 'pruebas';

/* ---------- cola sintética ---------- */

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

type ColaSintetica = { raiz: string; db: DatabaseSync; cierra: () => void };

function creaCola(): ColaSintetica {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-canonico-'));
  mkdirSync(join(raiz, 'config'), { recursive: true });
  writeFileSync(join(raiz, 'config', 'federaciones-espana.json'), JSON.stringify({
    fuentes: [{ codigo: FEDERACION, nombre: 'Federación de Pruebas', portal: 'https://ejemplo.test/', adaptador: 'pnfg', estado: 'activo' }],
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
    values ('21', '900', '9001', 'GRUPO ÚNICO', 2, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run();
  db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21', 'E1', 'C.D. RIBERT \"A\"', 1)").run();
  db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21', 'E2', 'S.D. SAN JOSE \"B\"', 1)").run();
  return {
    raiz,
    db,
    cierra: () => { db.close(); rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); },
  };
}

/** Dos jornadas: J1 con dos partidos (uno con resultado y acta completa, otro sin resultado) y J2 vacía. */
function siembraBase(cola: ColaSintetica): void {
  const { db } = cola;
  db.prepare("insert into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en) values ('21','900','9001',1,'2026-09-06','j1.html','h1','2026-09-07T00:00:00Z')").run();
  db.prepare("insert into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en) values ('21','900','9001',2,'2026-09-13','j2.html','h2','2026-09-14T00:00:00Z')").run();
  // Partido 0: con resultado y con acta completa (marcador 2-0 y dos goles en los eventos).
  db.prepare(`insert into partidos values ('21','900','9001',1,0,'A1','E1','E2','C.D. RIBERT "A"','S.D. SAN JOSE "B"',2,0,'2026-09-06','12:00','CAMPO DE PRUEBAS','C1','GARCÍA PÉREZ, LUIS','2026-09-07T00:00:00Z')`).run();
  // Partido 1: SIN resultado (NULL nunca se convierte en 0).
  db.prepare(`insert into partidos values ('21','900','9001',1,1,null,'E2','E1','S.D. SAN JOSE "B"','C.D. RIBERT "A"',null,null,'2026-09-13',null,null,null,null,'2026-09-07T00:00:00Z')`).run();
  db.prepare(`insert into actas values ('A1','21','900','9001',1,0,'hecha','acta-A1.html','ha','{}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();
  // Personas: dos jugadores con el MISMO nombre y códigos distintos (no se fusionan).
  // `orden` forma parte de la clave primaria de `participaciones`, así que cada uno lleva el suyo.
  const jugadores = [['J1', 'GARCÍA LÓPEZ, DANIEL'], ['J2', 'GARCÍA LÓPEZ, DANIEL']] as const;
  jugadores.forEach(([codigo, nombre], orden) => {
    db.prepare("insert into personas (codigo, nombre, primera_acta, ultima_acta, actualizado_en) values (?,?,'A1','A1','2026-09-07T00:00:00Z')").run(codigo, nombre);
    db.prepare("insert into participaciones values ('21','900','9001',1,'A1','local','titulares',?,?,?,8,0,0)").run(orden, codigo, nombre);
  });
  db.prepare("insert into participaciones values ('21','900','9001',1,'A1','visitante','suplentes',0,'J3','PÉREZ RUIZ, ANA',7,0,1)").run();
  // Dos goles que cuadran con el 2-0.
  db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',0,'gol',12,'local','J1','GARCÍA LÓPEZ, DANIEL',0,'normal',12,null,'jugador','local')`).run();
  db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',1,'gol',30,'local','J2','GARCÍA LÓPEZ, DANIEL',0,'penalti',30,null,'jugador','local')`).run();
  db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',2,'amarilla',44,'visitante','J3','PÉREZ RUIZ, ANA',1,null,null,null,'jugador',null)`).run();
  db.prepare("insert into tecnicos_acta values ('21','900','9001',1,'A1','local','2ºEntrenador','MARTÍN SOSA, LUIS',0)").run();
}

function insertaJornada2(cola: ColaSintetica): void {
  cola.db.prepare(`insert into partidos values ('21','900','9001',2,0,'A2','E1','E2','C.D. RIBERT "A"','S.D. SAN JOSE "B"',1,0,'2026-09-13','12:00','OTRO CAMPO',null,'SUÁREZ DÍAZ, MARTA','2026-09-14T00:00:00Z')`).run();
  cola.db.prepare(`insert into actas values ('A2','21','900','9001',2,0,'hecha','acta-A2.html','hb','{}','2026-09-14T00:00:00Z',19,'revisar','[\"sin_alineaciones\",\"descuadre_goles:1/0\"]')`).run();
  cola.db.prepare(`insert into eventos_acta values ('21','900','9001',2,'A2',0,'gol',5,'local','J1','GARCÍA LÓPEZ, DANIEL',0,'propia-puerta',5,null,'jugador','visitante')`).run();
  cola.db.prepare("insert into participaciones values ('21','900','9001',2,'A2','local','convocados',0,'J1','GARCÍA LÓPEZ, DANIEL',null,0,0)").run();
}

/* ---------- utilidades sobre el canónico ---------- */

async function cuenta(pool: PoolCanonico, sql: string, parametros: unknown[] = []): Promise<number> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ n: string }>(sql, parametros);
    return Number(rows[0]?.n ?? 0);
  } finally {
    cliente.release();
  }
}

/** Primera fila de una consulta, para las comprobaciones que no son un recuento. */
async function fila<T extends Record<string, unknown>>(pool: PoolCanonico, sql: string, parametros: unknown[] = []): Promise<T | undefined> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<T>(sql, parametros);
    return rows[0];
  } finally {
    cliente.release();
  }
}

/** Vacía TODO lo que la federación de pruebas haya podido escribir, en orden inverso de dependencias. */
async function limpiaCanonico(pool: PoolCanonico): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(`delete from core.match_event where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.match_staff where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.match_official where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.appearance where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.match_report where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.match_source where match_id in (
        select m.id from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.match where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.standing_snapshot where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.matchday where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    // Los agregados de `analytics` cuelgan de `team_entry` y de `person` SIN cascada (migración 0005).
    // Los escribe la proyección de lectura, que también proyecta los grupos de pruebas si han quedado
    // restos de una ejecución que falló: entonces borrar la inscripción falla con
    // `team_edition_summary_team_entry_id_fkey` y la limpieza no puede volver nunca al estado limpio
    // (medido el 04/11/2026). Van antes que la inscripción y que la persona.
    await cliente.query(`delete from analytics.player_team_season_summary where team_entry_id in (
        select te.id from core.team_entry te join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from analytics.team_edition_summary where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from analytics.player_career_summary where person_id in (
        select psi.person_id from core.person_source_identity psi
        join core.federation f on f.id = psi.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.team_entry where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from ops.coverage_checkpoint where phase_group_id in (
        select g.id from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.phase_group where competition_edition_id in (
        select e.id from core.competition_edition e join core.federation f on f.id = e.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from source.external_ref where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    // Los avisos de normalización cuelgan del lote (sin cascada a propósito: son historial), así que
    // van antes que los lotes.
    await cliente.query(`delete from ops.normalizacion_error where batch_id in (
        select id from ops.batch where federation_id = (select id from core.federation where codigo = $1))`, [FEDERACION]);
    await cliente.query(`delete from core.competition_edition where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from ops.batch where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    // Alias de equipo y personas: son los que bloquean el borrado de `team_season` y `person`.
    await cliente.query(`delete from core.team_alias where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.person_name where person_id in (
        select p.id from core.person p join core.person_source_identity psi on psi.person_id = p.id
        join core.federation f on f.id = psi.federation_id where f.codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.person_source_identity where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    // Las personas que se han quedado sin identidad, con `not exists` y NO con `not in (select …)`.
    // `not in` sobre un subplan con millones de filas no se hashea (sale un `Materialize` que se
    // reejecuta por fila): en el canónico real, con 2,28 M de personas, la limpieza pasaba de varios
    // minutos y agotaba el `hookTimeout` de la suite. `not exists` planifica como anti-join hasheado
    // y tarda ~1 s. Medido el 04/11/2026; el detalle está en `INFORME-PRUEBAS.md`.
    await cliente.query(`delete from core.person p where not exists (
        select 1 from core.person_source_identity psi where psi.person_id = p.id)`, []);
    await cliente.query(`delete from core.team_season where club_id in (select id from core.club where federation_id = (select id from core.federation where codigo = $1))`, [FEDERACION]);
    await cliente.query(`delete from core.club where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    await cliente.query(`delete from core.venue where federation_id = (select id from core.federation where codigo = $1)`, [FEDERACION]);
    await cliente.query('commit');
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/* ---------- suite ---------- */

let pool: PoolCanonico | null = null;
let disponible = false;

beforeAll(async () => {
  const estado = await canonicoDisponible();
  disponible = estado.disponible;
  if (!disponible) {
    console.warn(`⚠️  Pruebas del importador SALTADAS: no hay canónico disponible (${estado.motivo}). Ejecuta pnpm db:arrancar && pnpm db:migrar.`);
    return;
  }
  pool = creaPool();
  await limpiaCanonico(pool);
});

beforeEach(async () => {
  // Cada prueba parte de un canónico limpio para SU federación: si no, los restos de una prueba
  // anterior harían pasar (o fallar) afirmaciones sobre recuentos que no le corresponden.
  if (pool) await limpiaCanonico(pool);
});

afterAll(async () => {
  if (pool) {
    await limpiaCanonico(pool);
    await pool.end();
  }
});

describe.skipIf(!process.env.DATABASE_URL_PUBLICADOR)('importador · §9 pruebas obligatorias', () => {
  it('1. idempotencia: de cero, dos veces y por mitades dan el mismo estado', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      const opciones = { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' };
      const primera = await importaFederacion(pool, opciones);
      expect(primera[0]!.validacion.ok).toBe(true);
      const partidosTrasPrimera = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      // Segunda pasada: mismo estado, cero inserciones.
      const segunda = await importaFederacion(pool, opciones);
      const insertadas = Object.values(segunda[0]!.contadores).reduce((s, c) => s + c.insertadas, 0);
      expect(insertadas).toBe(0);
      expect(partidosTrasPrimera).toBe(2);

      // Por mitades: se añade la jornada 2 y se vuelve a importar; el estado final es el de una
      // importación completa de las dos jornadas.
      insertaJornada2(cola);
      const tercera = await importaFederacion(pool, opciones);
      expect(tercera[0]!.validacion.ok).toBe(true);
      expect(tercera[0]!.cobertura.partidos_conocidos).toBe(3);
      expect(tercera[0]!.cobertura.partidos_con_resultado).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('2. recuentos: cuadran con la cola de origen para el grupo importado', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      insertaJornada2(cola);
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informe!.validacion.diferencias).toEqual([]);
      expect(informe!.recuentosOrigen.partidos).toBe(3);
      expect(informe!.recuentosOrigen.participaciones).toBe(4);
      expect(informe!.recuentosOrigen.eventos).toBe(4);
      expect(informe!.cobertura.actas_parseadas).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('3. marcador contra eventos: coincide o queda como incidencia, nunca en silencio', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // Un tercer gol en los eventos con marcador 2-0: la diferencia tiene que verse.
      cola.db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',3,'gol',55,'local','J1','GARCÍA LÓPEZ, DANIEL',0,'normal',55,null,'jugador','local')`).run();
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const comprobacion = informe!.validacion.comprobaciones.find((c) => c.nombre === 'marcador contra eventos');
      expect(comprobacion?.detalle).toMatch(/[1-9]\d* partido/);
    } finally {
      cola.cierra();
    }
  });

  it('4. identidad: dos personas con el mismo nombre no se fusionan', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const personas = await cuenta(pool, `select count(distinct p.id) n from core.person p join core.person_source_identity psi on psi.person_id = p.id join core.federation f on f.id = psi.federation_id where f.codigo = $1 and p.nombre_norm = core.normaliza_nombre('GARCÍA LÓPEZ, DANIEL')`, [FEDERACION]);
      expect(personas).toBe(2);
      const conCodigo = await cuenta(pool, `select count(*) n from core.person p join core.person_source_identity psi on psi.person_id = p.id join core.federation f on f.id = psi.federation_id where f.codigo = $1 and psi.codigo_externo is not null`, [FEDERACION]);
      expect(conCodigo).toBeGreaterThanOrEqual(3);
      // Los árbitros y el cuerpo técnico son identidad NOMINAL y llevan su rol y su ámbito en el contexto.
      const nominales = await cuenta(pool, `select count(*) n from core.person p join core.person_source_identity psi on psi.person_id = p.id join core.federation f on f.id = psi.federation_id where f.codigo = $1 and p.identidad_nominal`, [FEDERACION]);
      expect(nominales).toBe(2);
      const contextos = await cuenta(pool, `select count(*) n from core.person_source_identity psi join core.federation f on f.id = psi.federation_id where f.codigo = $1 and psi.context_key ~ '^rol=[a-z0-9 ]+;temporada=[0-9]{4}-[0-9]{2};ambito=(edicion|equipo):[0-9]+;nombre=[a-z0-9 ]+$'`, [FEDERACION]);
      expect(contextos).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('5. ausencias: un partido sin resultado llega NULL y un acta pendiente no crea informe', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare(`insert into actas values ('A9','21','900','9001',1,0,'pendiente',null,null,null,null,0,null,null)`).run();
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const sinResultado = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id
        where f.codigo = $1 and m.source_order = 1 and m.goles_local is null and m.goles_visitante is null`, [FEDERACION]);
      expect(sinResultado).toBe(1);
      const informes = await cuenta(pool, `select count(*) n from core.match_report r join core.match m on m.id = r.match_id
        join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect(informes).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('6. reversión: deja el ámbito como estaba antes del lote', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      insertaJornada2(cola);
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const partidosAntes = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect(partidosAntes).toBe(3);
      const reversion = await revierteLote(pool, informe!.batchId);
      expect({ conservadas: reversion.conservadas, fallos: reversion.fallos }).toEqual({ conservadas: 0, fallos: [] });
      const partidosDespues = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      const conActa = await cuenta(pool, `select count(*) n from core.match_report r join core.match m on m.id = r.match_id join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      const conFuente = await cuenta(pool, `select count(*) n from core.match_source s join core.match m on m.id = s.match_id join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect({ partidosDespues, conActa, conFuente }).toEqual({ partidosDespues: 0, conActa: 0, conFuente: 0 });
      const referencias = await cuenta(pool, 'select count(*) n from source.external_ref where federation_id = (select id from core.federation where codigo = $1)', [FEDERACION]);
      expect(referencias).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('7. vocabulario: un tipo inventado detiene el lote y no escribe nada', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',9,'golazo',60,'local','J1','GARCÍA LÓPEZ, DANIEL',0,null,60,null,'jugador','local')`).run();
      await expect(importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' }))
        .rejects.toThrow(/Valor desconocido de eventos_acta\.tipo/);
      const partidos = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect(partidos).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  /**
   * «otra» es distinto de «golazo»: no es un valor que no sepamos leer, es un valor que la fuente publica
   * diciendo justo eso —hubo una tarjeta y no dice de qué color—. Se guarda como `otro`, que es lo que el
   * modelo canónico tiene para «un evento que sabemos que pasó y no es ninguno de los nombrados».
   *
   * Medido el 24/09/2026: 34 eventos así en la cola de Valencia y **29 grupos sin importar** por su culpa.
   */
  it('8. «otra» se guarda como `otro` con subtipo nulo, y el grupo se importa entero', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare(`insert into eventos_acta values ('21','900','9001',1,'A1',3,'otra',70,'local','J1','GARCÍA LÓPEZ, DANIEL',0,null,null,null,'jugador',null)`).run();
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      const evento = await fila<{ event_type: string; subtipo: string | null }>(pool,
        `select ev.event_type, ev.subtipo
           from core.match_event ev
           join core.match m on m.id = ev.match_id
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and ev.source_order = 3`, [FEDERACION]);
      // Ni amarilla ni roja: el color no se inventa. `subtipo` nulo porque tampoco se publicó.
      expect(evento).toEqual({ event_type: 'otro', subtipo: null });
      // Y el grupo entra: los 34 eventos que bloqueaban 29 grupos ya no tumban la tanda.
      const partidos = await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect(partidos).toBeGreaterThan(0);
    } finally {
      cola.cierra();
    }
  });

  /**
   * Una `sin_datos` es un acta que la federación SÍ publica pero con las tablas vacías: el importador le
   * escribe fila en `core.match_report` con calidad `partial`, así que **cuenta como acta analizada**. El
   * origen contaba sólo las `hecha` y el destino escribía también ésta: un grupo con 270 actas buenas y una
   * `sin_datos` daba 270≠271 y se caía entero.
   *
   * Medido el 24/09/2026: le pasaba a **siete federaciones a la vez** (Baleares, Asturias, Navarra,
   * Extremadura, Castilla-La Mancha, Aragón y Rioja), siempre con exactamente una de más.
   */
  it('9. una `sin_datos` citada por el calendario cuenta como acta analizada, y el grupo entra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // El segundo partido de J1 pasa a citar un acta que existe pero vino sin alineaciones.
      cola.db.prepare(`insert into actas values ('A2','21','900','9001',1,0,'sin_datos','acta-A2.html','hb','{}','2026-09-07T00:00:00Z',19,null,null)`).run();
      cola.db.prepare(`update partidos set codigo_acta = 'A2' where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1`).run();

      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      const informe = await fila<{ quality: string }>(pool,
        `select r.quality
           from core.match_report r
           join core.match m on m.id = r.match_id
           join core.match_source s on s.match_id = m.id
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and s.codigo_acta = 'A2'`, [FEDERACION]);
      // La fila se escribe, con la calidad que le toca: no es «correcta» porque no traía alineaciones.
      expect(informe).toEqual({ quality: 'partial' });
    } finally {
      cola.cierra();
    }
  });

  /**
   * Y la otra mitad de lo mismo: una misma acta citada por DOS filas del calendario.
   *
   * El origen cuenta **códigos distintos** (es un conjunto), pero el destino contaba **informes**: dos filas
   * citando la misma acta daban 1 contra 2 y el grupo se caía. Medido el 24/09/2026 en el grupo 23123012 de
   * Aragón: 56 filas de calendario y **52 códigos distintos**, «actas analizadas 52≠56».
   */
  it('10. una acta citada por dos partidos cuenta una vez, y el grupo entra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // El mismo código de acta en DOS jornadas: son dos filas de `actas` (la clave lleva la jornada) y las
      // dos vienen sin alineaciones. Cada una la cita el partido de su jornada.
      for (const jornada of [1, 2]) {
        cola.db.prepare(`insert into actas values ('A9','21','900','9001',?,0,'sin_datos','acta-A9.html','h9','{}','2026-09-07T00:00:00Z',19,null,null)`).run(jornada);
      }
      cola.db.prepare(`update partidos set codigo_acta = 'A9' where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=0`).run();
      cola.db.prepare(`insert into partidos values ('21','900','9001',2,0,'A9','E1','E2','C.D. RIBERT "A"','S.D. SAN JOSE "B"',null,null,'2026-09-13','12:00','CAMPO','C1',null,'2026-09-14T00:00:00Z')`).run();
      // La acta A1 deja de estar citada: su informe no debe entrar en la cuenta.
      cola.db.prepare(`update actas set estado = 'pendiente' where codigo = 'A1'`).run();

      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      const informes = await cuenta(pool,
        `select count(*) n from core.match_report r
           join core.match m on m.id = r.match_id
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1`, [FEDERACION]);
      // Hay DOS informes (uno por jornada) pero UN solo código de acta distinto: la validación cuenta actas,
      // no informes. Sin esta distinción el lote se caía con «actas analizadas 1≠2».
      expect(informes).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  /**
   * Una fila que pone al MISMO equipo en los dos lados no es un partido, y antes tumbaba el grupo entero.
   *
   * Medido el 24/09/2026: **91 filas así en 20 grupos** de siete federaciones, todas con dos códigos
   * federativos distintos para el mismo nombre. El importador hace bien en no elegir cuál va a cada lado
   * —elegir sería inventar—, pero la fila se descarta y **el grupo entra**, que es lo que se prueba aquí:
   * antes, 14 de esos grupos eran 219 partidos con resultado bloqueados por 14 filas.
   */
  it('11. una fila con el mismo equipo en los dos lados se descarta, y el grupo entra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // La misma denominación en los dos lados, con DOS códigos distintos: el caso real.
      cola.db.prepare(`insert into partidos values ('21','900','9001',1,2,'A1','7001','7002',
        'U.D. SAN LORENZO C.D.','U.D. San Lorenzo C.D.',0,2,'2026-09-06','12:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();

      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      // Los partidos de verdad del grupo entran (los dos de la base) y la fila imposible no.
      const partidos = await cuenta(pool,
        `select count(*) n from core.match m
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1`, [FEDERACION]);
      expect(partidos).toBe(2);
      // Y queda escrito: un descarte que no se ve es un descarte que nadie puede revisar.
      const aviso = await fila<{ n: string }>(pool,
        `select count(*) n from ops.normalizacion_error ne
           join ops.batch b on b.id = ne.batch_id
           join core.federation f on f.id = b.federation_id
          where f.codigo = $1 and ne.codigo = 'fila_de_partido_con_el_mismo_equipo_en_los_dos_lados'`, [FEDERACION]);
      expect(Number(aviso?.n ?? 0)).toBeGreaterThan(0);
    } finally {
      cola.cierra();
    }
  });
});

/**
 * Colas reales SIN `jugador_codigo`. No es un caso raro: medido en las colas de verdad, Cataluña trae
 * 255.701 de 255.701 participaciones sin código, Navarra 286.064 de 422.475 y Castilla y León 17.596
 * de 644.336. Antes, el importador se inventaba un código con el nombre (`nominal:<NOMBRE>`), lo que
 * unía a todas las personas que se llaman igual en toda la federación y además las marcaba como
 * identidad confirmada. Estas pruebas fijan lo contrario.
 */
describe('clasificación reconstruida', () => {
  it('21. un calendario al que le faltan las primeras jornadas NO se declara completo', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // El grupo declara 2 jornadas. Se deja SÓLO la jornada 2 con resultado: es la forma que tiene un
      // calendario reconstruido desde las actas cuando lo que llegó fue la última jornada del curso.
      cola.db.prepare("delete from partidos where temporada='21' and competicion='900' and grupo='9001' and jornada=1").run();
      cola.db.prepare("delete from actas where temporada='21' and competicion='900' and grupo='9001' and jornada=1").run();
      insertaJornada2(cola);

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      // Antes de arreglarlo, esto salía «completa hasta la jornada 2» y `visibility_state = 'completa'`:
      // el bucle recorría sólo las jornadas presentes, así que la 1 desaparecida no rompía nada. Medido el
      // 25/09/2026 en 22 grupos catalanes reparados desde sus actas, con 8 partidos de 240.
      expect(informe!.cobertura.complete_through_matchday).toBeNull();
      expect(informe!.cobertura.visibility_state).toBe('parcial_privada');
      expect(informe!.cobertura.partidos_conocidos).toBe(1);
      // Y lo que se espera de una liga regular queda escrito, para poder compararlo: 2 equipos → 1 partido
      // por jornada × 2 jornadas.
      const esperados = await fila<{ partidos_esperados: number }>(pool,
        `select c.partidos_esperados from ops.coverage_checkpoint c
           join core.phase_group g on g.id = c.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION]);
      expect(esperados!.partidos_esperados).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('22. si el nombre del equipo cambia y el código no, la identidad NO se parte', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    const inscripciones = `select count(*) n from core.team_entry te
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id
       where f.codigo = $1 and te.codigo_externo = 'E1'`;
    try {
      siembraBase(cola);
      insertaJornada2(cola);
      const [primera] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(primera!.validacion.ok).toBe(true);
      expect(await cuenta(pool, inscripciones, [FEDERACION])).toBe(1);

      // La fuente cambia la ortografía del nombre y deja el código: es el MISMO equipo. Antes esto creaba
      // un equipo-temporada nuevo (la identidad es club+temporada+NOMBRE) y la inscripción chocaba con el
      // índice único (grupo, código): «duplicate key ... team_entry_grupo_codigo_uq», medido en tres grupos
      // de Cataluña el 25/09/2026.
      cola.db.prepare("update equipos set nombre = 'C.D. RIBERT' where codigo = 'E1'").run();
      cola.db.prepare("update partidos set local = 'C.D. RIBERT' where equipo_local_codigo = 'E1'").run();
      cola.db.prepare("update partidos set visitante = 'C.D. RIBERT' where equipo_visitante_codigo = 'E1'").run();

      const [segunda] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(segunda!.validacion.ok).toBe(true);
      expect(segunda!.validacion.diferencias).toEqual([]);
      // Una sola inscripción con ese código, y sigue siendo la de antes.
      expect(await cuenta(pool, inscripciones, [FEDERACION])).toBe(1);
      const equiposTemporada = await cuenta(pool,
        `select count(distinct te.team_season_id) n from core.team_entry te
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and te.codigo_externo = 'E1'`, [FEDERACION]);
      expect(equiposTemporada).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('23. importar NO gasta las secuencias cortas (federación y temporada)', async () => {
    if (!disponible || !pool) return;
    const canonico = pool;
    const cola = creaCola();
    const ultimaDe = async (secuencia: string): Promise<string | null> => {
      const { rows } = await canonico.query<{ last_value: string | null }>(
        'select last_value::text from pg_sequences where sequencename = $1', [secuencia]);
      return rows[0]?.last_value ?? null;
    };
    try {
      siembraBase(cola);
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const antesFederacion = await ultimaDe('federation_id_seq');
      const antesTemporada = await ultimaDe('season_id_seq');
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      /*
       * `core.federation.id` y `core.season.id` son `smallint` con identidad, así que sus secuencias llegan a
       * 32767. Un `insert ... on conflict do update` CONSUME un `nextval` aunque acabe en conflicto, y las dos
       * se llaman una vez por grupo importado: medido el 25/09/2026, con 22 federaciones y 13 temporadas de
       * verdad se agotaron las dos y fallaron 3.714 grupos por la federación y 3.750 por la temporada, todos
       * con «nextval: reached maximum value». Ahora se busca primero y sólo se inserta si falta.
       */
      expect(await ultimaDe('federation_id_seq')).toBe(antesFederacion);
      expect(await ultimaDe('season_id_seq')).toBe(antesTemporada);
    } finally {
      cola.cierra();
    }
  });

  it('10. no publica tabla a mitad de jornada y la publica cuando la jornada está entera', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    const snapshot = `select count(*) n from core.standing_snapshot s
        join core.phase_group g on g.id = s.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`;
    try {
      siembraBase(cola);
      // J1 tiene dos partidos y sólo uno con resultado: la jornada NO está completa.
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(await cuenta(pool, snapshot, [FEDERACION])).toBe(0);
      // Se publica el resultado que faltaba: ahora J1 sí está entera y la tabla tiene sentido.
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      const filas = await pool.query<{ equipo: string; posicion: number; puntos: string; jugados: string; ganados: string; empatados: string; perdidos: string; goles_favor: string; goles_contra: string; origen: string }>(
        `select te.nombre_en_fuente equipo, s.posicion, s.puntos, s.jugados, s.ganados, s.empatados, s.perdidos,
                s.goles_favor, s.goles_contra, s.origen
           from core.standing_snapshot s
           join core.phase_group g on g.id = s.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
           join core.team_entry te on te.id = s.team_entry_id
          where f.codigo = $1
          order by s.posicion`, [FEDERACION]);
      expect(filas.rows).toHaveLength(2);
      const [primero, segundo] = filas.rows;
      // C.D. RIBERT ganó 2-0 y empató 1-1: 4 puntos. S.D. SAN JOSE perdió 0-2 y empató 1-1: 1 punto.
      expect(primero!.origen).toBe('reconstruida');
      expect(Number(primero!.puntos)).toBe(4);
      expect(Number(primero!.goles_favor)).toBe(3);
      expect(Number(primero!.goles_contra)).toBe(1);
      expect(Number(segundo!.puntos)).toBe(1);
      // La tabla cuadra consigo misma: es la comprobación que delata una suma mal hecha.
      for (const fila of filas.rows) {
        expect(Number(fila.ganados) + Number(fila.empatados) + Number(fila.perdidos)).toBe(Number(fila.jugados));
        expect(Number(fila.puntos)).toBe(Number(fila.ganados) * 3 + Number(fila.empatados));
      }
    } finally {
      cola.cierra();
    }
  });

  it('11. la clasificación oficial archivada se guarda aparte y su diferencia no se esconde', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    const puntos = (origen: string, extra = '') => `select count(*) n from core.standing_snapshot s
        join core.phase_group g on g.id = s.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id
       where f.codigo = $1 and s.origen = '${origen}' ${extra}`;
    try {
      siembraBase(cola);
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      // HTML oficial archivado, con la forma que publica la plataforma (resumen con Pts, J y Sanción).
      const oficial = `<html><body><table>
        <tr><th></th><th>Pos</th><th>Equipo</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th>Últimos</th><th>Sanción</th></tr>
        <tr><td>.</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr>
        <tr><td>.</td><td>1</td><td><a href="?codEquipo=E1">C.D. RIBERT "A"</a></td><td>4</td><td>2</td><td>1</td><td>1</td><td>0</td><td>G E</td><td>0</td></tr>
        <tr><td>.</td><td>2</td><td><a href="?codEquipo=E2">S.D. SAN JOSE "B"</a></td><td>3</td><td>2</td><td>1</td><td>0</td><td>1</td><td>G P</td><td>0</td></tr>
      </table></body></html>`;
      const carpetaGrupo = join(cola.raiz, `descargas-${FEDERACION}`, 'recolector-local', 't21-2025-26', 'comp-900', 'grupo-9001');
      mkdirSync(carpetaGrupo, { recursive: true });
      writeFileSync(join(carpetaGrupo, 'clasificacion.html.gz'), gzipSync(oficial));

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      // Las dos tablas conviven: la oficial no pisa a la reconstruida.
      expect(await cuenta(pool, puntos('oficial'), [FEDERACION])).toBe(2);
      expect(await cuenta(pool, puntos('reconstruida'), [FEDERACION])).toBe(2);
      // La reconstruida sigue diciendo lo que dicen los partidos (E2: 1 punto, no 3).
      expect(await cuenta(pool, puntos('reconstruida', 'and s.puntos = 1'), [FEDERACION])).toBe(1);
      expect(informe!.clasificacionOficial?.filas).toBe(2);
      // La temporada no está terminada (el grupo declara 2 jornadas y sólo la primera está completa), así
      // que NO se contrasta: la tabla oficial es una foto de otra fecha y las diferencias serían ruido.
      expect(informe!.clasificacionOficial?.comparada).toBe(false);
      expect(informe!.clasificacionOficial?.diferencias).toHaveLength(0);

      // Con la temporada terminada sí se contrasta, y entonces la diferencia queda registrada.
      cola.db.prepare("update grupos set jornadas = 1 where temporada='21' and competicion='900' and codigo='9001'").run();
      const [segundo] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(segundo!.clasificacionOficial?.comparada).toBe(true);
      expect(segundo!.clasificacionOficial?.diferencias).toHaveLength(1);
      expect(segundo!.clasificacionOficial?.diferencias[0]).toMatchObject({ oficial: 3, reconstruida: 1 });
      const registradas = await cuenta(pool,
        `select count(*) n from ops.normalizacion_error where batch_id = $1 and codigo = 'clasificacion_oficial_vs_reconstruida'`,
        [segundo!.batchId]);
      expect(registradas).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('12. el cuadre del calendario se comprueba y se registra, sin corregir nada solo', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // Tercer equipo y dos partidos más: E1 y E2 acaban con cuatro partidos de calendario y E3 con
      // dos. En una liga regular todos juegan lo mismo, así que E3 es una anomalía que hay que mirar.
      cola.db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21','E3','C.D. TERCERO \"A\"',1)").run();
      cola.db.prepare(`insert into partidos values ('21','900','9001',1,2,null,'E1','E3','C.D. RIBERT "A"','C.D. TERCERO "A"',null,null,'2026-09-06',null,null,null,null,'2026-09-07T00:00:00Z')`).run();
      cola.db.prepare(`insert into partidos values ('21','900','9001',1,3,null,'E2','E3','S.D. SAN JOSE "B"','C.D. TERCERO "A"',null,null,'2026-09-06',null,null,null,null,'2026-09-07T00:00:00Z')`).run();
      insertaJornada2(cola);

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const calendario = informe!.calendario;
      expect(calendario).not.toBeNull();
      expect(calendario!.equipos).toBe(3);
      // Lo habitual son 4 partidos (E1 y E2); E3 sólo tiene 2 en el calendario.
      expect(calendario!.partidosHabitual).toBe(4);
      expect(calendario!.equiposHabitual).toBe(2);
      expect(calendario!.desviados).toHaveLength(1);
      expect(calendario!.desviados[0]).toMatchObject({ partidos: 2, descansos: 2 - 2 });
      // Se registra para poder mirarlo; el importador no corrige el calendario por su cuenta.
      const registradas = await cuenta(pool,
        `select count(*) n from ops.normalizacion_error where batch_id = $1 and codigo = 'calendario_no_cuadra'`,
        [informe!.batchId]);
      expect(registradas).toBe(1);
    } finally {
      cola.cierra();
    }
  });
});

/**
 * La pareja de equipos de un partido: el calendario manda en la programación, el acta en QUIÉN jugó.
 *
 * El fallo real, reproducido en pequeño: en el grupo 11379752 (Tercera Federación, 1ª Fase Gr. VIII,
 * Castilla y León 2024-25) siete filas del calendario tenían al equipo que DESCANSABA como `local` de
 * un partido, el `local` verdadero como `visitante` y el `visitante` verdadero perdido. El
 * `codigo_acta` seguía colgado de la fila, así que las alineaciones del acta quedaban repartidas entre
 * dos equipos que no jugaron ese partido.
 */
describe('pareja de equipos: el calendario contra el acta', () => {
  it('13. la pareja del acta manda sobre la del calendario cuando el calendario se contradice', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // Un tercer equipo: es el que «descansa» y se cuela como local del partido del acta A1. El
      // calendario queda diciendo «Tercero vs Ribert» cuando el acta dice «Ribert vs San José».
      cola.db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21','E3','C.D. TERCERO \"A\"',1)").run();
      cola.db.prepare(`update partidos set equipo_local_codigo = 'E3', local = 'C.D. TERCERO "A"',
          equipo_visitante_codigo = 'E1', visitante = 'C.D. RIBERT "A"'
        where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=0`).run();
      // El acta A1 dice quién jugó de verdad: Ribert como local y San José como visitante.
      cola.db.prepare(`update actas set datos = ? where codigo = 'A1'`)
        .run(JSON.stringify({ local: 'C.D. RIBERT "A"', visitante: 'S.D. SAN JOSE "B"', golesLocal: 2, golesVisitante: 0 }));

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informe!.validacion.ok).toBe(true);

      // El partido queda con los equipos del acta, no con los del calendario.
      const equiposDelPartido = await fila<{ local: string; visitante: string }>(pool,
        `select tl.nombre_en_fuente as local, tv.nombre_en_fuente as visitante
           from core.match m
           join core.team_entry tl on tl.id = m.home_team_entry_id
           join core.team_entry tv on tv.id = m.away_team_entry_id
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and m.source_order = 0
            and m.matchday_id = (select id from core.matchday where phase_group_id = g.id and numero = 1)`,
        [FEDERACION]);
      expect(equiposDelPartido).toEqual({ local: 'C.D. RIBERT "A"', visitante: 'S.D. SAN JOSE "B"' });

      // Las apariciones del acta van a los equipos del acta: el `local` a Ribert y el `visitante` a San José.
      // El conteo se acota a la federación de pruebas: el canónico real tiene un equipo de Tenerife que
      // también se llama «S.D. SAN JOSE "B"» (72 apariciones como visitante), y contar todo el mundo hacía
      // que la prueba dependiera de esos datos ajenos.
      const aparicionesLocal = await cuenta(pool,
        `select count(*) n from core.appearance a
           join core.team_entry te on te.id = a.team_entry_id
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where a.lado = 'local' and te.nombre_en_fuente = 'C.D. RIBERT "A"' and f.codigo = $1`, [FEDERACION]);
      const aparicionesVisitante = await cuenta(pool,
        `select count(*) n from core.appearance a
           join core.team_entry te on te.id = a.team_entry_id
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where a.lado = 'visitante' and te.nombre_en_fuente = 'S.D. SAN JOSE "B"' and f.codigo = $1`, [FEDERACION]);
      expect(aparicionesLocal).toBe(2);
      expect(aparicionesVisitante).toBe(1);

      // La contradicción no se resuelve en silencio: queda como incidencia del acta y en el registro.
      // La consulta se acota a la federación de pruebas: el canónico real puede tener sus propias
      // incidencias y contarlas todas haría que esta prueba dependiera de lo que haya fuera.
      const conIncidencia = await cuenta(pool,
        `select count(*) n from core.match_report r
           join core.match m on m.id = r.match_id
           join core.phase_group g on g.id = m.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and r.incidencias @> '[{"codigo":"EQUIPOS_ACTA_NO_CUADRA"}]'::jsonb`,
        [FEDERACION]);
      expect(conIncidencia).toBe(1);
      const registradas = await cuenta(pool,
        `select count(*) n from ops.normalizacion_error where batch_id = $1 and codigo = 'partido_equipo_no_cuadra_con_acta'`,
        [informe!.batchId]);
      expect(registradas).toBe(1);

      // Y el calendario deja de tener una pareja imposible.
      expect(informe!.calendario!.emparejamiento.anomalias).toEqual([]);
      expect(informe!.partidosReparados).toBe(1);

      // Una aparición obsoleta del equipo fantasma —la que habría dejado la lectura vieja del calendario—
      // se retira al reimportar, en vez de convivir con la buena y duplicar la plantilla.
      await pool.connect().then(async (cliente) => {
        try {
          await cliente.query(
            `insert into core.appearance (match_id, person_id, team_entry_id, season_id, lado, condition, dorsal, portero, orden)
             select m.id, p.id, te.id, s.id, 'local', 'starter', 99, false, 999
               from core.match m
               join core.team_entry te on te.nombre_en_fuente = 'C.D. TERCERO "A"'
               join core.phase_group g on g.id = m.phase_group_id
               join core.competition_edition e on e.id = g.competition_edition_id
               join core.federation f on f.id = e.federation_id
               join core.person p on true
               join core.season s on s.id = e.season_id
              where f.codigo = $1 and m.source_order = 0 and p.id = (select min(id) from core.person)
              limit 1`,
            [FEDERACION],
          );
        } finally {
          cliente.release();
        }
      });
      expect(await cuenta(pool, `select count(*) n from core.appearance where orden = 999`, [])).toBe(1);

      // Segunda pasada: idempotente, sin inserciones nuevas, y la obsoleta desaparece.
      const segunda = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(Object.values(segunda[0]!.contadores).reduce((s, c) => s + c.insertadas, 0)).toBe(0);
      expect(segunda[0]!.aparicionesRetiradas).toBe(1);
      expect(await cuenta(pool, `select count(*) n from core.appearance where orden = 999`, [])).toBe(0);
      expect(await cuenta(pool, `select count(*) n from core.appearance a join core.team_entry te on te.id = a.team_entry_id
        where te.nombre_en_fuente = 'C.D. TERCERO "A"'`, [])).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('14. una contradicción que no se puede resolver detiene el lote en vez de elegir', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21','E3','C.D. TERCERO \"A\"',1)").run();
      // El calendario dice «Tercero vs Ribert» y el acta dice «San José vs Tercero»: comparten un equipo
      // (Tercero), pero no en la posición que haría demostrable una fuga, y tampoco es un campo
      // invertido. No se sabe qué partido describe el acta: el lote se detiene.
      cola.db.prepare(`update partidos set equipo_local_codigo = 'E3', local = 'C.D. TERCERO "A"',
          equipo_visitante_codigo = 'E1', visitante = 'C.D. RIBERT "A"'
        where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=0`).run();
      cola.db.prepare(`update actas set datos = ? where codigo = 'A1'`)
        .run(JSON.stringify({ local: 'S.D. SAN JOSE "B"', visitante: 'C.D. TERCERO "A"' }));

      await expect(importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' }))
        .rejects.toThrow(/no se corresponde con la fila del calendario/);
      // Un lote que no se puede cerrar no deja nada a medias.
      expect(await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION])).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('16. una corrección de la fuente (un convocado menos, árbitro retirado) no deja filas viejas y el lote valida', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      const opciones = { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' };
      const deLaFederacion = `join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`;
      const primera = await importaFederacion(pool, opciones);
      expect(primera[0]!.validacion.ok).toBe(true);
      expect(await cuenta(pool, `select count(*) n from core.appearance a join core.match m on m.id = a.match_id ${deLaFederacion}`, [FEDERACION])).toBe(3);
      expect(await cuenta(pool, `select count(*) n from core.match_official o join core.match m on m.id = o.match_id ${deLaFederacion}`, [FEDERACION])).toBe(1);

      // La federación corrige el acta (quita al suplente visitante) y retira el árbitro del calendario.
      cola.db.prepare(`delete from participaciones where acta = 'A1' and lado = 'visitante'`).run();
      cola.db.prepare(`update partidos set arbitro = null where codigo_acta = 'A1'`).run();

      const segunda = await importaFederacion(pool, opciones);
      expect(segunda[0]!.validacion.diferencias).toEqual([]);
      expect(segunda[0]!.validacion.ok).toBe(true);
      expect(segunda[0]!.aparicionesRetiradas).toBe(1);
      expect(await cuenta(pool, `select count(*) n from core.appearance a join core.match m on m.id = a.match_id ${deLaFederacion}`, [FEDERACION])).toBe(2);
      expect(await cuenta(pool, `select count(*) n from core.match_official o join core.match m on m.id = o.match_id ${deLaFederacion}`, [FEDERACION])).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('17. un equipo que entró SIN código y vuelve CON código y otra ortografía se vincula, no choca', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      const opciones = { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' };
      const delGrupo = `join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`;
      // Primera versión de la fuente: sin códigos y sin comillas (como Rioja 2026-27 antes del 13/10).
      cola.db.prepare(`update partidos set equipo_local_codigo = null, equipo_visitante_codigo = null,
          local = replace(local, '"', ''), visitante = replace(visitante, '"', '')`).run();
      const primera = await importaFederacion(pool, opciones);
      expect(primera[0]!.validacion.ok).toBe(true);
      expect(await cuenta(pool, `select count(*) n from core.team_entry te ${delGrupo}`, [FEDERACION])).toBe(2);

      // La fuente publica después los códigos y escribe la letra entre comillas: «S.D. SAN JOSE "B"».
      cola.db.prepare(`update partidos set
          equipo_local_codigo = case when local like 'C.D.%' then 'E1' else 'E2' end,
          equipo_visitante_codigo = case when visitante like 'C.D.%' then 'E1' else 'E2' end,
          local = case when local like 'C.D.%' then 'C.D. RIBERT "A"' else 'S.D. SAN JOSE "B"' end,
          visitante = case when visitante like 'C.D.%' then 'C.D. RIBERT "A"' else 'S.D. SAN JOSE "B"' end`).run();
      const segunda = await importaFederacion(pool, opciones);
      expect(segunda[0]!.validacion.ok).toBe(true);
      // Las MISMAS dos inscripciones, ahora con su código: vinculadas, no duplicadas.
      expect(await cuenta(pool, `select count(*) n from core.team_entry te ${delGrupo}`, [FEDERACION])).toBe(2);
      expect(await cuenta(pool, `select count(*) n from core.team_entry te ${delGrupo} and te.codigo_externo is not null`, [FEDERACION])).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('18. un acta guardada bajo otra jornada (partido aplazado) se une a su partido por el código', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // El calendario pone el partido en la jornada 1, pero la cola guardó su acta (y lo que cuelga de ella) bajo la 2.
      cola.db.prepare("insert into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en) values ('21','900','9001',2,'2026-09-13','j2.html','h2','2026-09-14T00:00:00Z') on conflict do nothing").run();
      for (const tabla of ['actas', 'participaciones', 'eventos_acta', 'tecnicos_acta']) {
        const columna = tabla === 'actas' ? 'codigo' : 'acta';
        cola.db.prepare(`update ${tabla} set jornada = 2 where ${columna} = 'A1'`).run();
      }
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informe!.validacion.diferencias).toEqual([]);
      expect(informe!.validacion.ok).toBe(true);
      expect(await cuenta(pool, `select count(*) n from core.match_report r join core.match m on m.id = r.match_id
        join core.phase_group g on g.id = m.phase_group_id join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('19. un partido que la fuente deja de publicar se retira del canónico y el lote valida', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      // Sólo la jornada 1 (dos partidos, ida y vuelta de la misma pareja): con una segunda jornada de la MISMA
      // pareja en el mismo lado saltaría, con razón, el guardián del «calendario imposible».
      siembraBase(cola);
      const opciones = { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' };
      const partidos = `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`;
      const primera = await importaFederacion(pool, opciones);
      expect(primera[0]!.validacion.ok).toBe(true);
      expect(await cuenta(pool, partidos, [FEDERACION])).toBe(2);
      // La federación quita el partido sin resultado de la jornada 1.
      cola.db.prepare(`delete from partidos where jornada = 1 and orden = 1`).run();
      const segunda = await importaFederacion(pool, opciones);
      expect(segunda[0]!.validacion.diferencias).toEqual([]);
      expect(segunda[0]!.validacion.ok).toBe(true);
      expect(await cuenta(pool, partidos, [FEDERACION])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('15. con FACYLF_APARTAR_ACTAS_DISCORDANTES=1 el acta se aparta, el grupo entra y la validación cuadra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    const antes = process.env.FACYLF_APARTAR_ACTAS_DISCORDANTES;
    process.env.FACYLF_APARTAR_ACTAS_DISCORDANTES = '1';
    try {
      siembraBase(cola);
      // La misma contradicción irresoluble que la prueba 14.
      cola.db.prepare("insert into equipos (temporada, codigo, nombre, primera_jornada) values ('21','E3','C.D. TERCERO \"A\"',1)").run();
      cola.db.prepare(`update partidos set equipo_local_codigo = 'E3', local = 'C.D. TERCERO "A"',
          equipo_visitante_codigo = 'E1', visitante = 'C.D. RIBERT "A"'
        where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=0`).run();
      cola.db.prepare(`update actas set datos = ? where codigo = 'A1'`)
        .run(JSON.stringify({ local: 'S.D. SAN JOSE "B"', visitante: 'C.D. TERCERO "A"' }));

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      // El grupo entra entero y la validación cuadra: el origen descuenta lo que cuelga del acta apartada.
      expect(informe!.validacion.ok).toBe(true);
      expect(informe!.validacion.diferencias).toEqual([]);
      const deLaFederacion = `join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`;
      // Los dos partidos del calendario están, con el resultado del calendario.
      expect(await cuenta(pool, `select count(*) n from core.match m ${deLaFederacion}`, [FEDERACION])).toBe(2);
      expect(await cuenta(pool, `select count(*) n from core.match m ${deLaFederacion} and m.goles_local = 2 and m.goles_visitante = 0`, [FEDERACION])).toBe(1);
      // El acta NO se enlaza: ni informe, ni alineaciones, ni eventos, ni técnicos de ella.
      expect(await cuenta(pool, `select count(*) n from core.match_report r join core.match m on m.id = r.match_id ${deLaFederacion}`, [FEDERACION])).toBe(0);
      expect(await cuenta(pool, `select count(*) n from core.appearance a join core.match m on m.id = a.match_id ${deLaFederacion}`, [FEDERACION])).toBe(0);
      expect(await cuenta(pool, `select count(*) n from core.match_event v join core.match m on m.id = v.match_id ${deLaFederacion}`, [FEDERACION])).toBe(0);
      expect(await cuenta(pool, `select count(*) n from core.match_staff t join core.match m on m.id = t.match_id ${deLaFederacion}`, [FEDERACION])).toBe(0);
      // Y la decisión queda escrita, con las dos parejas.
      const aviso = await fila<{ parametros: Record<string, unknown> }>(pool,
        `select e.parametros from ops.normalizacion_error e join ops.batch b on b.id = e.batch_id
          join core.federation f on f.id = b.federation_id
         where f.codigo = $1 and e.codigo = 'acta_apartada_por_no_cuadrar'`, [FEDERACION]);
      expect(aviso?.parametros).toMatchObject({ codigo_acta: 'A1', grupo: '9001' });
      expect(String(aviso?.parametros.acta)).toContain('TERCERO');
    } finally {
      if (antes === undefined) delete process.env.FACYLF_APARTAR_ACTAS_DISCORDANTES;
      else process.env.FACYLF_APARTAR_ACTAS_DISCORDANTES = antes;
      cola.cierra();
    }
  });
});

/**
 * La tabla oficial por el camino del `clasificacion.json`.
 *
 * Cataluña es la única federación donde conviven `clasificacion.html` y `clasificacion.json` (282 de
 * 283 grupos) y el parser PNFG no lee ni una fila del HTML; Madrid y Valencia **sólo** tienen JSON. Por
 * eso el JSON no es un plan B escondido: es un lector con el mismo contrato, y estas pruebas recorren
 * el camino entero contra un PostgreSQL real.
 */
describe('clasificación oficial desde clasificacion.json', () => {
  const carpetaGrupoDe = (cola: ColaSintetica) =>
    join(cola.raiz, `descargas-${FEDERACION}`, 'recolector-local', 't21-2025-26', 'comp-900', 'grupo-9001');

  const filaJson = (extra: Record<string, unknown>) => ({
    posicion: 1, equipoCodigo: null, equipo: 'C.D. RIBERT "A"', puntos: 4, jugados: 2,
    ganados: 1, empatados: 1, perdidos: 0, ultimos: ['G', 'E'], sancion: 0, ...extra,
  });

  const escribeJson = (cola: ColaSintetica, filas: unknown[]) => {
    const carpeta = carpetaGrupoDe(cola);
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, 'clasificacion.json'), JSON.stringify(filas, null, 2));
  };

  const puntosDeOrigen = (origen: string, extra = '') => `select count(*) n from core.standing_snapshot s
      join core.phase_group g on g.id = s.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id
     where f.codigo = $1 and s.origen = '${origen}' ${extra}`;

  it('15. importa la oficial desde el JSON, la guarda aparte y es idempotente', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // La jornada 1 tiene que quedar COMPLETA: la tabla oficial se cuelga de la última jornada
      // reconstruida, y sin ninguna jornada completa no hay dónde anclarla.
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      // Los nombres van con la letra de equipo CAMBIADA a propósito: es lo que hace la fuente real
      // (la tabla publica «ARGENTONA, C.F. A» donde el calendario dice «ARGENTONA, C.F. B»), así que
      // esta prueba recorre también la resolución por nombre de club.
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "B"', puntos: 4, ganados: 1, empatados: 1, perdidos: 0 }),
        filaJson({ posicion: 2, equipo: 'S.D. SAN JOSE "A"', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
      ]);

      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      // Se ha usado el JSON, no el HTML (que ni siquiera existe en esta prueba).
      expect(informe!.clasificacionOficial?.fuente).toBe('json');
      expect(informe!.clasificacionOficial?.filas).toBe(2);
      expect(informe!.clasificacionOficial?.resueltasPorClub).toBe(2);

      // Las dos tablas conviven y la oficial NO se ha sobrescrito con la reconstruida.
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);
      expect(await cuenta(pool, puntosDeOrigen('reconstruida'), [FEDERACION])).toBe(2);
      expect(await cuenta(pool, puntosDeOrigen('oficial', 'and s.puntos = 4'), [FEDERACION])).toBe(1);
      expect(await cuenta(pool, puntosDeOrigen('oficial', 'and s.posicion = 2'), [FEDERACION])).toBe(1);

      // La procedencia queda declarada: de qué fichero salió y cómo se resolvió cada fila.
      const procedencia = await fila<{ fuente: string; resueltas_por_club: string; filas: string; ruta: string }>(pool,
        `select parametros->>'fuente' as fuente, parametros->>'resueltas_por_club' as resueltas_por_club,
                parametros->>'filas' as filas, parametros->>'ruta' as ruta
           from ops.normalizacion_error
          where batch_id = $1 and codigo = 'clasificacion_oficial_importada'`, [informe!.batchId]);
      expect(procedencia?.fuente).toBe('json');
      expect(procedencia?.resueltas_por_club).toBe('2');
      expect(procedencia?.filas).toBe('2');
      expect(procedencia?.ruta).toMatch(/clasificacion\.json$/);

      // Segunda pasada: sin filas nuevas y con el mismo estado.
      const [segundo] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(Object.values(segundo!.contadores).reduce((s, c) => s + c.insertadas, 0)).toBe(0);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);
      expect(await cuenta(pool, puntosDeOrigen('reconstruida'), [FEDERACION])).toBe(2);
    } finally {
      cola.cierra();
    }
  });

  it('16. un equipo de la tabla oficial que no está en el grupo NO tumba el grupo: se descarta la tabla', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"' }),
        filaJson({ posicion: 2, equipo: 'CLUB DE OTRO GRUPO "A"', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
      ]);
      /*
       * ── QUÉ CAMBIÓ AQUÍ, Y POR QUÉ ───────────────────────────────────────────────────────────────────
       *
       * Antes esta prueba exigía que el lote ENTERO se detuviera y que no se escribiera NADA del grupo. El
       * motivo era bueno —no escribir media tabla oficial— pero la consecuencia no: una tabla de
       * clasificación mal publicada se llevaba por delante los partidos, las actas, los jugadores y los
       * goles de ese grupo.
       *
       * Medido el 24/09/2026 cargando las diecinueve federaciones: **184 grupos de Cataluña** rechazados
       * así, y con ellos toda su cobertura de jugadores. Es el mismo error de fondo que dejó 126 grupos de
       * 193 sin importar en Castilla y León.
       *
       * La tabla oficial se sigue SIN escribir, y ahora además queda un aviso con el motivo exacto. Lo que
       * ya no pasa es que se pierda el grupo.
       */
      const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informes[0]?.error).toBeUndefined();
      // La tabla oficial no se escribe: ni la mitad que sí casaba.
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
      // Pero el grupo SÍ entra: sus partidos están dentro. (La clasificación reconstruida no se comprueba
      // aquí porque depende de que el fixture tenga una jornada completa, que es lo que fija la prueba 10.)
      expect(await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION])).toBeGreaterThan(0);
      // Y el lote queda validado: descartar la tabla oficial no convierte el grupo en un lote fallido.
      expect(informes[0]!.validacion.ok).toBe(true);
      // Y queda dicho por qué no está la oficial, con el grupo y la regla que falló.
      expect(await cuenta(pool, `select count(*) n from ops.normalizacion_error
        where batch_id = $1 and codigo = 'clasificacion_oficial_ilegible'`, [informes[0]!.batchId])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('16 bis. con el código publicado, el equipo que aún no ha jugado se resuelve por él y la tabla entra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // La jornada 1 completa, para que la tabla oficial tenga de dónde colgarse.
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      /*
       * Los dos equipos de esta tabla NO están en el calendario del grupo —ninguno ha jugado todavía, que es
       * el caso real: la tabla oficial lista a TODOS los inscritos y el catálogo del grupo se monta con los
       * que han jugado—, y por eso los dos se resuelven por el CÓDIGO que publica la propia tabla. Es la
       * prueba 16 con el código puesto: allí, sin código, la tabla se descarta (y sigue descartándose).
       *
       * La tercera fila es el bloque de descanso, que la fuente publica como un equipo más con su código
       * (medido en Aragón: «DESCANSA», `codequipo=5199186`). No puede entrar: crearía la inscripción fantasma
       * que `retirada.ts` documenta haber tenido que retirar.
       */
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. NUEVO INSCRITO "A"', equipoCodigo: '777001', puntos: 4, ganados: 1, empatados: 1, perdidos: 0 }),
        filaJson({ posicion: 2, equipo: 'CLUB DE OTRO GRUPO "A"', equipoCodigo: '777002', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
        filaJson({ posicion: 3, equipo: 'DESCANSA', equipoCodigo: '777003', puntos: 0, jugados: 0, ganados: 0, empatados: 0, perdidos: 0, ultimos: [] }),
      ]);

      const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informes[0]?.error).toBeUndefined();
      // La tabla entra entera: las dos filas de equipos, por el código que publican.
      expect(informes[0]!.clasificacionOficial?.filas).toBe(2);
      expect(informes[0]!.clasificacionOficial?.resueltasPorCodigoPublicado).toBe(2);
      expect(informes[0]!.clasificacionOficial?.filasDeDescanso).toBe(1);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);

      // Y las dos inscripciones existen de verdad, con su código federativo y su nombre publicado.
      const inscritos = await pool.query<{ codigo_externo: string; nombre_en_fuente: string }>(
        `select te.codigo_externo, te.nombre_en_fuente
           from core.team_entry te
           join core.phase_group g on g.id = te.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1 and te.codigo_externo in ('777001', '777002', '777003')
          order by te.codigo_externo`,
        [FEDERACION],
      );
      expect(inscritos.rows.map((r) => r.codigo_externo)).toEqual(['777001', '777002']);
      expect(inscritos.rows[0]?.nombre_en_fuente).toBe('C.D. NUEVO INSCRITO "A"');

      // Queda declarado en el aviso qué se resolvió por esta vía y qué fila se apartó, sin silencios.
      const procedencia = await fila<{ codigo_publicado: string; descansos: string }>(pool,
        `select parametros->>'resueltas_por_codigo_publicado' as codigo_publicado,
                parametros->>'filas_de_descanso' as descansos
           from ops.normalizacion_error
          where batch_id = $1 and codigo = 'clasificacion_oficial_importada'`, [informes[0]!.batchId]);
      expect(procedencia?.codigo_publicado).toBe('2');
      expect(procedencia?.descansos).toBe('1');

      // Y la segunda pasada no duplica nada: la inscripción por código es idempotente.
      const [segundo] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(segundo!.clasificacionOficial?.filas).toBe(2);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);
      expect(await cuenta(pool, `select count(*) n from core.team_entry te
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id
       where f.codigo = $1 and te.codigo_externo = '777001'`, [FEDERACION])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('16 ter. sin jornada completa, la tabla entra anclada a la última jornada y lo declara', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      /*
       * A propósito NO se completa ninguna jornada: es el caso de los 1.404 grupos `sin_corte` —una temporada
       * que acaba de empezar, o un calendario recogido a medias—. Antes la tabla se descartaba entera; ahora se
       * escribe anclada a la última jornada que exista, y la salvedad viaja con la foto (migración 0022).
       */
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"', puntos: 4, jugados: 2, ganados: 1, empatados: 1, perdidos: 0 }),
        filaJson({ posicion: 2, equipo: 'S.D. SAN JOSE "B"', puntos: 0, jugados: 1, ganados: 0, empatados: 0, perdidos: 1 }),
      ]);

      const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informes[0]?.error).toBeUndefined();
      // La tabla ENTRA: eso es lo que cambia.
      expect(informes[0]!.clasificacionOficial?.filas).toBe(2);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);
      // Y queda dicho que su jornada de corte NO está confirmada, donde lo puede leer la web.
      const cobertura = await fila<{ corte: boolean | null; estado: string }>(pool,
        `select cc.tabla_oficial_corte_completo as corte, cc.tabla_oficial_estado as estado
           from ops.coverage_checkpoint cc
           join core.phase_group g on g.id = cc.phase_group_id
           join core.competition_edition e on e.id = g.competition_edition_id
           join core.federation f on f.id = e.federation_id
          where f.codigo = $1`, [FEDERACION]);
      expect(cobertura?.estado).toBe('importada');
      expect(cobertura?.corte).toBe(false);
      // Y con su aviso propio, para que dentro de tres meses nadie tenga que adivinar por qué se hizo.
      expect(await cuenta(pool, `select count(*) n from ops.normalizacion_error
        where batch_id = $1 and codigo = 'clasificacion_oficial_anclada_a_jornada_incompleta'`,
      [informes[0]!.batchId])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('17. una tabla oficial inválida se descarta sin convertirla, y el grupo se importa igual', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // `puntos: 0.25` es literalmente lo que publican 5 ficheros del corpus. Redondear sería inventar.
      escribeJson(cola, [filaJson({ puntos: 0.25, ganados: 2, empatados: 1, perdidos: 1, jugados: 4 })]);
      const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informes[0]?.error).toBeUndefined();
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
      const avisos = await pool.query<{ parametros: { motivo: string } }>(
        `select parametros from ops.normalizacion_error where batch_id = $1 and codigo = 'clasificacion_oficial_ilegible'`,
        [informes[0]!.batchId],
      );
      expect(avisos.rows[0]?.parametros.motivo).toMatch(/R7/);
    } finally {
      cola.cierra();
    }
  });

  it('18. si el HTML y el JSON dicen cosas distintas, no se elige ninguna y el grupo entra', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // HTML con la maqueta PNFG que el parser sí entiende…
      const html = `<html><body><table>
        <tr><th></th><th>Pos</th><th>Equipo</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th>Últimos</th><th>Sanción</th></tr>
        <tr><td>.</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr>
        <tr><td>.</td><td>1</td><td>C.D. RIBERT "A"</td><td>4</td><td>2</td><td>1</td><td>1</td><td>0</td><td>G E</td><td>0</td></tr>
        <tr><td>.</td><td>2</td><td>S.D. SAN JOSE "B"</td><td>3</td><td>2</td><td>1</td><td>0</td><td>1</td><td>G P</td><td>0</td></tr>
      </table></body></html>`;
      const carpeta = carpetaGrupoDe(cola);
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(join(carpeta, 'clasificacion.html.gz'), gzipSync(html));
      // …y un JSON que dice otra cosa para el mismo equipo.
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"', puntos: 6, ganados: 2, empatados: 0, perdidos: 0 }),
        filaJson({ posicion: 2, equipo: 'S.D. SAN JOSE "B"', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
      ]);
      const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informes[0]?.error).toBeUndefined();
      // No se elige ninguna de las dos tablas…
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
      // …y queda dicho que se descartaron, en vez de perderse el grupo entero.
      expect(await cuenta(pool, `select count(*) n from ops.normalizacion_error
        where batch_id = $1 and codigo = 'clasificacion_oficial_ilegible'`, [informes[0]!.batchId])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('19. si las dos maquetas coinciden, se usa el HTML y se deja constancia de la comprobación', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      const html = `<html><body><table>
        <tr><th></th><th>Pos</th><th>Equipo</th><th>Pts</th><th>J</th><th>G</th><th>E</th><th>P</th><th>Últimos</th><th>Sanción</th></tr>
        <tr><td>.</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr>
        <tr><td>.</td><td>1</td><td>C.D. RIBERT "A"</td><td>4</td><td>2</td><td>1</td><td>1</td><td>0</td><td>G E</td><td>0</td></tr>
        <tr><td>.</td><td>2</td><td>S.D. SAN JOSE "B"</td><td>3</td><td>2</td><td>1</td><td>0</td><td>1</td><td>G P</td><td>0</td></tr>
      </table></body></html>`;
      const carpeta = carpetaGrupoDe(cola);
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(join(carpeta, 'clasificacion.html.gz'), gzipSync(html));
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"', puntos: 4, ganados: 1, empatados: 1, perdidos: 0 }),
        filaJson({ posicion: 2, equipo: 'S.D. SAN JOSE "B"', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
      ]);
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      // El HTML manda (requisito: el JSON sólo entra cuando el HTML no da filas), pero se ha comprobado
      // que las dos dicen lo mismo y eso queda anotado.
      expect(informe!.clasificacionOficial?.fuente).toBe('pnfg-html');
      expect(informe!.clasificacionOficial?.cotejadaConLaOtra).toBe(true);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(2);
      const cotejada = await cuenta(pool,
        `select count(*) n from ops.normalizacion_error where batch_id = $1
          and codigo = 'clasificacion_oficial_importada' and parametros->>'cotejada_con_la_otra' = 'true'`,
        [informe!.batchId]);
      expect(cotejada).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('20. un ajuste de la federación se guarda como lo publica y se registra, sin inventar resultados', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare("update partidos set goles_local = 1, goles_visitante = 1 where temporada='21' and competicion='900' and grupo='9001' and jornada=1 and orden=1").run();
      // 12 victorias y 5 empates son 41 puntos; la fuente publica 40 y su columna `sancion` dice 0.
      // Es exactamente lo que hace el grupo catalán 54322935 con «ASCÓ, F.C. A».
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"', puntos: 40, jugados: 30, ganados: 12, empatados: 5, perdidos: 13, sancion: 0 }),
        filaJson({ posicion: 2, equipo: 'S.D. SAN JOSE "B"', puntos: 41, jugados: 30, ganados: 10, empatados: 11, perdidos: 9, sancion: 0 }),
      ]);
      const [informe] = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      expect(informe!.clasificacionOficial?.ajustes).toEqual([
        { equipo: 'C.D. RIBERT "A"', publicado: 40, deResultados: 41, sancion: 0 },
      ]);
      // El valor publicado se guarda TAL CUAL: la reconstruida no lo toca ni se «arregla» sumando.
      expect(await cuenta(pool, puntosDeOrigen('oficial', 'and s.puntos = 40'), [FEDERACION])).toBe(1);
      const registrado = await fila<{ publicado: string; de_resultados: string }>(pool,
        `select parametros->>'publicado' as publicado, parametros->>'deResultados' as de_resultados
           from ops.normalizacion_error where batch_id = $1 and codigo = 'clasificacion_oficial_con_ajuste'`,
        [informe!.batchId]);
      expect(registrado?.publicado).toBe('40');
      expect(registrado?.de_resultados).toBe('41');
    } finally {
      cola.cierra();
    }
  });
});

describe('identidad sin código federativo', () => {
  const CON_NOMBRE = (extra: string) => `select count(*) n from core.person p
      join core.person_source_identity psi on psi.person_id = p.id
      join core.federation f on f.id = psi.federation_id
     where f.codigo = $1 and ${extra}`;

  it('8. sin código: identidad nominal dentro del equipo, nunca un nombre disfrazado de código', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // Un jugador con código de verdad, para comprobar que el camino con código no se toca.
      cola.db.prepare("insert into personas (codigo, nombre, primera_acta, ultima_acta, actualizado_en) values ('J9','MORÁN, PILAR','A1','A1','2026-09-07T00:00:00Z')").run();
      cola.db.prepare("insert into participaciones values ('21','900','9001',1,'A1','local','titulares',2,null,'SIN CÓDIGO UNO',9,0,1)").run();
      // El MISMO nombre en el otro equipo: si se unieran por nombre, esto sería una sola persona.
      cola.db.prepare("insert into participaciones values ('21','900','9001',1,'A1','visitante','suplentes',1,null,'SIN CÓDIGO UNO',10,0,0)").run();
      cola.db.prepare("insert into participaciones values ('21','900','9001',1,'A1','local','titulares',3,'J9','MORÁN, PILAR',11,0,0)").run();

      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });

      // Nunca un código inventado a partir del nombre.
      expect(await cuenta(pool, CON_NOMBRE("psi.codigo_externo like 'nominal:%'"), [FEDERACION])).toBe(0);

      // Dos personas nominales: el mismo nombre en equipos distintos NO se fusiona.
      expect(await cuenta(pool, CON_NOMBRE(`p.identidad_nominal = true and psi.context_key like 'rol=jugador;temporada=2025-26;ambito=equipo:%nombre=sin codigo uno'`), [FEDERACION])).toBe(2);

      // El ámbito es el equipo, no el partido ni el acta (ADR-0011).
      expect(await cuenta(pool, CON_NOMBRE(`p.identidad_nominal = true and psi.context_key ~ '^rol=jugador;temporada=2025-26;ambito=equipo:[0-9]+;nombre=sin codigo uno$'`), [FEDERACION])).toBe(2);

      // Quien tiene código sigue siendo identidad confirmada y no nominal.
      expect(await cuenta(pool, CON_NOMBRE(`p.identidad_nominal = false and psi.codigo_externo = 'J9'`), [FEDERACION])).toBe(1);

      // Un menor sin código sigue marcado como menor: la identidad nominal no relaja la privacidad.
      expect(await cuenta(pool, CON_NOMBRE('p.identidad_nominal = true and p.es_menor = true'), [FEDERACION])).toBe(1);
    } finally {
      cola.cierra();
    }
  });

  it('9. sin código, segunda pasada: no duplica identidades ni inventa códigos', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      cola.db.prepare("insert into participaciones values ('21','900','9001',1,'A1','local','titulares',2,null,'SIN CÓDIGO UNO',9,0,0)").run();
      cola.db.prepare("insert into participaciones values ('21','900','9001',1,'A1','visitante','suplentes',1,null,'SIN CÓDIGO UNO',10,0,0)").run();
      const primera = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      // Sólo los jugadores: el acta de base trae además un árbitro y un técnico, también nominales.
      const jugadoresNominales = CON_NOMBRE("p.identidad_nominal = true and psi.context_key like 'rol=jugador;%'");
      const tras1 = await cuenta(pool, jugadoresNominales, [FEDERACION]);
      const segunda = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      const tras2 = await cuenta(pool, jugadoresNominales, [FEDERACION]);
      expect(tras1).toBe(2);
      expect(tras2).toBe(tras1);
      // La segunda pasada no crea personas: sólo actualiza.
      const creadas = Object.entries(segunda[0]!.contadores).filter(([tabla]) => tabla === 'core.person')
        .reduce((a, [, c]) => a + c.insertadas, 0);
      expect(creadas).toBe(0);
      expect(primera[0]!.batchId).not.toBe(segunda[0]!.batchId);
    } finally {
      cola.cierra();
    }
  });
});
