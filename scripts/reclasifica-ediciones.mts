/**
 * Reclasifica `categoria`, `genero`, `division` (0025), `nivel` y `provincia` de las ediciones YA importadas con las reglas actuales de
 * `packages/canonico/src/origen/vocabularios.ts` (cuatro lenguas, 21/10/2026), sin reimportar nada.
 *
 * Por defecto SÓLO CUENTA y enseña ejemplos. Con `--aplicar` escribe, en una transacción:
 *   · `core.competition_edition.categoria / genero` (y `data_version + 1`);
 *   · borra la fila de `analytics.proyeccion_grupo` de sus grupos, para que `pnpm lectura:proyectar`
 *     los recalcule (la duración reglamentaria depende de la categoría).
 * No toca las ediciones con `clasificacion_curada = true`: una decisión humana manda sobre la regla.
 * No toca `core.team_season.categoria` (un equipo puede jugar varias competiciones).
 *
 * Uso: pnpm --filter @facylf/canonico exec tsx ../../scripts/reclasifica-ediciones.mts [--aplicar] [--federacion x]
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoriaDesdeNombre, divisionDesdeNombre, generoDesdeNombre, provinciaDesdeNombre } from '../packages/canonico/src/origen/vocabularios.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(raiz, '.env')); } catch { /* entorno externo */ }
const { Client } = createRequire(join(raiz, 'packages', 'canonico', 'package.json'))('pg');

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const iFed = args.indexOf('--federacion');
const federacion = iFed >= 0 ? args[iFed + 1] ?? null : null;

const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();
if (!url || /facylf_admin/.test(url)) {
  console.error('✗ Hace falta DATABASE_URL_PUBLICADOR (y no puede ser facylf_admin).');
  process.exit(2);
}
const cliente = new Client({ connectionString: url, application_name: 'reclasifica-ediciones' });
await cliente.connect();

const { rows: [col] } = await cliente.query(
  `select exists (select 1 from information_schema.columns where table_schema = 'core'
     and table_name = 'competition_edition' and column_name = 'division') as hay`);
const conDivision: boolean = col.hay;
if (!conDivision) console.log('· Sin la migración 0025: se reclasifican categoría, género, nivel y provincia, pero no la división.');
const { rows } = await cliente.query(
  `select ce.id, f.codigo as federacion, ce.nombre_publicado, ce.categoria, ce.genero, ce.nivel, ce.provincia,
          ${conDivision ? 'ce.division' : `'desconocida'::text`} as division
     from core.competition_edition ce
     join core.federation f on f.id = ce.federation_id
    where not ce.clasificacion_curada and ($1::text is null or f.codigo = $1)`,
  [federacion],
);

type Cambio = { id: number; federacion: string; nombre: string; antes: string; despues: string; gAntes: string; gDespues: string;
  dAntes: string; dDespues: string; nivel: number | null; provincia: string | null; otros: boolean };
const cambios: Cambio[] = [];
for (const r of rows) {
  const c = categoriaDesdeNombre(r.nombre_publicado).categoria;
  const g = generoDesdeNombre(r.nombre_publicado).genero;
  const d = divisionDesdeNombre(r.nombre_publicado);
  const prov = provinciaDesdeNombre(r.nombre_publicado);
  const otros = (d.nivel ?? null) !== (r.nivel ?? null) || (prov ?? null) !== (r.provincia ?? null)
    || (conDivision && d.division !== r.division);
  if (c !== r.categoria || g !== r.genero || otros) {
    cambios.push({ id: Number(r.id), federacion: r.federacion, nombre: r.nombre_publicado,
      antes: r.categoria, despues: c, gAntes: r.genero, gDespues: g,
      dAntes: r.division, dDespues: d.division, nivel: d.nivel, provincia: prov, otros });
  }
}

const porTipo = new Map<string, number>();
for (const c of cambios) {
  if (c.antes !== c.despues) porTipo.set(`categoría ${c.antes} → ${c.despues}`, (porTipo.get(`categoría ${c.antes} → ${c.despues}`) ?? 0) + 1);
  if (conDivision && c.dAntes !== c.dDespues) porTipo.set(`división ${c.dAntes} → ${c.dDespues}`, (porTipo.get(`división ${c.dAntes} → ${c.dDespues}`) ?? 0) + 1);
  if (c.gAntes !== c.gDespues) porTipo.set(`género ${c.gAntes} → ${c.gDespues}`, (porTipo.get(`género ${c.gAntes} → ${c.gDespues}`) ?? 0) + 1);
}
console.log(`Ediciones revisadas: ${rows.length}. Con cambio: ${cambios.length}.`);
for (const [k, n] of [...porTipo].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('Ejemplos:');
for (const c of cambios.slice(0, 15)) console.log(`  · [${c.federacion}] ${c.nombre}: ${c.antes}/${c.gAntes}/${c.dAntes} → ${c.despues}/${c.gDespues}/${c.dDespues} · nivel ${c.nivel ?? '–'} · ${c.provincia ?? 'sin provincia'}`);

if (!aplicar) {
  console.log('\nSólo se ha contado. Para escribir: --aplicar');
  await cliente.end();
  process.exit(0);
}

await cliente.query('begin');
try {
  for (const c of cambios) {
    await cliente.query(
      `update core.competition_edition set categoria = $2, genero = $3, nivel = $4, provincia = $5,
              ${conDivision ? 'division = $6,' : ''} data_version = data_version + 1 where id = $1`,
      conDivision ? [c.id, c.despues, c.gDespues, c.nivel, c.provincia, c.dDespues]
                  : [c.id, c.despues, c.gDespues, c.nivel, c.provincia],
    );
  }
  const ids = cambios.map((c) => c.id);
  // Sin la migración 0023 no hay proyección que invalidar. Se mira ANTES: un error dentro de la
  // transacción la dejaría abortada.
  const { rows: [m] } = await cliente.query(`select to_regclass('analytics.proyeccion_grupo') is not null as hay`);
  let rowCount: number | null = 0;
  if (m.hay) {
    ({ rowCount } = await cliente.query(
      `delete from analytics.proyeccion_grupo
        where phase_group_id in (select id from core.phase_group where competition_edition_id = any($1::bigint[]))`,
      [ids],
    ));
  }
  await cliente.query('commit');
  console.log(`\n✓ Aplicado: ${cambios.length} ediciones. ${rowCount ?? 0} grupos vuelven a estar pendientes de proyectar.`);
} catch (error) {
  await cliente.query('rollback');
  console.error('✗ No se aplicó nada:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
await cliente.end();
