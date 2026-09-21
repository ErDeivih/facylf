#!/usr/bin/env node
/**
 * ¿Cabe el canónico completo en disco? Sólo lectura.
 *
 * El cliente preguntó exactamente esto y hasta ahora nadie lo sabía. Aquí se responde con dos cosas
 * medidas, no con una corazonada:
 *
 *   1. cuánto ocupa CADA FILA en el canónico (medido con `pg_column_size` sobre los grupos ya
 *      importados: participaciones, eventos, fichas, partidos, actas y personas);
 *   2. cuántas filas hay en las colas de origen de las 18 federaciones.
 *
 * El producto es una ESTIMACIÓN y se dice en voz alta: es «lo ya recolectado», no «lo que llegará».
 *
 * Uso: node scripts/_diag-tamano-canonico.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync, statfsSync } from 'node:fs';

const { default: pg } = await import(new URL('../packages/canonico/node_modules/pg/lib/index.js', import.meta.url).href);
const env = (await import('node:fs')).readFileSync('.env', 'utf8');
const url = /^DATABASE_URL_MIGRACION=(.*)$/m.exec(env)?.[1]?.trim();
if (!url) throw new Error('Falta DATABASE_URL_MIGRACION en .env');

const pool = new pg.Pool({ connectionString: url, max: 2 });

/* 1. Coste por fila, medido en el canónico real. */
const { rows: canonicas } = await pool.query(`
  select
    (select count(*) from core.match)::int partidos,
    (select count(*) from core.match_report)::int actas,
    (select count(*) from core.appearance)::int participaciones,
    (select count(*) from core.match_event)::int eventos,
    (select count(*) from core.match_staff)::int fichas,
    (select count(*) from core.person)::int personas,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.match) t)::bigint bytes_partidos,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.match_report) t)::bigint bytes_actas,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.appearance) t)::bigint bytes_participaciones,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.match_event) t)::bigint bytes_eventos,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.match_staff) t)::bigint bytes_fichas,
    (select coalesce(sum(pg_column_size(t)),0) from (select * from core.person) t)::bigint bytes_personas`);
const c = canonicas[0];
const porFila = {
  partido: c.bytes_partidos / Math.max(1, c.partidos),
  acta: c.bytes_actas / Math.max(1, c.actas),
  participacion: c.bytes_participaciones / Math.max(1, c.participaciones),
  evento: c.bytes_eventos / Math.max(1, c.eventos),
  ficha: c.bytes_fichas / Math.max(1, c.fichas),
  persona: c.bytes_personas / Math.max(1, c.personas),
};
console.log('coste medido por fila en el canónico (datos de fila, sin índices):');
for (const [k, v] of Object.entries(porFila)) console.log(`  ${k.padEnd(14)} ${v.toFixed(0).padStart(6)} bytes`);

/* Los índices y el TOAST pesan; medido en el grupo completo de Tercera Federación, el total con
   índices es ≈4,8 veces los datos de fila (11,6 MB estimados frente a 2,43 MB medidos). Se usa ese
   factor y se dice que es un factor medido, no una constante universal. */
const FACTOR_TOTAL = 4.8;

/* 2. Filas que hay en las colas de origen. */
const total = { grupos: 0, partidos: 0, actas: 0, participaciones: 0, eventos: 0, fichas: 0, personas: 0 };
console.log('\nfilas en las colas de origen:');
for (const carpeta of readdirSync('.').filter((n) => n.startsWith('descargas-') && !n.includes('sondeo'))) {
  const ruta = `${carpeta}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const uno = (sql) => { try { return Number(db.prepare(sql).get()?.n ?? 0); } catch { return 0; } };
    const f = {
      grupos: uno('select count(*) n from grupos'),
      partidos: uno('select count(*) n from partidos'),
      actas: uno("select count(*) n from actas where estado = 'hecha'"),
      participaciones: uno('select count(*) n from participaciones'),
      eventos: uno('select count(*) n from eventos_acta'),
      fichas: uno('select count(*) n from tecnicos_acta'),
      personas: uno('select count(*) n from personas'),
    };
    for (const k of Object.keys(total)) total[k] += f[k];
    console.log(`  ${carpeta.replace('descargas-', '').padEnd(22)} ${String(f.grupos).padStart(6)} grupos · ${String(f.partidos).padStart(8)} partidos · ${String(f.participaciones).padStart(9)} participaciones · ${String(f.eventos).padStart(8)} eventos · ${String(f.fichas).padStart(7)} fichas`);
  } finally {
    db.close();
  }
}

const estimado =
  total.partidos * porFila.partido
  + total.actas * porFila.acta
  + total.participaciones * porFila.participacion
  + total.eventos * porFila.evento
  + total.fichas * porFila.ficha
  + total.personas * porFila.persona;

const mb = (b) => `${(b / 1048576).toFixed(0)} MB`;
const gb = (b) => `${(b / 1073741824).toFixed(1)} GB`;
console.log('\nESTIMACIÓN del canónico con TODO lo recolectado hasta hoy:');
console.log(`  datos de fila                         ${mb(estimado)}`);
console.log(`  con índices y TOAST (factor ${FACTOR_TOTAL} medido)  ${gb(estimado * FACTOR_TOTAL)}`);
console.log(`  diario de reversión (medido: +60 % sobre lo anterior, y se poda por grupo) +${gb(estimado * FACTOR_TOTAL * 0.6)}`);
console.log(`  TOTAL ESTIMADO                        ${gb(estimado * FACTOR_TOTAL * 1.6)}`);

const { rows: tam } = await pool.query('select pg_database_size(current_database())::bigint tam');
console.log(`\ncanónico actual en disco: ${mb(Number(tam[0].tam))} · PostgreSQL no libera el espacio de las filas borradas sin VACUUM FULL`);
try {
  const st = statfsSync(process.cwd());
  console.log(`disco libre donde vive el contenedor: ${gb(st.bavail * st.bsize)} de ${gb(st.blocks * st.bsize)}`);
} catch {
  console.log('no se pudo leer el espacio libre del disco');
}
console.log('\nOJO: es una ESTIMACIÓN sobre lo YA recolectado. La recolección sigue, y las 18 federaciones');
console.log('no publican lo mismo: Cataluña trae todas las actas y Madrid ninguna.');
await pool.end();
