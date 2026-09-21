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
    await cliente.query(`delete from core.person where id not in (select person_id from core.person_source_identity)`, []);
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
});

/**
 * Colas reales SIN `jugador_codigo`. No es un caso raro: medido en las colas de verdad, Cataluña trae
 * 255.701 de 255.701 participaciones sin código, Navarra 286.064 de 422.475 y Castilla y León 17.596
 * de 644.336. Antes, el importador se inventaba un código con el nombre (`nominal:<NOMBRE>`), lo que
 * unía a todas las personas que se llaman igual en toda la federación y además las marcaba como
 * identidad confirmada. Estas pruebas fijan lo contrario.
 */
describe('clasificación reconstruida', () => {
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
      const aparicionesLocal = await cuenta(pool,
        `select count(*) n from core.appearance a join core.team_entry te on te.id = a.team_entry_id
          where a.lado = 'local' and te.nombre_en_fuente = 'C.D. RIBERT "A"'`, []);
      const aparicionesVisitante = await cuenta(pool,
        `select count(*) n from core.appearance a join core.team_entry te on te.id = a.team_entry_id
          where a.lado = 'visitante' and te.nombre_en_fuente = 'S.D. SAN JOSE "B"'`, []);
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

  it('16. un equipo de la tabla oficial que no está en el grupo detiene el lote y no escribe nada', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      escribeJson(cola, [
        filaJson({ posicion: 1, equipo: 'C.D. RIBERT "A"' }),
        filaJson({ posicion: 2, equipo: 'CLUB DE OTRO GRUPO "A"', puntos: 3, ganados: 1, empatados: 0, perdidos: 1 }),
      ]);
      await expect(importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' }))
        .rejects.toThrow(/no se pueden resolver dentro de su propio grupo/);
      // Media tabla oficial no se escribe, y tampoco se deja el grupo a medias.
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
      expect(await cuenta(pool, puntosDeOrigen('reconstruida'), [FEDERACION])).toBe(0);
      expect(await cuenta(pool, `select count(*) n from core.match m join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id where f.codigo = $1`, [FEDERACION])).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('17. una tabla oficial inválida detiene el lote en vez de convertirse', async () => {
    if (!disponible || !pool) return;
    const cola = creaCola();
    try {
      siembraBase(cola);
      // `puntos: 0.25` es literalmente lo que publican 5 ficheros del corpus. Redondear sería inventar.
      escribeJson(cola, [filaJson({ puntos: 0.25, ganados: 2, empatados: 1, perdidos: 1, jugados: 4 })]);
      await expect(importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' }))
        .rejects.toThrow(/R7/);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
    } finally {
      cola.cierra();
    }
  });

  it('18. si el HTML y el JSON dicen cosas distintas, no se elige ninguna', async () => {
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
      await expect(importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' }))
        .rejects.toThrow(/se lee distinta en el HTML y en el JSON/);
      expect(await cuenta(pool, puntosDeOrigen('oficial'), [FEDERACION])).toBe(0);
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
