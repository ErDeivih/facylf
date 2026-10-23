#!/usr/bin/env node
/*
 * PREPARA —NO APLICA— EL LOTE DE RETIRADA DE UN GRUPO DEL CANÓNICO, PARA PODER REIMPORTARLO.
 *
 * Por qué existe. Cuando el calendario de un grupo se REPARA en la cola (ver
 * `scripts/repara-calendario-cataluna.mjs`), el canónico se queda con los partidos viejos: al reimportar, la
 * validación para el lote con `partidos 9≠306` —el destino tiene los 306 inventados de antes—. Y hace bien:
 * que la fuente encoja no puede ser motivo para borrar datos en silencio.
 *
 * El camino es el que ya existe para esto: **retirar el grupo y volver a importarlo**. Este guion prepara ese
 * lote; aplicarlo es cosa de `pnpm importar --retirar <fichero> --aplicar`, que lo hace dentro de una
 * transacción y con cada fila entera guardada en `ops.batch_cambio`, así que es reversible.
 *
 * ── QUÉ RETIRA, Y QUÉ NO ────────────────────────────────────────────────────────────────────────────────
 *
 * Retira **los partidos del grupo y todo lo que cuelga de ellos**: eventos, cuerpo técnico, árbitros,
 * apariciones, informes de acta y la fuente que los cita; más la clasificación reconstruida
 * (`core.standing_snapshot`), que se recalcula al reimportar.
 *
 * NO retira las inscripciones (`core.team_entry`) ni los equipos-temporada: el importador los REUTILIZA —los
 * busca por su referencia contextual y su código—, y borrarlos obligaría a inventar de nuevo la identidad de
 * cada equipo. Lo que se quita es lo que la fuente ya no dice, no quién es quién.
 *
 * SÓLO LEE: usa `DATABASE_URL_LECTOR` y escribe únicamente el fichero del lote.
 *
 * Uso:
 *   node scripts/prepara-lote-retirada-grupo.mjs --grupo 54322948 --temporada 2025-26
 *   node scripts/prepara-lote-retirada-grupo.mjs --desde-reparaciones      · todos los reparados
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Las credenciales viven en `.env` (nunca versionado). Se cargan ANTES de leer `DATABASE_URL_LECTOR`: sin
// esto el guion dice que falta la credencial teniéndola ahí al lado.
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* un .env ilegible se nota en el mensaje de abajo */ }
}
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const DIARIO_REPARACIONES = join(RAIZ, 'pruebas', 'reconstruccion', 'reparaciones-calendario.jsonl');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'canonico');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const federacion = arg('federacion') ?? 'cataluna';
const desdeReparaciones = argumentos.includes('--desde-reparaciones');

/** Las entradas del diario de reparaciones: qué grupos tienen la cola ya reparada. */
function reparados() {
  if (!existsSync(DIARIO_REPARACIONES)) return [];
  const porGrupo = new Map();
  for (const linea of readFileSync(DIARIO_REPARACIONES, 'utf8').split('\n')) {
    if (linea.trim() === '') continue;
    try {
      const r = JSON.parse(linea);
      if (r.accion === 'reparado') porGrupo.set(r.grupo, r);
    } catch { /* una línea a medias no invalida el resto */ }
  }
  return [...porGrupo.values()];
}

const objetivos = desdeReparaciones
  ? reparados().map((r) => ({ grupo: r.grupo, temporada: r.temporada }))
  : [{ grupo: arg('grupo'), temporada: arg('temporada') }];
if (objetivos.length === 0 || !objetivos[0].grupo) {
  console.error('uso: node scripts/prepara-lote-retirada-grupo.mjs --grupo <código> [--temporada 2025-26]');
  console.error('     node scripts/prepara-lote-retirada-grupo.mjs --desde-reparaciones');
  process.exit(2);
}

const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
if (url === '' ) { console.error('Falta DATABASE_URL_LECTOR en .env: este preparador sólo lee.'); process.exit(2); }
if (/facylf_(admin|publicador|migracion)/.test(url)) {
  console.error('✗ DATABASE_URL_LECTOR no apunta al rol de lectura: un preparador que puede escribir acaba escribiendo.');
  process.exit(2);
}

/*
 * Las tablas que cuelgan de un partido, y la del grupo. Se declaran aquí, explícitas y en orden de hijo a
 * padre; el orden definitivo lo pone `aplicaRetirada` con `ORDEN_DE_BORRADO`, que además se niega a borrar en
 * una tabla que no conozca.
 */
const TABLAS_DE_PARTIDO = [
  'core.match_event', 'core.match_staff', 'core.match_official', 'core.appearance',
  'core.match_report', 'core.match_source',
];

const cliente = new Client({ connectionString: url, statement_timeout: 300_000 });
await cliente.connect();
const lotes = [];

for (const objetivo of objetivos) {
  const { rows: grupos } = await cliente.query(
    `select pg.id as phase_group_id, pg.codigo_externo as grupo, s.etiqueta as temporada,
            ce.nombre_publicado as competicion, f.codigo as federacion
       from core.phase_group pg
       join core.competition_edition ce on ce.id = pg.competition_edition_id
       join core.federation f on f.id = ce.federation_id
       join core.season s on s.id = ce.season_id
      where pg.codigo_externo = $1 and f.codigo = $2
        and ($3::text is null or s.etiqueta = $3)`,
    [objetivo.grupo, federacion, objetivo.temporada ?? null],
  );
  if (grupos.length === 0) {
    console.log(`  · g${objetivo.grupo}: no está en el canónico (nada que retirar)`);
    continue;
  }
  for (const grupo of grupos) {
    const { rows: partidos } = await cliente.query(
      'select id from core.match where phase_group_id = $1', [grupo.phase_group_id]);
    const ids = partidos.map((p) => Number(p.id));
    const cierre = [];
    let total = 0;
    if (ids.length > 0) {
      for (const tabla of TABLAS_DE_PARTIDO) {
        // `match_report` no tiene `id` y su clave es `match_id`: se piden las filas ENTERAS, que es lo que
        // permite reponerlas, y `aplicaRetirada` saca de ahí la clave real de cada tabla.
        const { rows } = await cliente.query(
          `select to_jsonb(t) as fila from ${tabla} t
            where ${tabla === 'core.match_report' ? 'match_id' : 'match_id'} = any($1::bigint[])`, [ids]);
        if (rows.length > 0) { cierre.push({ tabla, filas: rows.map((r) => r.fila) }); total += rows.length; }
      }
      const { rows: filasPartido } = await cliente.query(
        'select to_jsonb(t) as fila from core.match t where t.id = any($1::bigint[])', [ids]);
      cierre.push({ tabla: 'core.match', filas: filasPartido.map((r) => r.fila) });
      total += filasPartido.length;
    }
    // La clasificación reconstruida: se recalculate al reimportar, así que la vieja se va con el grupo.
    const { rows: snapshots } = await cliente.query(
      'select to_jsonb(t) as fila from core.standing_snapshot t where t.phase_group_id = $1', [grupo.phase_group_id]);
    if (snapshots.length > 0) { cierre.push({ tabla: 'core.standing_snapshot', filas: snapshots.map((r) => r.fila) }); total += snapshots.length; }

    if (total === 0) {
      console.log(`  · g${grupo.grupo} (${grupo.temporada}): no tiene nada en el canónico; no hace falta retirar`);
      continue;
    }
    const resumen = cierre.map((c) => `${c.tabla.replace('core.', '')} ${c.filas.length}`).join(' · ');
    console.log(`  · g${grupo.grupo} (${grupo.temporada}, ${grupo.competicion}): ${total} filas → ${resumen}`);
    lotes.push({
      federacion: grupo.federacion,
      temporada: grupo.temporada,
      competicion: grupos[0].competicion,
      grupo: grupo.grupo,
      motivo: `calendario del grupo ${grupo.grupo} reparado en la cola desde las actas archivadas: `
        + 'se retira lo del canónico para reimportarlo con la verdad',
      aplicable: true,
      cierre,
    });
  }
}
await cliente.end();

if (lotes.length === 0) {
  console.log('\nNo hay ningún lote que preparar.');
  process.exit(0);
}
mkdirSync(SALIDA, { recursive: true });
const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const destino = join(SALIDA, `retirada-calendario-reparado-${marca}.json`);
writeFileSync(destino, `${JSON.stringify({ cuando: new Date().toISOString(), lotes }, null, 2)}\n`);
const filas = lotes.reduce((n, l) => n + l.cierre.reduce((m, c) => m + c.filas.length, 0), 0);
console.log(`\n  lote preparado: ${lotes.length} grupo(s) · ${filas} filas`);
console.log(`  ${destino.replace(`${RAIZ}\\`, '')}`);
console.log('\n  para aplicarlo (dentro de una transacción, con diario y reversible):');
console.log(`      pnpm importar --retirar "${destino.replace(`${RAIZ}\\`, '')}" --aplicar`);
