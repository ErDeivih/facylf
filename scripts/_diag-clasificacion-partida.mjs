#!/usr/bin/env node
/**
 * Comprueba en el canónico si la clasificación reconstruida de un grupo partió algún equipo en dos.
 *
 * Es la comprobación que decide si el importador aguanta una cola con el marcador de estado pegado al
 * nombre: `calculaClasificacion` agrupa por NOMBRE, así que si el nombre contaminado llega a la tabla el
 * mismo equipo aparece dos veces y las dos filas apuntan a la misma inscripción.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));
import { creaPool } from '../packages/canonico/src/destino/pool.js';

const grupo = process.argv[2];
const pool = creaPool();
try {
  const cliente = await pool.connect();
  try {
    const { rows: fase } = await cliente.query(
      `select pg.id, pg.codigo_externo, pg.nombre,
              (select count(*)::int from core.match m where m.phase_group_id = pg.id) partidos,
              (select count(*)::int from core.matchday md where md.phase_group_id = pg.id) jornadas,
              (select count(*)::int from core.team_entry te where te.phase_group_id = pg.id) inscripciones
         from core.phase_group pg where pg.codigo_externo = $1`,
      [grupo],
    );
    if (fase.length === 0) { console.log(`El grupo ${grupo} no está en el canónico`); process.exit(0); }
    for (const f of fase) {
      console.log(`grupo ${f.codigo_externo} (id ${f.id}) · ${f.partidos} partidos · ${f.jornadas} jornadas · ${f.inscripciones} inscripciones`);
      const { rows: snap } = await cliente.query(
        `select s.matchday_id, count(*)::int filas, count(distinct s.team_entry_id)::int equipos_distintos
           from core.standing_snapshot s where s.phase_group_id = $1 group by 1 order by 1`,
        [f.id],
      );
      if (snap.length === 0) {
        console.log('  sin clasificación reconstruida (el grupo no tenía una jornada completa)');
      } else {
        for (const s of snap) {
          const ok = s.filas === s.equipos_distintos;
          console.log(`  jornada ${s.matchday_id}: ${s.filas} filas · ${s.equipos_distintos} equipos distintos ${ok ? '✓ sin equipos partidos' : '✗ HAY EQUIPOS PARTIDOS'}`);
        }
      }
      // ¿Algún nombre de equipo-temporada lleva todavía un marcador de estado?
      const { rows: nombres } = await cliente.query(
        `select ts.nombre from core.team_season ts
           join core.team_entry te on te.team_season_id = ts.id
          where te.phase_group_id = $1 and ts.nombre ~ '\\((Sailkatua|Irabazlea|Ganador|Clasificado)\\)'`,
        [f.id],
      );
      console.log(nombres.length === 0 ? '  ✓ ningún nombre de equipo lleva marcador de estado' : `  ✗ ${nombres.length} nombres contaminados: ${nombres.slice(0, 3).map((n) => n.nombre).join(' | ')}`);
    }
  } finally { cliente.release(); }
} finally { await pool.end(); }
