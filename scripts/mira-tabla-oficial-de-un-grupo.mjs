#!/usr/bin/env node
/*
 * QUÉ LE HA PASADO A LA TABLA OFICIAL DE UN GRUPO CONCRETO, contado con datos y no con impresiones.
 *
 * Por qué. Cuando un grupo está en `rechazada` hay que poder decir POR QUÉ sin volver a importarlo, y el motivo
 * queda en `ops.normalizacion_error` (que el rol de lectura no ve, así que aquí se usa el de migración, sólo
 * para leer). Además se cuentan las filas que el canónico tiene de verdad: la oficial y la reconstruida, que es
 * lo único que demuestra si la tabla entró.
 *
 * Uso: node scripts/mira-tabla-oficial-de-un-grupo.mjs <federacion> <codigo_externo_del_grupo> [avisos]
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const federacion = process.argv[2];
const grupo = process.argv[3];
const cuantos = Number(process.argv[4] ?? 6);
if (!federacion || !grupo) {
  console.error('Uso: node scripts/mira-tabla-oficial-de-un-grupo.mjs <federacion> <codigo_externo_del_grupo> [avisos]');
  process.exit(1);
}
if (existsSync(join(RAIZ, '.env'))) process.loadEnvFile(join(RAIZ, '.env'));
const url = (process.env.DATABASE_URL_MIGRACION ?? '').trim();
if (url === '') {
  console.error('Sin DATABASE_URL_MIGRACION no se pueden leer los motivos (`ops.normalizacion_error`).');
  process.exit(1);
}
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const cliente = new Client({ connectionString: url, statement_timeout: 120_000 });
await cliente.connect();
try {
  const { rows: grupos } = await cliente.query(
    `select pg.id as phase_group_id, f.codigo as federacion, s.etiqueta, ce.codigo_externo as competicion,
            pg.codigo_externo as grupo, pg.nombre,
            (select cc.tabla_oficial_estado from ops.coverage_checkpoint cc where cc.phase_group_id = pg.id) as estado,
            (select cc.tabla_oficial_archivo_en from ops.coverage_checkpoint cc where cc.phase_group_id = pg.id) as archivo_en,
            (select count(*)::int from core.standing_snapshot ss where ss.phase_group_id = pg.id and ss.origen = 'oficial') as oficiales,
            (select count(*)::int from core.standing_snapshot ss where ss.phase_group_id = pg.id and ss.origen = 'reconstruida') as reconstruidas,
            (select count(*)::int from core.team_entry te where te.phase_group_id = pg.id) as inscripciones,
            (select count(*)::int from core.match m where m.phase_group_id = pg.id) as partidos
       from core.phase_group pg
       join core.competition_edition ce on ce.id = pg.competition_edition_id
       join core.federation f on f.id = ce.federation_id
       join core.season s on s.id = ce.season_id
      where f.codigo = $1 and pg.codigo_externo = $2`,
    [federacion, grupo],
  );
  if (grupos.length === 0) {
    console.log(`No hay ningún grupo ${federacion} c… g${grupo} en el canónico.`);
    process.exit(0);
  }
  for (const g of grupos) {
    console.log(`═══ ${g.federacion} ${g.etiqueta} c${g.competicion} g${g.grupo} · phase_group_id ${g.phase_group_id}`);
    console.log(`  tabla oficial: ${g.estado ?? '(sin calcular)'} · archivo del ${g.archivo_en ?? '?'}`);
    console.log(`  filas escritas: oficiales ${g.oficiales} · reconstruidas ${g.reconstruidas}`);
    console.log(`  en el grupo: ${g.inscripciones} inscripción(es) · ${g.partidos} partido(s)`);
    const { rows: avisos } = await cliente.query(
      `select id, codigo, parametros from ops.normalizacion_error
        where parametros->>'grupo' = $1 and codigo like 'clasificacion_oficial%'
        order by id desc limit $2`,
      [g.grupo, cuantos],
    );
    if (avisos.length === 0) {
      console.log('  sin avisos de tabla oficial para este grupo.');
      continue;
    }
    console.log(`  los ${avisos.length} avisos más recientes:`);
    for (const a of avisos) {
      const p = a.parametros ?? {};
      const detalle = p.detalle ?? p.motivo ?? '';
      console.log(`    #${String(a.id).padStart(7)} ${String(a.cuando).slice(0, 19)} ${a.codigo}`);
      console.log(`        ${String(detalle).replace(/\s+/g, ' ').slice(0, 190)}`);
      const extra = ['resueltas_por_codigo_publicado', 'filas_de_descanso', 'filas', 'fuente']
        .filter((k) => p[k] !== undefined).map((k) => `${k}=${p[k]}`);
      if (extra.length > 0) console.log(`        ${extra.join(' · ')}`);
    }
  }
} finally {
  await cliente.end();
}
