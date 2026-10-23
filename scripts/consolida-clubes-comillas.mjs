#!/usr/bin/env node
/**
 * Une los clubes que se partieron por la letra del filial (entre comillas simples o suelta).
 *
 * El caso (medido el 21/10/2026 sobre las colas): la regla 7 del importador deriva el club quitando la
 * letra de equipo entrecomillada final, pero el código sólo quitaba comillas DOBLES (`"A"`). Madrid y la
 * Comunidad Valenciana escriben `'A'`, así que cada equipo era un club:
 *   · Madrid:   3.522 nombres de equipo → 3.404 clubes con la regla vieja → 1.358 con comillas simples;
 *   · Valencia: 2.490 → 2.453 → 966.
 * La ficha de un club enseñaba un solo equipo y el «historial del club» no existía.
 *
 * `clubDesdeNombreEquipo` ya trata las dos comillas (vocabularios.ts). Esto arregla lo YA importado:
 *   1. calcula el nombre base de cada club que termina en `'X'` o `"X"` (1 a 3 caracteres);
 *   2. el superviviente es el club que YA tiene ese nombre base en la federación; si no hay, el de menor id,
 *      renombrado al nombre base;
 *   3. mueve `core.team_season` al superviviente (el nombre del equipo conserva su letra), y los escudos
 *      que no estén repetidos (el superviviente conserva su escudo vigente si lo tiene);
 *   4. copia municipio y provincia al superviviente si él no los tiene;
 *   5. borra los clubes que quedan vacíos y sus filas de búsqueda, y deja pendientes de proyectar los
 *      grupos afectados.
 * Letra SUELTA (21/10/2026, decidido con David: la letra es siempre el filial): en la FCF (Cataluña) de la A
 * a la H; en las demás de la A a la E y nunca detrás de una inicial con punto (`C. F`), igual que
 * `clubDesdeNombreEquipo`. Cataluña: 3.795 → ~1.977 clubes.
 *
 * Seguridad: por defecto SÓLO CUENTA. `--aplicar` hace todo en UNA transacción y aborta si encuentra
 * cualquier choque de claves (no debería haberlos: el nombre del equipo lleva la letra). Haz una copia
 * antes (`pg_dump -t core.club -t core.team_season -t core.club_asset`). Los lotes antiguos que crearon
 * un club absorbido siguen pudiendo revertir sus hechos; su club ya no existirá.
 *
 * Uso: node scripts/consolida-clubes-comillas.mjs [--federacion madrid] [--aplicar]
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const c = new Client({ connectionString: url, application_name: 'consolida-clubes-comillas' });
await c.connect();
await c.query('begin');

try {
  await c.query(`
    create temp table plan on commit drop as
    select cl.id as club_id, cl.federation_id,
           btrim(case
             when cl.nombre_canonico ~ $re$(["'])[^"']{1,3}\\1\\s*$$re$
               then regexp_replace(cl.nombre_canonico, $re$\\s*(["'])[^"']{1,3}\\1\\s*$$re$, '')
             when f.adaptador = 'fcf'
               then regexp_replace(cl.nombre_canonico, $re$\\s+[A-H]$$re$, '')
             else regexp_replace(cl.nombre_canonico, $re$(?<!\\s[A-Z]\\.)\\s+[A-E]$$re$, '')
           end) as base, cl.nombre_canonico
      from core.club cl
      join core.federation f on f.id = cl.federation_id
     where ($1::text is null or f.codigo = $1)`, [federacion]);
  await c.query(`delete from plan where base = '' or base = nombre_canonico`);
  await c.query(`alter table plan add column base_norm text`);
  await c.query(`update plan set base_norm = core.normaliza_nombre(base)`);

  await c.query(`
    create temp table destino on commit drop as
    select p.federation_id, p.base_norm, min(p.base) as base,
           coalesce((select e.id from core.club e
                      where e.federation_id = p.federation_id and e.nombre_norm = p.base_norm
                      order by e.id limit 1), min(p.club_id)) as superviviente
      from plan p
     group by p.federation_id, p.base_norm`);

  const { rows: [res] } = await c.query(`
    select (select count(*) from plan)::int as clubes_con_letra,
           (select count(*) from destino)::int as clubes_resultantes,
           (select count(*) from plan p join destino d using (federation_id, base_norm)
             where p.club_id <> d.superviviente)::int as clubes_que_desaparecen,
           (select count(*) from core.team_season ts join plan p on p.club_id = ts.club_id
              join destino d using (federation_id, base_norm) where ts.club_id <> d.superviviente)::int as equipos_que_se_mueven`);
  const { rows: porFed } = await c.query(`
    select f.codigo, count(*) filter (where p.club_id <> d.superviviente)::int as absorbidos, count(distinct d.superviviente)::int as quedan
      from plan p join destino d using (federation_id, base_norm) join core.federation f on f.id = p.federation_id
     group by f.codigo order by 2 desc`);
  const { rows: ejemplos } = await c.query(`
    select d.base, array_agg(cl.nombre_canonico order by cl.id) as clubes
      from destino d join plan p using (federation_id, base_norm) join core.club cl on cl.id = p.club_id
     group by d.base having count(*) > 1 order by count(*) desc limit 8`);

  console.log(`Clubes con letra de filial: ${res.clubes_con_letra}. Quedarían ${res.clubes_resultantes}; desaparecen ${res.clubes_que_desaparecen}; equipos-temporada que cambian de club: ${res.equipos_que_se_mueven}.`);
  for (const r of porFed) console.log(`  ${r.codigo.padEnd(24)} absorbidos ${r.absorbidos}, quedan ${r.quedan}`);
  console.log('Ejemplos:');
  for (const e of ejemplos) console.log(`  · ${e.base}  ←  ${e.clubes.join(' | ')}`);

  // Choques que impedirían mover un equipo-temporada (misma temporada y mismo nombre literal en el destino).
  const { rows: [choques] } = await c.query(`
    select count(*)::int as n from core.team_season ts
      join plan p on p.club_id = ts.club_id join destino d using (federation_id, base_norm)
      join core.team_season otro on otro.club_id = d.superviviente and otro.season_id = ts.season_id
                                and otro.nombre = ts.nombre and otro.id <> ts.id
     where ts.club_id <> d.superviviente`);
  if (choques.n > 0) throw new Error(`${choques.n} equipos-temporada chocarían con otro de igual nombre en el club destino. No se toca nada.`);

  if (!aplicar) {
    await c.query('rollback');
    console.log('\nSólo se ha contado. Para escribir: --aplicar (haz antes una copia de core.club y core.team_season).');
    await c.end();
    process.exit(0);
  }

  // Grupos que habrá que reproyectar (clubes y equipos aparecen en la búsqueda y en los contextos).
  await c.query(`
    create temp table grupos_afectados on commit drop as
    select distinct te.phase_group_id from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id join plan p on p.club_id = ts.club_id`);

  await c.query(`
    update core.club cl set nombre_canonico = d.base, data_version = cl.data_version + 1
      from destino d where cl.id = d.superviviente and cl.nombre_norm <> d.base_norm`);
  await c.query(`
    update core.club s set municipio = coalesce(s.municipio, x.municipio), provincia = coalesce(s.provincia, x.provincia)
      from (select d.superviviente, max(cl.municipio) as municipio, max(cl.provincia) as provincia
              from plan p join destino d using (federation_id, base_norm) join core.club cl on cl.id = p.club_id
             group by d.superviviente) x
     where s.id = x.superviviente`);
  const mov = await c.query(`
    update core.team_season ts set club_id = d.superviviente, data_version = ts.data_version + 1
      from plan p join destino d using (federation_id, base_norm)
     where ts.club_id = p.club_id and p.club_id <> d.superviviente`);
  // Escudos: fuera los repetidos; el resto pasa al superviviente como NO vigente, y si el superviviente no
  // tenía ninguno vigente, se marca vigente el más reciente.
  await c.query(`
    delete from core.club_asset a using plan p, destino d, core.club_asset s
     where a.club_id = p.club_id and p.federation_id = d.federation_id and p.base_norm = d.base_norm
       and p.club_id <> d.superviviente and s.club_id = d.superviviente and s.tipo = a.tipo and s.sha256 = a.sha256`);
  await c.query(`
    update core.club_asset a set club_id = d.superviviente, vigente = false
      from plan p join destino d using (federation_id, base_norm)
     where a.club_id = p.club_id and p.club_id <> d.superviviente`);
  await c.query(`
    update core.club_asset a set vigente = true
     where a.id in (select distinct on (x.club_id, x.tipo) x.id from core.club_asset x
                     where x.club_id in (select superviviente from destino)
                       and not exists (select 1 from core.club_asset v where v.club_id = x.club_id and v.tipo = x.tipo and v.vigente)
                     order by x.club_id, x.tipo, x.observado_en desc)`);
  const bor = await c.query(`
    delete from core.club cl using plan p, destino d
     where cl.id = p.club_id and p.federation_id = d.federation_id and p.base_norm = d.base_norm
       and p.club_id <> d.superviviente
       and not exists (select 1 from core.team_season ts where ts.club_id = cl.id)`);
  const hayLectura = (await c.query(`select to_regclass('analytics.proyeccion_grupo') is not null as hay`)).rows[0].hay;
  if (hayLectura) {
    await c.query(`delete from analytics.search_entity where entity_type = 'club' and entity_id in (select club_id from plan)`);
    await c.query(`delete from analytics.proyeccion_grupo where phase_group_id in (select phase_group_id from grupos_afectados)`);
  }
  await c.query('commit');
  console.log(`\n✓ Aplicado: ${mov.rowCount} equipos-temporada movidos, ${bor.rowCount} clubes borrados.`
    + (hayLectura ? ' Sus grupos quedan pendientes: pnpm lectura:proyectar.' : ''));
} catch (error) {
  await c.query('rollback').catch(() => {});
  console.error('✗ No se ha cambiado nada:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
await c.end();
