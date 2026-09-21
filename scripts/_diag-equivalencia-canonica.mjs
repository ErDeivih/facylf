#!/usr/bin/env node
/**
 * ¿Cambia la reconstrucción de la cola el resultado del canónico?
 *
 * Es la pregunta que decide si hace falta aplicar el lote sobre la cola real, y se responde midiendo:
 *
 * 1. se importa un grupo desde la copia **tal y como está** y se calcula la huella del canónico;
 * 2. se revierte;
 * 3. se **aplica** la reconstrucción sobre la copia;
 * 4. se vuelve a importar el mismo grupo y se calcula otra vez la huella;
 * 5. si las dos huellas coinciden, la reconstrucción no cambia NADA de lo que publica el canónico.
 *
 * La huella cubre lo que el canónico publica del grupo: inscripciones (nombre, código, referencia
 * contextual, método, procedencias), partidos, apariciones, eventos, fichas, cuerpo técnico, árbitros y
 * la clasificación reconstruida. No cubre marcas de tiempo.
 *
 * Uso: npx tsx scripts/_diag-equivalencia-canonica.mjs --grupo 22610202 --temporada 2024-25
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));
const { DatabaseSync } = requerir('node:sqlite');
const { importaFederacion } = await import('../packages/canonico/src/lote.js');
const { revierteLote } = await import('../packages/canonico/src/reversion.js');
const { creaPool } = await import('../packages/canonico/src/destino/pool.js');
const { simula, guardaManifiesto, aplica, revierte: revierteCola } = await import('./reconstruir-cola.mjs');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const grupo = arg('grupo');
const temporada = arg('temporada');
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
if (!grupo || !temporada) { console.error('Uso: _diag-equivalencia-canonica --grupo <c> --temporada <etiqueta>'); process.exit(1); }

const pool = creaPool();

/** Huella de TODO lo que el canónico publica del grupo. */
async function huellaCanonica() {
  const cliente = await pool.connect();
  const h = createHash('sha256');
  const volcar = async (etiqueta, sql) => {
    const { rows } = await cliente.query(sql, [grupo, federacion]);
    h.update(`--${etiqueta}\n`);
    for (const fila of rows) { h.update(JSON.stringify(fila)); h.update('\n'); }
    return rows.length;
  };
  try {
    const recuentos = {};
    recuentos.inscripciones = await volcar('inscripciones', `
      select te.nombre_en_fuente, te.codigo_externo, te.referencia_contextual, te.metodo_resolucion,
             te.procedencias, te.retirado, ts.nombre as equipo, c.nombre_canonico as club
        from core.team_entry te
        join core.team_season ts on ts.id = te.team_season_id
        join core.club c on c.id = ts.club_id
        join core.phase_group pg on pg.id = te.phase_group_id
       where pg.codigo_externo = $1 and pg.competition_edition_id in
             (select ce.id from core.competition_edition ce join core.federation f on f.id = ce.federation_id
               where f.codigo = $2)
       order by te.nombre_en_fuente`);
    recuentos.partidos = await volcar('partidos', `
      select m.source_order, m.goles_local, m.goles_visitante, m.official_status, m.fecha_prevista,
             m.hora_confirmada, m.played_at, hl.nombre_en_fuente as local, av.nombre_en_fuente as visitante
        from core.match m
        left join core.team_entry hl on hl.id = m.home_team_entry_id
        left join core.team_entry av on av.id = m.away_team_entry_id
        join core.phase_group pg on pg.id = m.phase_group_id
       where pg.codigo_externo = $1 and pg.competition_edition_id in
             (select ce.id from core.competition_edition ce join core.federation f on f.id = ce.federation_id
               where f.codigo = $2)
       order by m.matchday_id, m.source_order`);
    recuentos.apariciones = await volcar('apariciones', `
      select a.orden, a.condition, a.dorsal, p.nombre_mostrado
        from core.appearance a join core.person p on p.id = a.person_id
        join core.match m on m.id = a.match_id
        join core.phase_group pg on pg.id = m.phase_group_id
       where pg.codigo_externo = $1 and pg.competition_edition_id in
             (select ce.id from core.competition_edition ce join core.federation f on f.id = ce.federation_id
               where f.codigo = $2)
       order by a.match_id, a.team_entry_id, a.orden`);
    recuentos.eventos = await volcar('eventos', `
      select e.source_order, e.event_type, e.minute_base, e.minute_added, e.lado, e.subtipo, e.sujeto_tipo
        from core.match_event e join core.match m on m.id = e.match_id
        join core.phase_group pg on pg.id = m.phase_group_id
       where pg.codigo_externo = $1 and pg.competition_edition_id in
             (select ce.id from core.competition_edition ce join core.federation f on f.id = ce.federation_id
               where f.codigo = $2)
       order by e.match_id, e.source_order`);
    recuentos.clasificacion = await volcar('clasificacion', `
      select s.team_entry_id, s.puntos, s.jugados, s.ganados, s.empatados, s.perdidos,
             s.goles_favor, s.goles_contra, s.origen
        from core.standing_snapshot s join core.phase_group pg on pg.id = s.phase_group_id
       where pg.codigo_externo = $1 and pg.competition_edition_id in
             (select ce.id from core.competition_edition ce join core.federation f on f.id = ce.federation_id
               where f.codigo = $2)
       order by s.matchday_id, s.team_entry_id, s.origen`);
    return { huella: h.digest('hex').slice(0, 24), recuentos };
  } finally { cliente.release(); }
}

async function revierteLotesDelGrupo() {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query(
      `select b.id from ops.batch b join core.federation f on f.id = b.federation_id
        where f.codigo = $1 and b.estado <> 'revertido' and b.cursor_hasta like $2 order by b.id`,
      [federacion, `%grupo=${grupo}%`],
    );
    for (const fila of rows) {
      const { rows: diario } = await cliente.query('select count(*)::int n from ops.batch_cambio where batch_id = $1', [fila.id]);
      if (diario[0].n === 0) continue;
      await revierteLote(pool, Number(fila.id));
    }
  } finally { cliente.release(); }
}

try {
  await revierteLotesDelGrupo();

  console.log('── importación desde la copia TAL CUAL (sin reconstruir)');
  const a = await importaFederacion(pool, { raiz, federacion, temporada, grupo });
  const ha = await huellaCanonica();
  console.log(`  lote ${a[0]?.batchId} · huella ${ha.huella} · ${JSON.stringify(ha.recuentos)}`);
  await revierteLotesDelGrupo();

  console.log('── aplicar la reconstrucción sobre la copia');
  const manifiesto = simula(federacion, { raiz });
  guardaManifiesto(manifiesto, { raiz });
  const aplicado = await aplica(federacion, manifiesto.id, { raiz });
  console.log(`  manifiesto ${manifiesto.id} · ${aplicado.filas_nuevas} filas aplicadas`);

  console.log('── importación desde la copia RECONSTRUIDA');
  const b = await importaFederacion(pool, { raiz, federacion, temporada, grupo });
  const hb = await huellaCanonica();
  console.log(`  lote ${b[0]?.batchId} · huella ${hb.huella} · ${JSON.stringify(hb.recuentos)}`);

  console.log(`\n${ha.huella === hb.huella
    ? '✓ IDÉNTICAS: la reconstrucción no cambia NADA de lo que publica el canónico para este grupo'
    : '✗ DISTINTAS: la reconstrucción SÍ cambia el canónico, y hay que aplicarla'}`);
  if (ha.huella !== hb.huella) process.exitCode = 1;

  // La copia se deja como estaba: se revierte el lote de reconstrucción.
  await revierteLotesDelGrupo().catch(() => undefined);
  revierteCola(federacion, manifiesto.id, { raiz });
  console.log('  (copia devuelta a su estado anterior y lote de reconstrucción revertido)');
} finally {
  await pool.end();
}
