#!/usr/bin/env node
/**
 * Ciclo integral de Euskadi sobre una COPIA, de principio a fin.
 *
 * Reproduce, en un solo comando y sin tocar la cola real, la secuencia que exige el encargo:
 *
 * ```text
 *  copia consistente → simulación nueva → aplicar → verificar → importar
 *  → comprobar referencias contextuales → segunda importación (cero filas nuevas)
 *  → revertir el lote de importación → comprobar la cola → volver a aplicar
 * ```
 *
 * Todo lo que escribe, lo escribe en la copia y en el PostgreSQL local. **La cola de verdad no se abre
 * en escritura en ningún momento.**
 *
 * Uso:
 *   npx tsx scripts/ciclo-euskadi-copia.mjs --grupo <codigo> [--temporada 2025-26] [--raiz <copias>]
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Las credenciales del canónico viven en `.env` (nunca versionado), igual que en `vitest.config.ts`.
process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));
import { importaFederacion } from '../packages/canonico/src/lote.js';
import { revierteLote } from '../packages/canonico/src/reversion.js';
import { creaPool } from '../packages/canonico/src/destino/pool.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const grupo = arg('grupo');
const temporada = arg('temporada', '2025-26');
const raizCopia = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
if (!grupo) { console.error('Uso: ciclo-euskadi-copia --grupo <codigo> [--temporada 2025-26] [--raiz <copias>]'); process.exit(1); }

const FEDERACION = 'euskadi';
const rutaCopia = join(raizCopia, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(rutaCopia)) {
  console.error(`✗ No hay copia en ${rutaCopia}. Créala con:
  node scripts/copiar-cola.mjs --federacion euskadi --destino ${raizCopia}`);
  process.exit(1);
}

const paso = (n, texto) => console.log(`\n── ${n}. ${texto}`);

/** Recuento de inscripciones del grupo en el canónico, para poder decir «cero filas nuevas». */
async function inscripcionesDelGrupo(pool, federacion, codigoGrupo) {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query(
      `select count(*)::int n from core.team_entry te
         join core.phase_group pg on pg.id = te.phase_group_id
        where pg.codigo_externo = $1
          and pg.competition_edition_id in (select ce.id from core.competition_edition ce
                 join core.federation f on f.id = ce.federation_id where f.codigo = $2)`,
      [codigoGrupo, federacion],
    );
    return rows[0].n;
  } finally { cliente.release(); }
}

/** Partidos del grupo en el canónico, para comprobar que la reversión los quita y los deja igual. */
async function partidosDelGrupo(pool, federacion, codigoGrupo) {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query(
      `select count(*)::int n from core.match m
         join core.phase_group pg on pg.id = m.phase_group_id
        where pg.codigo_externo = $1
          and pg.competition_edition_id in (select ce.id from core.competition_edition ce
                 join core.federation f on f.id = ce.federation_id where f.codigo = $2)`,
      [codigoGrupo, federacion],
    );
    return rows[0].n;
  } finally { cliente.release(); }
}

/** Cuántas referencias contextuales hay registradas en toda la base. */
async function referenciasContextuales(pool) {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query(
      "select count(*)::int n from source.external_ref where entity_type = 'equipo' and external_id like 'ctx:%'",
    );
    return rows[0].n;
  } finally { cliente.release(); }
}

async function contextuales(pool, federacion, codigoGrupo) {  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query(
      `select te.nombre_en_fuente, te.codigo_externo, te.referencia_contextual, te.metodo_resolucion,
              te.procedencias, te.codigo_vinculado_en
         from core.team_entry te
         join core.phase_group pg on pg.id = te.phase_group_id
        where pg.codigo_externo = $1
          and pg.competition_edition_id in (select ce.id from core.competition_edition ce
                 join core.federation f on f.id = ce.federation_id where f.codigo = $2)
        order by te.nombre_en_fuente`,
      [codigoGrupo, federacion],
    );
    return rows;
  } finally { cliente.release(); }
}

const pool = creaPool();
let batchId = null;
try {
  paso(1, 'estado de la copia antes de importar');
  const cola = new DatabaseSync(rutaCopia, { readOnly: true });
  const resumen = cola.prepare(`select count(*) partidos,
      sum(case when equipo_local_codigo is null and equipo_visitante_codigo is null then 1 else 0 end) sin_codigo,
      sum(case when equipo_local_codigo is not null or equipo_visitante_codigo is not null then 1 else 0 end) con_codigo
    from partidos where grupo = ?`).get(grupo);
  cola.close();
  console.log(`  grupo ${grupo}: ${resumen.partidos} partidos · ${resumen.sin_codigo} sin ningún código · ${resumen.con_codigo} con alguno`);
  if (resumen.sin_codigo === 0) console.log('  (este grupo ya tiene códigos: no ejercita la referencia contextual)');

  paso(2, 'importación EN SECO (no escribe nada)');
  const seco = await importaFederacion(pool, { raiz: raizCopia, federacion: FEDERACION, temporada, grupo, seco: true });
  for (const i of seco) {
    console.log(`  lote ${i.batchId} · ${i.validacion.ok ? 'validación OK' : 'VALIDACIÓN FALLIDA'} · ${i.milisegundos} ms`);
    console.log(`  partidos origen ${i.recuentosOrigen.partidos} · participantes ${i.recuentosOrigen.participaciones} · eventos ${i.recuentosOrigen.eventos}`);
    if (i.rechazadas.length) console.log(`  rechazadas: ${i.rechazadas.length} (${i.rechazadas.slice(0, 3).map((r) => r.motivo).join('; ')})`);
  }

  paso(3, 'importación REAL y comprobación de las referencias contextuales');
  const antes = await inscripcionesDelGrupo(pool, FEDERACION, grupo);
  const partidosAntes = await partidosDelGrupo(pool, FEDERACION, grupo);
  const real = await importaFederacion(pool, { raiz: raizCopia, federacion: FEDERACION, temporada, grupo });
  const primerLote = real[0]?.batchId ?? null;
  const despues = await inscripcionesDelGrupo(pool, FEDERACION, grupo);
  console.log(`  lote ${primerLote} · inscripciones ${antes} → ${despues} · partidos ${partidosAntes} → ${await partidosDelGrupo(pool, FEDERACION, grupo)}`);

  const filas = await contextuales(pool, FEDERACION, grupo);
  const sinCodigo = filas.filter((f) => f.codigo_externo === null);
  console.log(`  ${filas.length} inscripciones · ${sinCodigo.length} sin código federativo (referencia contextual)`);
  for (const f of filas.slice(0, 8)) {
    console.log(`    «${f.nombre_en_fuente}» codigo=${f.codigo_externo ?? 'NULL'} ref=${f.referencia_contextual ?? '—'} `
      + `via=${f.metodo_resolucion} procedencias=[${(f.procedencias ?? []).join(',')}]`);
  }
  // El invariante que importa: ninguna inscripción contextual puede quedarse sin su referencia.
  const conCodigoFabricado = sinCodigo.filter((f) => f.referencia_contextual === null);
  const referencias = await referenciasContextuales(pool);
  console.log(`  referencias 'ctx:' en source.external_ref (de toda la base): ${referencias}`);
  console.log(conCodigoFabricado.length === 0
    ? '  ✓ ninguna inscripción sin código se ha quedado sin referencia contextual'
    : `  ✗ ${conCodigoFabricado.length} inscripciones sin código Y sin referencia: es un fallo`);

  paso(4, 'reversión del PRIMER lote y comprobación de igualdad con el estado inicial');
  // Se revierte ANTES de volver a importar, y no es un capricho del guion: al confirmar un lote nuevo del
  // mismo grupo el importador BORRA el diario del anterior, porque ya no puede deshacer nada con
  // exactitud (§6 de IMPORTADOR-SQLITE.md). Revertir después de una segunda importación se niega con un
  // mensaje explícito, y es lo correcto: deshacer a medias sería peor que no deshacer.
  const reversion = await revierteLote(pool, primerLote);
  const trasRevertir = await inscripcionesDelGrupo(pool, FEDERACION, grupo);
  const partidosTrasRevertir = await partidosDelGrupo(pool, FEDERACION, grupo);
  console.log(`  revertido: ${reversion.borradas} borradas · ${reversion.restauradas} restauradas · ${reversion.conservadas} conservadas`);
  console.log(`  inscripciones ${despues} → ${trasRevertir} (esperado ${antes}) · partidos ${partidosTrasRevertir} (esperado ${partidosAntes})`);

  paso(5, 'importación repetida: la segunda pasada debe insertar CERO entidades nuevas');
  await importaFederacion(pool, { raiz: raizCopia, federacion: FEDERACION, temporada, grupo });
  const trasPrimera = await inscripcionesDelGrupo(pool, FEDERACION, grupo);
  const segunda = await importaFederacion(pool, { raiz: raizCopia, federacion: FEDERACION, temporada, grupo });
  const trasSegunda = await inscripcionesDelGrupo(pool, FEDERACION, grupo);
  const insertadas = Object.values(segunda[0]?.contadores ?? {}).reduce((a, c) => a + c.insertadas, 0);
  console.log(`  inscripciones ${trasRevertir} → ${trasPrimera} → ${trasSegunda} (esperado: 0 → ${despues} → ${despues})`);
  console.log(`  filas insertadas por la ÚLTIMA pasada: ${insertadas} (esperado: 0)`);

  const ok = trasSegunda === despues && insertadas === 0 && conCodigoFabricado.length === 0
    && trasRevertir === antes && partidosTrasRevertir === partidosAntes;
  console.log(`\n${ok ? '✓ ciclo correcto' : '✗ el ciclo NO ha salido como debía'}`);
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  if (batchId !== null) {
    console.error(`  (el lote ${batchId} puede quedar abierto; reviértelo con: pnpm importar --revertir ${batchId})`);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
