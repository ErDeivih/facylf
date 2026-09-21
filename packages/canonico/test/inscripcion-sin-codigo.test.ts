/**
 * Inscripciones SIN código federativo: la capacidad que hace importable un grupo de Euskadi.
 *
 * Dos bloques:
 *
 * 1. **Invariantes puros**, sin base de datos: son las reglas que impiden las fusiones falsas, y se
 *    comprueban sin PostgreSQL para que se ejecuten siempre.
 * 2. **Vuelta completa contra PostgreSQL**, con una cola sintética cuyos partidos NO traen ningún código
 *    —que es el estado real de 30.314 de los 34.358 partidos de Euskadi—: se importa dos veces y se
 *    comprueba que la segunda no inserta ninguna inscripción nueva y que la referencia contextual queda
 *    registrada con `codigo_externo` nulo.
 *
 * Nada de esto toca una cola real: todo vive en un directorio temporal y en la federación de pruebas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from '../src/origen/sqlite.js';
import { canonicoDisponible, creaPool, type PoolCanonico } from '../src/destino/pool.js';
import { importaFederacion } from '../src/lote.js';
import { revierteLote } from '../src/reversion.js';
import { MARCADORES_ESTADO_SEPARADOS, PREFIJO_CONTEXTUAL, construyeCandidatos, construyeCatalogoInscripciones, esExternalIdContextual, externalIdContextual, normalizadoDeExternalId, resuelveInscripcion, type VinculacionContextual } from '../src/resolucion/inscripcion.js';
import { MARCADORES_ESTADO } from '@facylf/ingesta';

/* ================================================================== */
/* 1. Invariantes puros                                               */
/* ================================================================== */

const citas = [
  { literal: '(Sailkatua) ALAVES "B"', codigo: null, procedencia: 'calendario' as const },
  { literal: 'BILBAO C.D.', codigo: null, procedencia: 'calendario' as const },
  { literal: 'ALAVES B', codigo: null, procedencia: 'acta' as const },
  { literal: 'BILBAO C.D.', codigo: null, procedencia: 'acta' as const },
];

const catalogo = (extra: Array<{ literal: string; codigo: string | null; procedencia: 'calendario' | 'acta' | 'clasificacion' | 'catalogo' | 'jornada' }> = [], vinculaciones?: Map<string, VinculacionContextual>) => {
  const { candidatos, ambiguos } = construyeCandidatos([...citas, ...extra]);
  return construyeCatalogoInscripciones({ candidatos, ambiguos, ...(vinculaciones ? { vinculaciones } : {}) });
};

/** Catálogo con SÓLO las citas indicadas: para las pruebas que cuentan inscripciones y no pueden heredar las de arriba. */
const catalogoSolo = (
  solo: Array<{ literal: string; codigo: string | null; procedencia: 'calendario' | 'acta' | 'clasificacion' | 'catalogo' | 'jornada' }>,
  vinculaciones?: Map<string, VinculacionContextual>,
) => {
  const { candidatos, ambiguos } = construyeCandidatos(solo);
  return construyeCatalogoInscripciones({ candidatos, ambiguos, ...(vinculaciones ? { vinculaciones } : {}) });
};

describe('la lista de marcadores que se separan es la MISMA que la de la reconstrucción', () => {
  it('coincide con la de @facylf/ingesta', () => {
    // Dos listas que se separaran sin que nadie lo note harían que el calendario y el acta hablaran de
    // equipos distintos: la reconstrucción de la cola y el importador dejarían de coincidir.
    expect([...MARCADORES_ESTADO_SEPARADOS].sort()).toEqual([...MARCADORES_ESTADO].sort());
    expect(MARCADORES_ESTADO_SEPARADOS).toContain('(sailkatua)');
    expect(MARCADORES_ESTADO_SEPARADOS).toContain('(irabazlea)');
  });
});

describe('referencia contextual', () => {
  it('el token no puede confundirse con un código federativo', () => {
    const token = externalIdContextual('alaves b');
    expect(esExternalIdContextual(token)).toBe(true);
    // Los códigos de estas federaciones son numéricos: el prefijo los hace disjuntos por construcción.
    expect(/^\d+$/.test(token)).toBe(false);
    expect(normalizadoDeExternalId(token)).toBe('alaves b');
    expect(normalizadoDeExternalId('12345')).toBe('');
    expect(token.startsWith(PREFIJO_CONTEXTUAL)).toBe(true);
  });
});

describe('los marcadores de estado se separan; los calificadores legítimos NO', () => {
  it('quita (Sailkatua), (Irabazlea) y (P) y deja el nombre limpio', () => {
    const c = catalogo();
    const r = resuelveInscripcion({ literal: '(Sailkatua) ALAVES "B"', catalogo: c });
    expect(r.limpio).toBe('ALAVES "B"');
    expect(r.marcadoresEstado).toContain('(Sailkatua)');
  });

  it('NO quita (RET), (Juv.), (Femenino) ni (VETERANOS): los conserva y los declara', () => {
    const casos: Array<[string, string]> = [
      ['ALAVES "B" (RET)', '(RET)'],
      ['CALASANZ A.D. (Juv.) "A"', '(Juv.)'],
      ['CLUB DEPORTIVO (Femenino)', '(Femenino)'],
      ['CLUB DEPORTIVO (VETERANOS)', '(VETERANOS)'],
    ];
    for (const [literal, marcador] of casos) {
      const r = resuelveInscripcion({ literal, catalogo: catalogo() });
      expect(r.limpio, literal).toContain(marcador);
      expect(r.marcadoresEstado, literal).toEqual([]);
      expect(r.marcadoresDesconocidos, literal).toContain(marcador);
    }
  });

  it('`(P)` se separa porque la fuente lo define: es «Ganador del partido en Penaltis»', () => {
    // El `title` del `<span>` que envuelve al paréntesis lo dice, 35 de 35 apariciones medidas.
    const r = resuelveInscripcion({ literal: 'ARRUPE CHAMINADE C.D. (P) (Sailkatua)', catalogo: catalogo() });
    expect(r.limpio).toBe('ARRUPE CHAMINADE C.D.');
    expect(r.marcadoresEstado.sort()).toEqual(['(P)', '(Sailkatua)']);
  });

  it('A y B permanecen separados: no se quita la letra de equipo', () => {
    const c = catalogo([
      { literal: 'ARGENTONA, C.F. "A"', codigo: '501', procedencia: 'calendario' },
      { literal: 'ARGENTONA, C.F. "B"', codigo: '502', procedencia: 'calendario' },
    ]);
    expect(resuelveInscripcion({ literal: 'ARGENTONA, C.F. "A"', catalogo: c }).codigoExterno).toBe('501');
    expect(resuelveInscripcion({ literal: 'ARGENTONA, C.F. "B"', catalogo: c }).codigoExterno).toBe('502');
  });

  it('el femenino y el masculino del mismo club NO se fusionan', () => {
    const c = catalogo([
      { literal: 'CLUB DEPORTIVO (Femenino)', codigo: null, procedencia: 'calendario' },
      { literal: 'CLUB DEPORTIVO', codigo: null, procedencia: 'calendario' },
    ]);
    const femenino = resuelveInscripcion({ literal: 'CLUB DEPORTIVO (Femenino)', catalogo: c });
    const masculino = resuelveInscripcion({ literal: 'CLUB DEPORTIVO', catalogo: c });
    expect(femenino.clave).not.toBe(masculino.clave);
    expect(femenino.referenciaContextual).not.toBe(masculino.referenciaContextual);
  });
});

describe('resolución sin código', () => {
  it('la MISMA referencia produce la MISMA inscripción', () => {
    const c = catalogo();
    const a = resuelveInscripcion({ literal: '(Sailkatua) ALAVES "B"', catalogo: c });
    const b = resuelveInscripcion({ literal: 'ALAVES "B"', catalogo: c });
    const d = resuelveInscripcion({ literal: 'ALAVES B', catalogo: c });
    expect(a.clave).toBe(b.clave);
    expect(b.clave).toBe(d.clave);
    expect(a.referenciaContextual).toBe('alaves b');
  });

  it('NO se fabrica ningún código: codigo_externo queda nulo', () => {
    const r = resuelveInscripcion({ literal: 'BILBAO C.D.', catalogo: catalogo() });
    expect(r.codigoExterno).toBeNull();
    expect(r.metodo).toBe('referencia-contextual');
    expect(r.via).toBe('nombre-limpio-unico');
  });

  it('se reutiliza una referencia contextual ya existente', () => {
    const c = catalogo();
    const r = resuelveInscripcion({
      literal: 'BILBAO C.D.', catalogo: c,
      referenciasExistentes: new Map([['bilbao c d', 'contexto:bilbao c d']]),
    });
    expect(r.via).toBe('referencia-contextual-existente');
    expect(r.clave).toBe('contexto:bilbao c d');
  });

  it('DOS homónimos del mismo ámbito quedan SIN RESOLVER: no se elige ninguno', () => {
    // Dos equipos del mismo grupo que se llaman igual: la única señal demostrable de que son dos es que
    // la fuente publica DOS CÓDIGOS distintos para ese nombre. Sin esa señal no hay nada que elegir.
    const c = catalogo([
      { literal: 'SAN JOSE', codigo: '601', procedencia: 'clasificacion' },
      { literal: 'SAN JOSE', codigo: '602', procedencia: 'catalogo' },
    ]);
    const r = resuelveInscripcion({ literal: 'SAN JOSE', catalogo: c });
    expect(r.clave).toBeNull();
    expect(r.via).toBe('sin-resolver');
    expect(r.evidencia).toMatch(/normaliza igual que otro equipo/);
  });

  it('las diferencias TIPOGRÁFICAS no son ambigüedad: son el mismo equipo', () => {
    // El calendario publica `ALAVES "B"` y el acta `ALAVES B`. Normalizar quita comillas, guiones y
    // puntos, así que las dos son el mismo nombre: declararlas ambiguas dejaría Euskadi sin importar.
    const c = catalogo([
      { literal: 'ALAVES "B"', codigo: null, procedencia: 'calendario' },
      { literal: 'ALAVES B', codigo: null, procedencia: 'acta' },
      { literal: 'ALAVES-B', codigo: null, procedencia: 'clasificacion' },
    ]);
    expect(c.ambiguos.size).toBe(0);
    const r = resuelveInscripcion({ literal: 'ALAVES "B"', catalogo: c });
    expect(r.clave).toBe('contexto:alaves b');
    // Y las tres formas se conservan: la tipografía no decide, pero no se pierde.
    expect(c.porClave.get('contexto:alaves b')!.alias).toEqual(
      expect.arrayContaining(['ALAVES "B"', 'ALAVES B', 'ALAVES-B']),
    );
  });

  it('dos CÓDIGOS para el mismo nombre normalizado tampoco se resuelven', () => {
    const c = catalogo([
      { literal: 'ALAVES B', codigo: '111', procedencia: 'calendario' },
      { literal: 'ALAVES B', codigo: '999', procedencia: 'clasificacion' },
    ]);
    const r = resuelveInscripcion({ literal: 'ALAVES B', catalogo: c });
    expect(r.clave).toBeNull();
  });

  it('un código explícito que no está en el ámbito NO se usa y no se cae al nombre', () => {
    const c = catalogo();
    const r = resuelveInscripcion({ literal: 'ALAVES "B"', codigoExplicito: '777', catalogo: c });
    expect(r.clave).toBeNull();
    expect(r.via).toBe('sin-resolver');
    expect(r.evidencia).toMatch(/es de otro ámbito y no se usa/);
  });

  it('no se usa parecido difuso: un nombre casi igual no resuelve', () => {
    const c = catalogo([{ literal: 'BILBAO C.D.', codigo: null, procedencia: 'calendario' }]);
    expect(resuelveInscripcion({ literal: 'BILBAO C.E.', catalogo: c }).clave).toBeNull();
    expect(resuelveInscripcion({ literal: 'BILBAO CLUB DEPORTIVO', catalogo: c }).clave).toBeNull();
    expect(resuelveInscripcion({ literal: 'BILBAO C.D. "B"', catalogo: c }).clave).toBeNull();
  });

  it('un mismo código citado con dos denominaciones es UNA sola inscripción', () => {
    const c = catalogoSolo([
      { literal: 'ALAVES "B"', codigo: '111', procedencia: 'calendario' },
      { literal: 'DEPORTIVO ALAVES B', codigo: '111', procedencia: 'clasificacion' },
    ]);
    expect(c.porClave.size).toBe(1);
    const a = resuelveInscripcion({ literal: 'ALAVES "B"', catalogo: c });
    // La segunda denominación también resuelve a la MISMA inscripción: es el equipo, no un homónimo.
    const b = resuelveInscripcion({ literal: 'DEPORTIVO ALAVES B', catalogo: c });
    expect(a.clave).toBe('111');
    expect(b.clave).toBe('111');
    // Y las dos formas literales se conservan como alias: ninguna se pierde.
    expect(c.porClave.get('111')!.alias).toEqual(expect.arrayContaining(['ALAVES "B"', 'DEPORTIVO ALAVES B']));
  });

  it('un nombre con DOS códigos distintos no entra en el catálogo', () => {
    const { candidatos, ambiguos } = construyeCandidatos([
      { literal: 'SAN JOSE', codigo: '601', procedencia: 'clasificacion' },
      { literal: 'SAN JOSE', codigo: '602', procedencia: 'catalogo' },
    ]);
    const c = construyeCatalogoInscripciones({ candidatos, ambiguos });
    expect(c.ambiguos.has('san jose')).toBe(true);
  });

  it('el nombre se elige por PROCEDENCIA, no por orden de llegada', () => {
    // En los dos casos las citas son las MISMAS; sólo cambia el orden. El calendario manda en el nombre.
    const soloActa = catalogoSolo([{ literal: 'ALAVES B', codigo: null, procedencia: 'acta' }]);
    const invertido = catalogoSolo([
      { literal: 'ALAVES B', codigo: null, procedencia: 'acta' },
      { literal: 'ALAVES "B"', codigo: null, procedencia: 'calendario' },
    ]);
    const alReves = catalogoSolo([
      { literal: 'ALAVES "B"', codigo: null, procedencia: 'calendario' },
      { literal: 'ALAVES B', codigo: null, procedencia: 'acta' },
    ]);
    expect(soloActa.porClave.get('contexto:alaves b')!.nombre).toBe('ALAVES B');
    // Procesar el mismo grupo en otro orden da el MISMO nombre: sin eso la importación no sería idempotente.
    expect(invertido.porClave.get('contexto:alaves b')!.nombre).toBe('ALAVES "B"');
    expect(alReves.porClave.get('contexto:alaves b')!.nombre).toBe('ALAVES "B"');
  });
});

describe('vinculación posterior de un código real', () => {
  it('se vincula conservando la referencia contextual, no se duplica ni se funde en silencio', () => {
    const vinculaciones = new Map<string, VinculacionContextual>([
      ['alaves b', { teamEntryId: 7, codigoExterno: null }],
    ]);
    const c = catalogoSolo([{ literal: 'ALAVES "B"', codigo: '111', procedencia: 'calendario' }], vinculaciones);
    const inscripcion = c.porClave.get('111');
    expect(inscripcion).toBeDefined();
    expect(inscripcion!.codigoExterno).toBe('111');
    // La referencia NO se pierde: es lo que deja el rastro de que nació sin código.
    expect(inscripcion!.referenciaContextual).toBe('alaves b');
    expect(inscripcion!.vinculada).toBe(true);
    // Y hay UNA sola inscripción, no dos.
    expect(c.porClave.size).toBe(1);
  });

  it('la inscripción contextual ya vinculada conserva su código si la fuente publica otro', () => {
    const vinculaciones = new Map<string, VinculacionContextual>([
      ['alaves b', { teamEntryId: 7, codigoExterno: '111' }],
    ]);
    const c = catalogoSolo([{ literal: 'ALAVES "B"', codigo: '999', procedencia: 'calendario' }], vinculaciones);
    // No se re-codifica en silencio: se conserva el código ya auditado.
    expect(c.porClave.get('111')!.codigoExterno).toBe('111');
  });

  it('la segunda importación devuelve la MISMA inscripción', () => {
    const vinculaciones = new Map<string, VinculacionContextual>([
      ['alaves b', { teamEntryId: 7, codigoExterno: null }],
    ]);
    const c = catalogoSolo([{ literal: '(Sailkatua) ALAVES "B"', codigo: null, procedencia: 'calendario' }], vinculaciones);
    const r = resuelveInscripcion({ literal: '(Sailkatua) ALAVES "B"', catalogo: c });
    expect(r.clave).toBe('contexto:alaves b');
    expect(c.porClave.get('contexto:alaves b')!.codigoExterno).toBeNull();
  });
});

/* ================================================================== */
/* 2. Vuelta completa contra PostgreSQL                               */
/* ================================================================== */

// Federación PROPIA de este fichero, distinta de la de `lote.test.ts`.
//
// No es un detalle de limpieza: Vitest ejecuta los dos ficheros en paralelo contra el MISMO PostgreSQL, y
// la limpieza de éste revierte los lotes de su federación. Si compartieran código de federación, la
// reversión de uno borraría los lotes del otro a mitad de prueba. Aislados por federación, cada fichero
// sólo toca lo suyo.
const FEDERACION = 'pruebas-sincodigo';

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

/**
 * Cola sintética de un grupo SIN NINGÚN CÓDIGO de equipo: ni en `equipos` ni en `partidos`.
 *
 * Es el estado real de Euskadi. Con el importador anterior, esta cola producía cero equipos y partía de
 * «participación sin equipo resoluble»; con la referencia contextual, cada equipo tiene inscripción.
 */
function creaColaSinCodigos(): ColaSintetica {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-sincodigo-'));
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
    values ('21', '900', '9001', 'GRUPO ÚNICO', 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run();
  db.prepare("insert into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en) values ('21','900','9001',1,'2026-09-06','j1.html','h1','2026-09-07T00:00:00Z')").run();
  // Los dos partidos con el marcador de estado pegado y SIN código: la maqueta nova tal cual.
  db.prepare(`insert into partidos values ('21','900','9001',1,0,'A1',null,null,'(Sailkatua) ALAVES "B"','BILBAO C.D.',2,0,'2026-09-06','12:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();
  db.prepare(`insert into partidos values ('21','900','9001',1,1,'A2',null,null,'(Irabazlea) EIBAR "C"','DERIO C.D.',1,1,'2026-09-06','18:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();
  // Las actas publican el nombre LIMPIO: es lo que sostiene que el marcador no forma parte del nombre.
  db.prepare(`insert into actas values ('A1','21','900','9001',1,0,'hecha','acta-A1.html','ha','{"local":"ALAVES B","visitante":"BILBAO C.D."}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();
  db.prepare(`insert into actas values ('A2','21','900','9001',1,0,'hecha','acta-A2.html','ha','{"local":"EIBAR C","visitante":"DERIO C.D."}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();
  return {
    raiz, db,
    cierra: () => { db.close(); rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); },
  };
}

describe.skipIf(!canonicoDisponible())('vuelta completa sin códigos, contra PostgreSQL', () => {
  let pool: PoolCanonico;
  let cola: ColaSintetica;

  beforeAll(async () => {
    pool = creaPool();
    cola = creaColaSinCodigos();
  });
  afterAll(async () => {
    cola?.cierra();
    await pool?.end();
  });
  beforeEach(async () => {
    // Cada prueba parte de cero en el ámbito de pruebas. Se usa la REVERSIÓN REAL del importador —la
    // misma que usa `--revertir`— en vez de borrados a mano: borrar `core.match` a pelo choca con las
    // claves ajenas de `match_source`, `appearance` y compañía, y una limpieza que hay que mantener a
    // mano se queda obsoleta en cuanto se añade una tabla.
    const cliente = await pool.connect();
    try {
      const { rows } = await cliente.query<{ id: string }>(
        `select b.id from ops.batch b join core.federation f on f.id = b.federation_id
          where f.codigo = $1 and b.estado <> 'revertido' order by b.id`, [FEDERACION],
      );
      for (const fila of rows) {
        await revierteLote(pool, Number(fila.id)).catch(() => undefined);
      }
    } finally { cliente.release(); }
  });

  const cuenta = async () => {
    const cliente = await pool.connect();
    try {
      const { rows } = await cliente.query<{ n: string }>(
        `select count(*) n from core.team_entry te
           join core.phase_group pg on pg.id = te.phase_group_id
           join core.competition_edition ce on ce.id = pg.competition_edition_id
           join core.federation f on f.id = ce.federation_id
          where f.codigo = $1`, [FEDERACION],
      );
      return Number(rows[0]?.n ?? 0);
    } finally { cliente.release(); }
  };

  it('importa un grupo SIN ningún código: cada equipo tiene inscripción y código_externo nulo', async () => {
    const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
    expect(informes).toHaveLength(1);
    expect(await cuenta()).toBe(4);

    const cliente = await pool.connect();
    try {
      const { rows } = await cliente.query<{ nombre_en_fuente: string; codigo_externo: string | null; referencia_contextual: string; metodo_resolucion: string; nombre_en_fuente_norm: string }>(
        `select te.nombre_en_fuente, te.codigo_externo, te.referencia_contextual, te.metodo_resolucion, te.nombre_en_fuente_norm
           from core.team_entry te
           join core.phase_group pg on pg.id = te.phase_group_id
           join core.competition_edition ce on ce.id = pg.competition_edition_id
           join core.federation f on f.id = ce.federation_id
          where f.codigo = $1 order by te.nombre_en_fuente`, [FEDERACION],
      );
      // Ni un código fabricado: los cuatro nulos.
      expect(rows.every((r) => r.codigo_externo === null)).toBe(true);
      expect(rows.every((r) => r.metodo_resolucion === 'referencia-contextual')).toBe(true);
      expect(rows.every((r) => r.referencia_contextual !== null)).toBe(true);
      // El nombre guardado es el LIMPIO: el marcador de estado no forma parte del nombre del equipo.
      const nombres = rows.map((r) => r.nombre_en_fuente);
      expect(nombres).toEqual(['ALAVES "B"', 'BILBAO C.D.', 'DERIO C.D.', 'EIBAR "C"']);
      expect(nombres.join(' ')).not.toMatch(/Sailkatua|Irabazlea/);

      // Y la referencia contextual queda registrada en source.external_ref, con el token `ctx:`.
      const { rows: refs } = await cliente.query<{ external_id: string; canonical_id: string }>(
        `select external_id, canonical_id from source.external_ref
          where entity_type = 'equipo' and external_id like $1`, [`${PREFIJO_CONTEXTUAL}%`],
      );
      expect(refs.length).toBeGreaterThanOrEqual(4);
      expect(refs.every((r) => esExternalIdContextual(r.external_id))).toBe(true);

      // Los partidos tienen los DOS lados resueltos: ninguno se importa con un equipo sin resolver.
      const { rows: partidos } = await cliente.query<{ home_team_entry_id: string | null; away_team_entry_id: string | null }>(
        `select m.home_team_entry_id, m.away_team_entry_id from core.match m
           join core.phase_group pg on pg.id = m.phase_group_id
           join core.competition_edition ce on ce.id = pg.competition_edition_id
           join core.federation f on f.id = ce.federation_id
          where f.codigo = $1`, [FEDERACION],
      );
      expect(partidos).toHaveLength(2);
      expect(partidos.every((p) => p.home_team_entry_id !== null && p.away_team_entry_id !== null)).toBe(true);

      // La procedencia se conserva: el literal ORIGINAL con el marcador queda como alias.
      const { rows: alias } = await cliente.query<{ literal: string }>(
        `select ta.literal from core.team_alias ta
           join core.team_season ts on ts.id = ta.team_season_id
           join core.team_entry te on te.team_season_id = ts.id
           join core.phase_group pg on pg.id = te.phase_group_id
           join core.competition_edition ce on ce.id = pg.competition_edition_id
           join core.federation f on f.id = ce.federation_id
          where f.codigo = $1`, [FEDERACION],
      );
      const literales = alias.map((a) => a.literal);
      expect(literales).toContain('(Sailkatua) ALAVES "B"');
      expect(literales).toContain('(Irabazlea) EIBAR "C"');
      // Y también el limpio que publica el acta.
      expect(literales).toContain('ALAVES B');
    } finally { cliente.release(); }
  });

  it('la importación repetida inserta CERO entidades nuevas', async () => {
    await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
    const tras1 = await cuenta();
    const segundo = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
    expect(await cuenta()).toBe(tras1);
    // La segunda pasada no crea nada: la referencia contextual devuelve la misma inscripción.
    const insertadas = Object.values(segundo[0]!.contadores).reduce((a, c) => a + c.insertadas, 0);
    expect(insertadas).toBe(0);
  });

  /**
   * Regresión de un defecto real, medido importando el grupo 24038325 de Euskadi SIN reconstruir la cola:
   *
   *     ON CONFLICT DO UPDATE command cannot affect row a second time
   *
   * `calculaClasificacion` agrupa equipos por NOMBRE. En Euskadi el mismo equipo aparece con el marcador
   * de estado pegado en unas jornadas y sin él en otras, así que agrupar por el literal de la cola lo
   * partía en dos filas de la tabla que apuntaban a la MISMA inscripción, y al escribir
   * `standing_snapshot` —clave (phase_group_id, matchday_id, team_entry_id, origen)— chocaban.
   *
   * La reconstrucción de la cola lo tapaba, porque deja los nombres limpios. Pero el importador no puede
   * depender de que la cola esté limpia: la reconstrucción es una operación aparte, con su manifiesto y su
   * ventana, y el importador tiene que ser correcto con los datos que haya.
   */
  it('un equipo citado con y sin marcador en la MISMA jornada no parte la clasificación', async () => {
    const db = cola.db;
    db.prepare(`insert or replace into grupos (temporada, competicion, codigo, nombre, jornadas, comprobado_en, jornadas_comprobadas_en)
      values ('21', '900', '9002', 'GRUPO MIXTO', 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`).run();
    db.prepare(`insert or replace into jornadas (temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en)
      values ('21','900','9002',1,'2026-09-06','j1.html','h1','2026-09-07T00:00:00Z')`).run();
    // El MISMO equipo, `ALAVES "B"`, con marcador en una fila y sin él en la otra.
    db.prepare(`insert or replace into partidos values ('21','900','9002',1,0,'A9',null,null,'ALAVES "B"','BILBAO C.D.',1,0,'2026-09-06','12:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();
    db.prepare(`insert or replace into partidos values ('21','900','9002',1,1,'A10',null,null,'(Sailkatua) ALAVES "B"','DERIO C.D.',2,1,'2026-09-06','18:00','CAMPO DE PRUEBAS','C1',null,'2026-09-07T00:00:00Z')`).run();
    db.prepare(`insert or replace into actas values ('A9','21','900','9002',1,0,'hecha','a9.html','h','{"local":"ALAVES B","visitante":"BILBAO C.D."}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();
    db.prepare(`insert or replace into actas values ('A10','21','900','9002',1,0,'hecha','a10.html','h','{"local":"ALAVES B","visitante":"DERIO C.D."}','2026-09-07T00:00:00Z',19,'correcta','[]')`).run();

    const informes = await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9002' });
    expect(informes[0]!.validacion.ok).toBe(true);

    const cliente = await pool.connect();
    try {
      // La tabla se agrupa por INSCRIPCIÓN: tres equipos, tres filas, ninguna repetida.
      const { rows } = await cliente.query<{ filas: number; equipos: number }>(
        `select count(*)::int filas, count(distinct s.team_entry_id)::int equipos
           from core.standing_snapshot s join core.phase_group pg on pg.id = s.phase_group_id
          where pg.codigo_externo = '9002'`,
      );
      expect(rows[0]!.equipos).toBe(3);
      expect(rows[0]!.filas).toBe(rows[0]!.equipos);

      // Y ningún nombre de equipo-temporada conserva el marcador: se guarda el nombre limpio.
      const { rows: contaminados } = await cliente.query<{ nombre: string }>(
        `select ts.nombre from core.team_season ts
           join core.team_entry te on te.team_season_id = ts.id
           join core.phase_group pg on pg.id = te.phase_group_id
          where pg.codigo_externo = '9002' and ts.nombre like '%(Sailkatua)%'`,
      );
      expect(contaminados).toHaveLength(0);
    } finally { cliente.release(); }
  });

  it('un código REAL que aparece después se VINCULA: no duplica inscripción ni pierde la referencia', async () => {
    await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
    const antes = await cuenta();

    // La fuente publica ahora el código de uno de los equipos, en una fila del calendario.
    const db = cola.db;
    db.exec("update partidos set equipo_local_codigo = '111' where orden = 0");
    try {
      await importaFederacion(pool, { raiz: cola.raiz, federacion: FEDERACION, temporada: '2025-26', grupo: '9001' });
      // Ni una inscripción más: el código se ha VINCULADO a la que ya existía.
      expect(await cuenta()).toBe(antes);

      const cliente = await pool.connect();
      try {
        const { rows } = await cliente.query<{ codigo_externo: string | null; referencia_contextual: string | null; codigo_vinculado_en: string | null }>(
          `select te.codigo_externo, te.referencia_contextual, te.codigo_vinculado_en
             from core.team_entry te
             join core.phase_group pg on pg.id = te.phase_group_id
             join core.competition_edition ce on ce.id = pg.competition_edition_id
             join core.federation f on f.id = ce.federation_id
            where f.codigo = $1 and te.codigo_externo = '111'`, [FEDERACION],
        );
        expect(rows).toHaveLength(1);
        // La vinculación es auditable: conserva la referencia contextual Y está fechada.
        expect(rows[0]!.referencia_contextual).not.toBeNull();
        expect(rows[0]!.codigo_vinculado_en).not.toBeNull();

        // Y las DOS referencias externas apuntan a la MISMA inscripción.
        const { rows: refs } = await cliente.query<{ external_id: string }>(
          `select external_id from source.external_ref
            where entity_type = 'equipo' and canonical_id = $1 order by external_id`, [rows[0] && (await cliente.query<{ id: string }>(
            `select id from core.team_entry where codigo_externo = '111' and phase_group_id in
              (select pg.id from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id
                join core.federation f on f.id = ce.federation_id where f.codigo = $1)`, [FEDERACION],
          )).rows[0]!.id],
        );
        expect(refs.map((r) => r.external_id)).toContain('111');
        expect(refs.some((r) => esExternalIdContextual(r.external_id))).toBe(true);
      } finally { cliente.release(); }
    } finally {
      db.exec("update partidos set equipo_local_codigo = null where orden = 0");
    }
  });
});
