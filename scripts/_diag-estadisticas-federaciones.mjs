/*
 * Estadísticas por federación: cómo va cada recolector, medido en su cola.
 *
 * Responde a «¿qué tal va cada worker?» con lo que la cola sabe: cuánto hay, cuánto está hecho, cuánto queda,
 * a qué ritmo va hoy, qué errores está teniendo y cuándo es su próximo trabajo. Y, si una federación no está
 * trabajando, dice POR QUÉ: cuántos de sus pendientes están aplazados y para cuándo.
 *
 * Sólo lee. Uso: node scripts/_diag-estadisticas-federaciones.mjs [federacion…]
 */
import { createRequire } from 'node:module';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);
const filtro = process.argv.slice(2);

const carpetas = readdirSync(raiz)
  .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => filtro.length === 0 || filtro.includes(f))
  .sort();

for (const federacion of carpetas) {
  const base = join(raiz, `descargas-${federacion}`, 'recolector-local');
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;

  console.log(`\n═══ ${federacion}`);
  console.log(`  datos: ${uno('select count(*) n from partidos')} partidos · ${uno('select count(*) n from jornadas')} jornadas · ` +
    `${uno("select count(*) n from actas where estado='hecha'")}/${uno('select count(*) n from actas')} actas hechas · ` +
    `${uno('select count(*) n from equipos')} equipos`);

  const trabajos = db.prepare('select estado, count(*) n from trabajos group by estado order by n desc').all();
  console.log(`  trabajos: ${trabajos.map((t) => `${t.estado}=${t.n}`).join(' · ') || '(ninguno)'}`);

  const hechosHoy = uno('select count(*) n from peticiones where iniciada_en >= ? and resultado=\'ok\'', hoy);
  const petHoy = uno('select count(*) n from peticiones where iniciada_en >= ?', hoy);
  const pet1h = uno("select count(*) n from peticiones where iniciada_en >= ?", new Date(ahora.getTime() - 3600_000).toISOString());
  console.log(`  ritmo de hoy: ${petHoy} peticiones (${hechosHoy} correctas) · última hora: ${pet1h}`);

  const errores = db.prepare(`select resultado, count(*) n from peticiones
    where iniciada_en >= ? and resultado <> 'ok' group by resultado order by n desc limit 5`).all(hoy);
  console.log(`  incidencias de hoy: ${errores.map((e) => `${e.resultado}=${e.n}`).join(' · ') || 'ninguna'}`);

  const ultima = db.prepare('select max(comprobada_en) m from jornadas').get().m;
  const proximo = db.prepare("select min(siguiente_intento) m from trabajos where estado='pendiente'").get().m;
  console.log(`  última jornada comprobada: ${ultima ?? '—'}`);
  console.log(`  próximo trabajo en cola: ${proximo ?? '—'}`);
  if (proximo) {
    const minutos = Math.round((new Date(proximo).getTime() - ahora.getTime()) / 60000);
    if (minutos > 5) {
      const siguientes = db.prepare(`select siguiente_intento, count(*) n from trabajos where estado='pendiente'
        group by siguiente_intento order by siguiente_intento limit 4`).all();
      console.log(`    el próximo está a ${minutos} min: ${siguientes.map((s) => `${s.siguiente_intento} (${s.n})`).join(' · ')}`);
      const sinIntentar = uno("select count(*) n from trabajos where estado='pendiente' and (siguiente_intento is null or siguiente_intento <= ?)", ahora.toISOString());
      console.log(`    pendientes que YA se podrían hacer (sin aplazar): ${sinIntentar} de ${uno("select count(*) n from trabajos where estado='pendiente'")}`);
    }
  }
  const registro = join(base, 'worker-programado.log');
  if (existsSync(registro)) {
    console.log(`  registro: hace ${Math.round((Date.now() - statSync(registro).mtime.getTime()) / 60000)} min · ${(statSync(registro).size / 1048576).toFixed(1)} MB`);
  }
  db.close();
}
