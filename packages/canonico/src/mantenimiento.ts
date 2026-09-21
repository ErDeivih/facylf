/**
 * Mantenimiento del canónico: personas huérfanas.
 *
 * Una persona huérfana es una fila de `core.person` a la que no apunta ninguna aparición, ninguna
 * designación arbitral ni ninguna ficha de cuerpo técnico. Aparecen cuando se corrige una regla de
 * identidad y se reimporta: la identidad nueva se crea y la vieja se queda sin nadie que la cite.
 * Medido: al pasar los roles del cuerpo técnico al vocabulario medido, el grupo de Cataluña dejó 13.
 *
 * Por defecto NO borra nada: informa. Para borrar hay que pedirlo con `--aplicar`, y sólo se borran
 * personas sin ninguna referencia y sin decisión de identidad registrada (una fusión o separación
 * decidida a mano es historial y no se toca).
 *
 * Uso:
 *   pnpm canonico:huerfanos             # informe
 *   pnpm canonico:huerfanos --aplicar   # borra
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicoDisponible, creaPool, type PoolCanonico } from './destino/pool.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SIN_REFERENCIAS = `
  not exists (select 1 from core.appearance a where a.person_id = p.id)
  and not exists (select 1 from core.match_official o where o.person_id = p.id)
  and not exists (select 1 from core.match_staff s where s.person_id = p.id)
  and not exists (select 1 from core.match_event e where e.person_id = p.id)
  and not exists (select 1 from analytics.player_team_season_summary t where t.person_id = p.id)
  and not exists (select 1 from analytics.player_career_summary c where c.person_id = p.id)
  and not exists (select 1 from core.identity_candidate ic where ic.person_a = p.id or ic.person_b = p.id)
  and not exists (select 1 from core.identity_decision d where d.person_a = p.id or d.person_b = p.id)`;

const LISTA = `select p.id, p.nombre_mostrado, p.identidad_nominal,
    (select count(*) from core.person_name n where n.person_id = p.id)::int nombres,
    (select count(*) from core.person_source_identity i where i.person_id = p.id)::int identidades
  from core.person p
 where ${SIN_REFERENCIAS}
 order by p.id
 limit 50`;

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const rutaEnv = join(RAIZ, '.env');
  if (existsSync(rutaEnv)) {
    try {
      process.loadEnvFile(rutaEnv);
    } catch {
      // Sin `.env` el pool dirá exactamente qué falta.
    }
  }
  const disponible = await canonicoDisponible();
  if (!disponible.disponible) throw new Error(`El canónico no está disponible: ${disponible.motivo ?? 'motivo desconocido'}`);

  const pool: PoolCanonico = creaPool();
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ id: string; nombre_mostrado: string; identidad_nominal: boolean; nombres: number; identidades: number }>(LISTA);
    const { rows: total } = await cliente.query<{ n: string }>(
      `select count(*) n from core.person p where ${SIN_REFERENCIAS}`);
    console.log(`personas sin ninguna referencia: ${total[0]?.n ?? 0}`);
    for (const fila of rows) {
      console.log(`  ${fila.id} · ${fila.nombre_mostrado} · nominal=${fila.identidad_nominal} · nombres=${fila.nombres} · identidades=${fila.identidades}`);
    }
    if (!aplicar) {
      console.log('\nInforme solamente. Para borrarlas: pnpm canonico:huerfanos --aplicar');
      return;
    }
    if (Number(total[0]?.n ?? 0) === 0) {
      console.log('Nada que borrar.');
      return;
    }
    await cliente.query('begin');
    // El orden importa: primero lo que apunta a la persona, después la persona.
    const identidades = await cliente.query(
      `delete from core.person_source_identity i using core.person p
        where i.person_id = p.id and ${SIN_REFERENCIAS}`);
    const nombres = await cliente.query(
      `delete from core.person_name n using core.person p
        where n.person_id = p.id and ${SIN_REFERENCIAS}`);
    const referencias = await cliente.query(
      `delete from source.external_ref r using core.person p
        where r.entity_type = 'persona' and r.canonical_id = p.id and ${SIN_REFERENCIAS}`);
    const personas = await cliente.query(`delete from core.person p where ${SIN_REFERENCIAS}`);
    await cliente.query('commit');
    console.log(`\nborradas: ${personas.rowCount ?? 0} personas · ${identidades.rowCount ?? 0} identidades · `
      + `${nombres.rowCount ?? 0} nombres · ${referencias.rowCount ?? 0} referencias externas`);
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
    await pool.end();
  }
}

await main();
