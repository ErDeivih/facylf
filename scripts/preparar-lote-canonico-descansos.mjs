#!/usr/bin/env node
/**
 * Prepara —NO aplica— el lote canónico de retirada de las inscripciones FANTASMA de descanso.
 *
 * Es el paso 1 de la reparación canónica del §6 de `docs/plataforma-web/REPARACION-DESCANSOS.md`: la fuente
 * publicó el bloque de descanso como si fuera un partido y el canónico acabó con una inscripción llamada
 * `Atsedena` y sus partidos. La cola ya está reparada; el canónico todavía no.
 *
 * Qué hace, y por qué así:
 *
 *   1. **Sólo lee.** Conecta con `DATABASE_URL_LECTOR`, que es el rol de sólo lectura, y no escribe ni una
 *      fila en PostgreSQL. El lote se guarda como fichero en `pruebas/reconstruccion/canonico/`.
 *   2. **Guarda las filas ENTERAS** (`to_jsonb`) de la inscripción y de sus partidos. Es el `antes` que hace
 *      falta para poder revertir: una retirada no es un `update`, es un `delete` que hay que poder deshacer.
 *   3. **Cuenta los dependientes por las claves foráneas REALES**, no por una lista escrita a mano: lee
 *      `pg_constraint` y recorre cada tabla que apunta a `core.team_entry` o a `core.match`. Si alguna
 *      tuviera filas, el lote **no se prepara** y el script falla: un lote a medias que borre la inscripción y
 *      deje huérfano un dependiente es peor que no hacer nada.
 *   4. **Comprueba la PRECONDICIÓN de origen**: el grupo no debe tener ya ninguna fila de descanso en la cola
 *      SQLite. Si la tuviera, retirar el lado canónico dejaría la cola y el canónico contando cosas distintas,
 *      así que el lote se declara NO aplicable y se dice por qué.
 *
 * Uso:
 *   npx tsx scripts/preparar-lote-canonico-descansos.mjs
 *   npx tsx scripts/preparar-lote-canonico-descansos.mjs --federacion euskadi --json <ruta> --md <ruta>
 */
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

import { huella } from '../packages/ingesta/src/reconstruccion-cola/digest.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const federacion = arg('federacion');

/** El vocabulario de descanso. Se declara aquí y no se importa de la ingesta: el canónico ya no sabe de maquetas. */
const PALABRAS = ['descansa', 'descans', 'descanso', 'atsedena'];

const raiz = resolve(process.env.FACYLF_RAIZ ?? join(import.meta.dirname, '..'));
const carpetaSalida = join(raiz, 'pruebas', 'reconstruccion', 'canonico');

const url = process.env.DATABASE_URL_LECTOR;
if (!url) {
  console.error('✗ Falta DATABASE_URL_LECTOR en .env: este preparador sólo lee, y lee con el rol de lectura.');
  process.exit(2);
}
if (/facylf_admin|facylf_publicador/.test(url)) {
  console.error('✗ DATABASE_URL_LECTOR no apunta al rol de lectura: un preparador que puede escribir acaba escribiendo.');
  process.exit(2);
}

/*
 * `pg` se resuelve DESDE el paquete del canónico, que es quien lo declara: en la raíz no está instalado, y un
 * import directo desde `scripts/` falla con ERR_MODULE_NOT_FOUND.
 */
const pg = createRequire(join(import.meta.dirname, '..', 'packages', 'canonico', 'package.json'))('pg');
const pool = new pg.Pool({ connectionString: url, max: 2, application_name: 'facylf-prepara-retirada' });
let cliente;
try {
  cliente = await pool.connect();
} catch (error) {
  console.error(`✗ No hay PostgreSQL canónico disponible: ${String(error.message).split('\n')[0]}`);
  await pool.end().catch(() => undefined);
  process.exit(2);
}

/** Claves foráneas que apuntan a una tabla, leídas del catálogo. Es la lista exhaustiva, no una copia a mano. */
async function dependientesDe(esquema, tabla) {
  const { rows } = await cliente.query(
    `select con.conname,
            ns.nspname as hijo_esquema, cl.relname as hijo_tabla,
            att.attname as hijo_columna,
            (select string_agg(a.attname, ',' order by u.ord)
               from unnest(con.conkey) with ordinality as u(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = u.attnum) as hijo_columnas
       from pg_constraint con
       join pg_class cl on cl.oid = con.conrelid
       join pg_namespace ns on ns.oid = cl.relnamespace
       join pg_class ref on ref.oid = con.confrelid
       join pg_namespace nref on nref.oid = ref.relnamespace
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f' and nref.nspname = $1 and ref.relname = $2
      order by ns.nspname, cl.relname`,
    [esquema, tabla],
  );
  return rows;
}

/** Cuenta las filas del hijo que apuntan a alguno de los ids dados. Sólo lectura. */
async function cuentaDependientes(fk, ids) {
  if (ids.length === 0) return 0;
  const columnas = String(fk.hijo_columnas).split(',');
  // Se prueba CUALQUIERA de las columnas de la clave: en una clave compuesta eso puede incluir de más, y esa
  // es la dirección segura —el cierre se lleva de más, nunca de menos—. La primera columna es la que lleva el
  // id del padre en todas las claves de este esquema.
  const condicion = columnas.map((c) => `${c} = any($1::bigint[])`).join(' or ');
  const { rows } = await cliente.query(
    `select count(*)::int as n from ${fk.hijo_esquema}.${fk.hijo_tabla} where ${condicion}`,
    [ids],
  );
  return rows[0].n;
}

/** Las filas del hijo que apuntan a alguno de los ids dados, enteras. Es el `antes` de la reversión. */
async function filasDependientes(fk, ids) {
  if (ids.length === 0) return [];
  const columnas = String(fk.hijo_columnas).split(',');
  const condicion = columnas.map((c) => `${c} = any($1::bigint[])`).join(' or ');
  const { rows } = await cliente.query(
    `select to_jsonb(t) as fila from ${fk.hijo_esquema}.${fk.hijo_tabla} t where ${condicion} order by t.ctid`,
    [ids],
  );
  return rows.map((r) => r.fila);
}

/*
 * Las inscripciones fantasma: nombre en la fuente que es EXACTAMENTE una palabra de descanso. La función
 * `core.normaliza_nombre` es la misma que usa el importador para decidir identidades, así que el filtro no
 * inventa una normalización propia.
 */
const { rows: fantasma } = await cliente.query(
  `select te.id, te.nombre_en_fuente, te.codigo_externo, te.metodo_resolucion, te.procedencias,
          te.team_season_id, te.phase_group_id,
          pg.codigo_externo as grupo_codigo, pg.nombre as grupo_nombre,
          ce.codigo_externo as competicion_codigo, ce.nombre_publicado as competicion_nombre,
          ce.visibility_state,
          s.etiqueta as temporada, f.codigo as federacion,
          to_jsonb(te) as fila
     from core.team_entry te
     join core.phase_group pg on pg.id = te.phase_group_id
     join core.competition_edition ce on ce.id = pg.competition_edition_id
     join core.season s on s.id = ce.season_id
     join core.federation f on f.id = ce.federation_id
    where core.normaliza_nombre(te.nombre_en_fuente) = any($1::text[])
      and ($2::text is null or f.codigo = $2)
    order by f.codigo, s.etiqueta, pg.codigo_externo`,
  [PALABRAS, federacion ?? null],
);

const fkEntrada = await dependientesDe('core', 'team_entry');
const fkPartido = await dependientesDe('core', 'match');

const problemas = [];
const lotes = [];

for (const f of fantasma) {
  /*
   * ── El CIERRE de la retirada ─────────────────────────────────────────────────────────────────────
   *
   * Qué hay que retirar no es sólo la inscripción: son la inscripción y **todo lo que existe únicamente por
   * ella**. Se calcula recorriendo las claves foráneas REALES desde la inscripción hacia abajo, tabla por
   * tabla, hasta que no aparece nada nuevo. Así no se deja ningún huérfano, y no hay que fiarse de una lista
   * escrita a mano: si mañana se añade una tabla que apunte a los partidos, el cierre la trae sola.
   *
   * Medido aquí: la inscripción 5344 trae 2 partidos y, colgando de ellos, 2 filas de `core.match_source`;
   * ninguna aparición, ningún evento, ninguna ficha de cuerpo técnico, ninguna fila de clasificación y
   * ningún resumen de equipo.
   */
  const clavesForaneas = [
    ...fkEntrada.map((x) => ({ ...x, sobre: 'core.team_entry' })),
    ...fkPartido.map((x) => ({ ...x, sobre: 'core.match' })),
  ];
  const porTabla = new Map();
  const anade = (tabla, filas) => {
    if (filas.length === 0) return;
    const previas = porTabla.get(tabla) ?? new Map();
    for (const fila of filas) previas.set(String(fila.id), fila);
    porTabla.set(tabla, previas);
  };
  anade('core.team_entry', [f.fila]);

  // BFS por profundidad: 0 la inscripción, 1 los partidos, 2 lo que cuelga de los partidos…
  const niveles = [{ tabla: 'core.team_entry', ids: [Number(f.id)] }];
  for (let profundidad = 0; profundidad < 4 && niveles.length; profundidad += 1) {
    const siguiente = [];
    for (const nivel of niveles) {
      for (const fk of clavesForaneas.filter((x) => x.sobre === nivel.tabla)) {
        const tabla = `${fk.hijo_esquema}.${fk.hijo_tabla}`;
        const filas = await filasDependientes(fk, nivel.ids);
        if (filas.length === 0) continue;
        anade(tabla, filas);
        siguiente.push({ tabla, ids: filas.map((x) => Number(x.id)).filter(Number.isInteger) });
      }
    }
    niveles.length = 0;
    niveles.push(...siguiente);
  }

  const cierre = [...porTabla.entries()]
    .map(([tabla, filas]) => ({ tabla, filas: [...filas.values()] }))
    .sort((a, b) => a.tabla.localeCompare(b.tabla));
  const totalCierre = cierre.reduce((n, c) => n + c.filas.length, 0);
  const idsPartidos = (porTabla.get('core.match') ? [...porTabla.get('core.match').values()] : []).map((p) => Number(p.id));
  /*
   * Y —esto es lo que hay que poder afirmar sin depender de una lista escrita a mano— las tablas que SÍ
   * apuntan a la inscripción o a sus partidos y NO tienen ni una fila. Las apariciones, los eventos, las
   * fichas de cuerpo técnico, las clasificaciones y los resúmenes de equipo salen de aquí: no es que no se
   * hayan mirado, es que se han mirado por su clave foránea real y están a cero.
   */
  const tablasConFilas = new Set(cierre.map((c) => c.tabla));
  const dependientesEnCero = [...new Set([...fkEntrada, ...fkPartido]
    .map((x) => `${x.hijo_esquema}.${x.hijo_tabla}`))]
    .filter((t) => !tablasConFilas.has(t))
    .sort();

  /*
   * LA PRECONDICIÓN DE ORIGEN. La reparación canónica sólo tiene sentido si la cola ya no publica esas filas:
   * si la cola todavía las tuviera, el canónico dejaría de reflejar la fuente y el defecto volvería a entrar
   * en la siguiente importación. Se mide en la SQLite, que es la evidencia de ingesta.
   */
  const carpeta = f.federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${f.federacion}`;
  const rutaCola = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
  const origen = { ruta_cola: rutaCola, filas_del_grupo: null, filas_de_descanso: [], aplicable: null, motivo: null };
  try {
    const db = new DatabaseSync(rutaCola, { readOnly: true });
    try {
      const filas = db.prepare(`select jornada, orden, local, visitante, codigo_acta from partidos
        where competicion = ? and grupo = ? order by jornada, orden`)
        .all(f.competicion_codigo, f.grupo_codigo);
      const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      origen.filas_del_grupo = filas.length;
      origen.filas_de_descanso = filas.filter((x) => PALABRAS.includes(norm(x.local)) || PALABRAS.includes(norm(x.visitante)));
      origen.aplicable = origen.filas_de_descanso.length === 0;
      origen.motivo = origen.aplicable
        ? 'la cola del grupo no tiene ninguna fila de descanso: el canónico es lo único que queda por reparar'
        : `la cola TODAVÍA tiene ${origen.filas_de_descanso.length} fila(s) de descanso en ese grupo`;
    } finally {
      db.close();
    }
  } catch (error) {
    // Sin cola legible no se puede demostrar la precondición, y no se declara lo que no se puede demostrar.
    origen.aplicable = null;
    origen.motivo = `no se pudo leer la cola: ${String(error.message).split('\n')[0]}`;
  }

  /*
   * ── EL CUADRE ────────────────────────────────────────────────────────────────────────────────────
   *
   * El canónico tiene que tener EXACTAMENTE los partidos que el canónico heredó de la cola de antes: si el
   * grupo tiene hoy 25 partidos en el canónico y 23 filas en la cola, y el lote retira 2, la diferencia entre
   * las dos cifras tiene que ser justo lo que el lote retira. No es una comprobación decorativa: es la que
   * demuestra que el lote retira ni más ni menos que lo que sobra, y sin ella el lote sólo sería una
   * afirmación sobre la fuente.
   */
  const { rows: canonico } = await cliente.query(
    `select (select count(*)::int from core.match where phase_group_id = $1) as partidos,
            (select count(*)::int from core.matchday where phase_group_id = $1) as jornadas,
            (select count(*)::int from core.team_entry where phase_group_id = $1) as inscripciones`,
    [f.phase_group_id],
  );
  const partidosEnElCierre = (porTabla.get('core.match')?.size ?? 0);
  const cuadre = {
    grupo_canonico_id: Number(f.phase_group_id),
    partidos_canonicos: canonico[0].partidos,
    jornadas_canonicas: canonico[0].jornadas,
    inscripciones_canonicas: canonico[0].inscripciones,
    filas_en_la_cola: origen.filas_del_grupo,
    partidos_que_retira_el_lote: partidosEnElCierre,
    diferencia: origen.filas_del_grupo === null ? null : canonico[0].partidos - origen.filas_del_grupo,
    cuadra: origen.filas_del_grupo !== null && canonico[0].partidos - origen.filas_del_grupo === partidosEnElCierre,
  };

  const lote = {
    federacion: f.federacion,
    temporada: f.temporada,
    competicion: f.competicion_codigo,
    grupo: f.grupo_codigo,
    nombre_del_hueco: f.nombre_en_fuente,
    visibility_state: f.visibility_state,
    inscripcion_id: Number(f.id),
    partidos: idsPartidos,
    // El cierre entero, con las filas completas: es lo que hay que retirar y lo que la reversión tiene que
    // volver a insertar. No se guarda un resumen: se guarda la fila.
    cierre,
    filas_en_el_cierre: totalCierre,
    dependientes_en_cero: dependientesEnCero,
    origen,
    cuadre,
    /*
     * ¿Se puede aplicar HOY? Dos condiciones, y ninguna es una opinión:
     *   · el origen (la cola) ya no publica el bloque de descanso de ese grupo;
     *   · el cierre está medido, es decir, se han recorrido las claves foráneas y todo lo que cuelga está
     *     dentro del lote —no queda ningún dependiente fuera—.
     */
    aplicable: origen.aplicable === true && cuadre.cuadra,
    impedimentos: [
      ...(origen.aplicable === true ? [] : [`origen: ${origen.motivo}`]),
      ...(cuadre.cuadra ? [] : [`cuadre: el canónico tiene ${cuadre.partidos_canonicos} partidos y la cola ${cuadre.filas_en_la_cola}: `
        + `la diferencia ${cuadre.diferencia} no es lo que el lote retira (${cuadre.partidos_que_retira_el_lote})`]),
    ],
  };
  lotes.push(lote);
  if (!lote.aplicable) problemas.push(`${f.federacion} ${f.temporada} c${f.competicion_codigo} g${f.grupo_codigo} «${f.nombre_en_fuente}»: ${lote.impedimentos.join(' · ')}`);
}

cliente.release();
await pool.end();

const medidoEn = new Date().toISOString();
const informe = {
  generado_en: medidoEn,
  lee_con: 'DATABASE_URL_LECTOR (sólo lectura)',
  escribe_en_postgres: false,
  vocabulario: PALABRAS,
  claves_foraneas_revisadas: {
    'core.team_entry': fkEntrada.map((x) => `${x.hijo_esquema}.${x.hijo_tabla}.${x.hijo_columna}`),
    'core.match': fkPartido.map((x) => `${x.hijo_esquema}.${x.hijo_tabla}.${x.hijo_columna}`),
  },
  inscripciones_fantasma: lotes.length,
  lotes,
};
informe.id = huella(JSON.stringify({ lotes: lotes.map((l) => [l.federacion, l.temporada, l.competicion, l.grupo, l.inscripcion_id, l.partidos]) }));
informe.aplicable = lotes.length > 0 && lotes.every((l) => l.aplicable);

const rutaJson = resolve(arg('json') ?? join(carpetaSalida, `descansos-canonicos-${informe.id}.json`));
const rutaMd = resolve(arg('md') ?? rutaJson.replace(/\.json$/, '.md'));
mkdirSync(join(rutaJson, '..'), { recursive: true });

const lineas = [
  '# Lote canónico de retirada de las inscripciones fantasma de descanso',
  '',
  `Medido: ${medidoEn} · id del lote: \`${informe.id}\` · **preparado y NO aplicado**.`,
  '',
  'Este fichero lo genera `scripts/preparar-lote-canonico-descansos.mjs`, que **sólo lee** (rol',
  '`DATABASE_URL_LECTOR`). No se ha borrado ni modificado ninguna fila canónica: la retirada no se hace a mano.',
  '',
  `Inscripciones fantasma encontradas: **${informe.inscripciones_fantasma}** · cola de origen ya limpia: **${informe.aplicable ? 'sí' : 'NO'}**.`,
  '',
  '## Qué se retiraría, fila a fila',
  '',
];

for (const l of lotes) {
  lineas.push(`### ${l.federacion} · ${l.temporada} · competición ${l.competicion} · grupo ${l.grupo} · «${l.nombre_del_hueco}»`);
  lineas.push('');
  lineas.push(`- inscripción \`core.team_entry\` **${l.inscripcion_id}** · visibilidad del grupo: \`${l.visibility_state}\``);
  lineas.push(`- partidos \`core.match\`: ${l.partidos.map((p) => `**${p}**`).join(', ') || '(ninguno)'}`);
  lineas.push('- cierre de la retirada, contado por las claves foráneas **reales** (no por una lista a mano):');
  lineas.push('');
  lineas.push('  | tabla | filas que se retiran |');
  lineas.push('  |---|---|');
  for (const c of l.cierre) lineas.push(`  | \`${c.tabla}\` | ${c.filas.length} |`);
  lineas.push('');
  lineas.push('  Y a **cero filas** —miradas por su clave foránea real, no por una lista a mano—:');
  lineas.push(`  ${l.dependientes_en_cero.map((t) => `\`${t}\``).join(', ')}.`);
  lineas.push('');
  lineas.push(`- cola de origen: ${l.origen.filas_del_grupo ?? '?'} filas en el grupo, ${l.origen.filas_de_descanso.length} de descanso → ${l.origen.motivo}`);
  lineas.push(`- **cuadre**: canónico ${l.cuadre.partidos_canonicos} partidos − cola ${l.cuadre.filas_en_la_cola} filas `
    + `= ${l.cuadre.diferencia}, y el lote retira ${l.cuadre.partidos_que_retira_el_lote} partidos → `
    + `${l.cuadre.cuadra ? '**cuadra**' : '**NO CUADRA**'}`);
  lineas.push(`- aplicable: ${l.aplicable ? '**sí**, cuando exista la acción de borrado del diario' : `**no** — ${l.impedimentos.join(' · ')}`}`);
  lineas.push('');
  lineas.push('```json');
  lineas.push(JSON.stringify(l.cierre, null, 2));
  lineas.push('```');
  lineas.push('');
}

lineas.push('## Cómo se aplicaría y cómo se revertiría');
lineas.push('');
lineas.push('**Hoy no se puede aplicar con la maquinaria que existe.** `revierteLote` (`packages/canonico/src/reversion.ts`)');
lineas.push('sabe deshacer dos cosas: una fila que el lote **insertó** (`accion = \'insert\'` → la borra) y una que');
lineas.push('**actualizó** (`anterior` → la restaura). No sabe deshacer un **borrado**, así que un lote que retirara');
lineas.push('estas filas sería irreversible con el diario actual. Antes de aplicarlo hay que añadir esa acción');
lineas.push('—`borrado` con la fila entera en `anterior`, y la reinserción en orden INVERSO al de borrado— con sus');
lineas.push('pruebas: preparar → aplicar → revertir tiene que dejar la huella lógica idéntica.');
lineas.push('');
lineas.push('Y queda dicho por qué el diario del lote que las creó no sirve: la inscripción la creó el lote **1492**,');
lineas.push('cuyo `ops.batch_cambio` ya no existe —lo sustituyó el lote 1493 del mismo ámbito—, y el 1493 sólo tiene');
lineas.push('entradas de **actualización** de esa fila. Revertir 1493 restauraría valores, no retiraría nada.');
lineas.push('');

writeFileSync(rutaJson, `${JSON.stringify(informe, null, 2)}\n`);
writeFileSync(rutaMd, `${lineas.join('\n')}\n`);

console.log(`inscripciones fantasma de descanso: ${lotes.length}`);
for (const l of lotes) {
  const cierre = l.cierre.map((c) => `${c.tabla}=${c.filas.length}`).join(' · ');
  console.log(`  ${l.federacion} ${l.temporada} c${l.competicion} g${l.grupo} «${l.nombre_del_hueco}» · `
    + `inscripción ${l.inscripcion_id} · cierre: ${cierre} · aplicable ${l.aplicable ? 'sí' : 'NO'}`);
}
console.log(`claves foráneas revisadas hacia core.team_entry: ${fkEntrada.length} · hacia core.match: ${fkPartido.length}`);
console.log(`lote: ${rutaJson}`);
console.log(`legible: ${rutaMd}`);
console.log('\nno se ha escrito NADA en PostgreSQL: para aplicar hace falta la acción `borrado` del diario canónico');
if (problemas.length) {
  console.log('\nimpedimentos declarados:');
  for (const p of problemas) console.log(`  · ${p}`);
}
