#!/usr/bin/env node
/*
 * REACTIVA LAS CLASIFICACIONES DE CATALUÑA QUE SE DESCARTARON POR UN FALSO ERROR.
 *
 * Antes del 19/09/2026, cuando la pestaña «CLASSIFICACIÓ» no traía tabla, el recolector lo llamaba error de
 * maquetación: a los tres intentos el trabajo quedaba **descartado** (`cancelado`) y esos grupos ya no volvían a
 * pedir su clasificación nunca. Pero la mayoría de esos grupos simplemente **no habían jugado todavía** su primer
 * partido, así que la federación no tenía nada que publicar (de 169 trabajos que fallaron así: 141 con calendario
 * y ningún partido jugado; 25 sin el calendario leído; **3 de verdad con partidos jugados y sin tabla**).
 *
 * Este guion devuelve a la cola los descartados por ese motivo **sólo cuando la decisión nueva dice que no era un
 * error** (grupo sin partidos jugados o con el calendario sin leer). Los que sí tienen partidos jugados se quedan
 * como están: esos son los que hay que mirar de verdad.
 *
 * Sin `--aplicar` sólo informa. Idempotente: los que ya están en la cola no se tocan.
 *
 * Uso:
 *   node scripts/_reactiva-clasificaciones-cataluna.mjs
 *   node scripts/_reactiva-clasificaciones-cataluna.mjs --aplicar
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decideClasificacionSinTabla } from './lib/clasificacion-cataluna.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const aplicar = process.argv.includes('--aplicar');
const ruta = join(raiz, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.error(`no hay cola de Cataluña en ${ruta}`); process.exit(2); }

const ESPERA_HORAS = 48; // lo mismo que usa el recolector para una publicación pendiente
const db = new DatabaseSync(ruta);
try {
  db.exec('pragma busy_timeout = 60000;');
  const descartados = db.prepare(`
    select clave, temporada, competicion, grupo, intentos, ultimo_error
    from trabajos where tipo='clasificacion' and estado='cancelado'`).all();

  const aReactivar = [];
  const seQuedan = [];
  for (const t of descartados) {
    const p = db.prepare(`select count(*) conocido,
      coalesce(sum(case when goles_local is not null or goles_visitante is not null then 1 else 0 end), 0) jugado
      from partidos where temporada=? and competicion=? and grupo=?`).get(t.temporada, t.competicion, t.grupo);
    const decision = decideClasificacionSinTabla({ partidosConocidos: p?.conocido, partidosJugados: p?.jugado });
    if (decision.clase === 'formato') seQuedan.push({ ...t, motivo: decision.mensaje });
    else aReactivar.push({ ...t, clase: decision.clase, mensaje: decision.mensaje });
  }

  console.log(`clasificaciones descartadas: ${descartados.length}`);
  console.log(`  · a devolver a la cola (no eran un error): ${aReactivar.length}`);
  for (const clase of ['sin-publicar', 'calendario-sin-leer']) {
    const n = aReactivar.filter((t) => t.clase === clase).length;
    if (n) console.log(`      ${clase}: ${n}`);
  }
  console.log(`  · se quedan descartadas (el grupo SÍ ha jugado y no hay tabla: hay que mirarlas): ${seQuedan.length}`);
  for (const t of seQuedan.slice(0, 10)) {
    console.log(`      comp ${t.competicion} grupo ${t.grupo} · intentos ${t.intentos} · ${t.motivo}`);
  }

  if (!aplicar) {
    console.log('\n(sin --aplicar no se toca nada)');
  } else {
    const siguiente = new Date(Date.now() + ESPERA_HORAS * 3600_000).toISOString();
    const reactiva = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=?, ultimo_error=?,
      actualizado_en=? where clave=? and estado='cancelado'`);
    let hechas = 0;
    db.exec('begin immediate');
    try {
      for (const t of aReactivar) {
        hechas += reactiva.run(siguiente, `devuelto a la cola: ${t.mensaje}`, new Date().toISOString(), t.clave).changes;
      }
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
    console.log(`\n  ✓ devueltas a la cola: ${hechas} (se reintentarán a partir de ${siguiente})`);
  }
} finally {
  db.close();
}
