/*
 * indices-pendientes.mjs — SÓLO LEE. ¿Por qué no se leen los índices de jornadas pendientes? Para una cola:
 * estado de los trabajos `indice_jornadas` pendientes (cuándo les toca, intentos, último error, prioridad) y
 * comparación con la prioridad de los trabajos que SÍ se están sirviendo (los hechos en las últimas 24 h).
 *
 * Uso: node indices-pendientes.mjs <federación> [más…]     (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const ahora = new Date().toISOString();
const hace24 = new Date(Date.now() - 86_400_000).toISOString();
for (const fed of process.argv.slice(2)) {
  const db = new DatabaseSync(join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 120_000 });
  const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
  console.log(`\n## ${fed}`);
  const r = db.prepare(`select temporada, estado, count(*) n,
      sum(case when siguiente_intento is null or siguiente_intento <= ? then 1 else 0 end) ya,
      sum(case when siguiente_intento > '2090' then 1 else 0 end) a2099,
      min(prioridad) pmin, max(prioridad) pmax, max(intentos) imax, min(creado_en) desde
    from trabajos where tipo='indice_jornadas' and estado in ('pendiente','bloqueado','en_curso')
    group by 1,2 order by 1 desc`).all(ahora);
  for (const x of r) console.log(`  índices ${et.get(String(x.temporada)) ?? x.temporada} ${x.estado}: ${x.n} (ya tocan ${x.ya}, @2099 ${x.a2099}) prioridad ${x.pmin}..${x.pmax} intentos≤${x.imax} desde ${String(x.desde).slice(0, 10)}`);
  const errs = db.prepare(`select substr(coalesce(ultimo_error,'(sin error)'),1,90) e, count(*) n from trabajos
    where tipo='indice_jornadas' and estado in ('pendiente','bloqueado') group by 1 order by 2 desc limit 5`).all();
  console.log('  errores de índices pendientes:', errs.map((x) => `${x.e}×${x.n}`).join(' | '));
  const hechos = db.prepare(`select tipo, temporada, count(*) n, min(prioridad) pmin, max(prioridad) pmax from trabajos
    where estado in ('hecho','hecha') and actualizado_en >= ? group by 1,2 order by 3 desc limit 8`).all(hace24);
  console.log('  servidos en 24 h:', hechos.map((x) => `${x.tipo}/${et.get(String(x.temporada)) ?? x.temporada}×${x.n} (p ${x.pmin}..${x.pmax})`).join(' · '));
  const pend = db.prepare(`select tipo, count(*) n, min(prioridad) pmin from trabajos where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?) group by 1 order by 3 limit 8`).all(ahora);
  console.log('  pendientes que ya tocan, por tipo (prioridad mínima):', pend.map((x) => `${x.tipo}×${x.n} (p ${x.pmin})`).join(' · '));
  const asign = db.prepare(`select valor from metadatos where clave like '%asignad%' limit 1`).get();
  if (asign) console.log('  metadatos asignación:', asign.valor);
  db.close();
}
