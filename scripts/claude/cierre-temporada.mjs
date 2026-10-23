#!/usr/bin/env node
/*
 * cierre-temporada.mjs — SÓLO LEE. ¿Se puede dar por CERRADA una temporada de una federación?
 *
 * David (06/10/2026): «una vez que cerremos una temporada es porque ya está completamente scrapeada, ingestada,
 * tenemos todos sus datos y no nos falta nada». Hasta hoy no había nada que lo dijera: una cola «sin trabajo»
 * podía estar terminada, esperando turno o aparcada, y las tres se ven igual. Esto contesta con la cola en la
 * mano, temporada a temporada, y sólo da CERRADA cuando todo lo que se puede medir está en cero:
 *
 *   1. descubrimiento  · competiciones cuyos grupos no se han listado nunca
 *   2. ligas           · grupos presentes sin índice de jornadas (la liga entera sin empezar)
 *   3. calendario      · jornadas registradas sin leer (sin archivo)
 *   4. actas           · partidos jugados con código de acta cuya acta no está guardada (falta la fila o pendiente)
 *   5. trabajo         · trabajos pendientes / bloqueados / en curso / aplazados de la temporada (cualquier tipo)
 *   6. sin código      · partidos jugados sin código de acta. NO bloquea por sí solo (la federación puede no
 *                        publicarla), pero se enseña siempre y obliga a «CERRADA CON RESERVAS» hasta revisar
 *                        una muestra en la web
 *   7. canónico        · (con --canonico) grupos cuya cola tiene más actas guardadas que el canónico
 *
 * Una temporada que aún se juega (algún partido sin resultado con fecha ≥ hoy-7 días) es «EN JUEGO»: no se cierra.
 *
 * Uso:
 *   node cierre-temporada.mjs <federación> [temporada…] [--canonico] [--detalle N] [--json]
 *   FACYLF_RAIZ=/app por defecto (en el PC: FACYLF_RAIZ=F:\EspacioCodigo\facylf).
 *   Con --canonico lee el canónico con DATABASE_URL_LECTOR (sólo lectura).
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const posicionales = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--detalle'].includes(args[i - 1])));
const [fed, ...temporadasPedidas] = posicionales;
if (!fed) { console.error('uso: cierre-temporada.mjs <federación> [temporada…] [--canonico] [--detalle N] [--json]'); process.exit(2); }
const DETALLE = Number(val('detalle', 5));
const CARPETA = fed === 'castilla-leon' ? 'descargas-federacion' : `descargas-${fed}`;
const CODIGO_CANONICO = fed === 'federacion' ? 'castilla-leon' : fed;

const hoy = new Date().toISOString().slice(0, 10);
const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
const db = new DatabaseSync(join(RAIZ, CARPETA, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 120_000 });
const temporadas = db.prepare('select codigo, etiqueta from temporadas order by etiqueta desc').all()
  .filter((t) => !temporadasPedidas.length || temporadasPedidas.includes(t.etiqueta));

const uno = (sql, ...p) => db.prepare(sql).get(...p);
const todos = (sql, ...p) => db.prepare(sql).all(...p);
// «Pasado» = con fecha anterior a hoy o con resultado; «jugado» = con resultado. Un partido pasado sin resultado
// («---») está aplazado, suspendido o no se jugó: no tiene acta que buscar, pero se enseña aparte.
const DESCANSO = `(upper(p.local) like 'DESCANS%' or upper(p.visitante) like 'DESCANS%')`;
const PASADO = `((p.fecha is not null and p.fecha < '${hoy}') or p.goles_local is not null)`;
const JUGADO = `(p.goles_local is not null and not ${DESCANSO})`;

let canonico = null;
if (flag('canonico')) {
  const { createRequire } = await import('node:module');
  const { resolve } = await import('node:path');
  try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* sin .env */ }
  const { Client } = createRequire(resolve(RAIZ, 'packages/canonico/package.json'))('pg');
  canonico = new Client({ connectionString: process.env.DATABASE_URL_LECTOR, statement_timeout: 120_000, connectionTimeoutMillis: 15_000 });
  await canonico.connect();
}

const informe = [];
for (const t of temporadas) {
  const c = String(t.codigo);
  const r = { federacion: fed, temporada: t.etiqueta, motivos: [], reservas: [], ejemplos: {} };
  const n = (x) => Number(x ?? 0);

  r.competiciones = n(uno('select count(*) n from competiciones where temporada=?', c).n);
  r.grupos = n(uno(`select count(*) n from grupos where temporada=? and estado='presente'`, c).n);
  r.gruposAusentesWeb = n(uno(`select count(*) n from grupos where temporada=? and estado<>'presente'`, c).n);
  r.partidos = n(uno('select count(*) n from partidos where temporada=?', c).n);
  if (!r.competiciones && !r.partidos) continue;

  // 1. Descubrimiento
  const sinGrupos = todos(`select c.codigo, c.nombre from competiciones c where c.temporada=? and c.grupos_comprobados_en is null
      and not exists (select 1 from grupos g where g.temporada=c.temporada and g.competicion=c.codigo)`, c);
  r.competicionesSinGrupos = sinGrupos.length;
  if (sinGrupos.length) { r.motivos.push(`${sinGrupos.length} competiciones sin grupos listados`); r.ejemplos.competicionesSinGrupos = sinGrupos.slice(0, DETALLE).map((x) => `${x.codigo} ${x.nombre}`); }

  // 2. Ligas sin empezar
  const sinIndice = todos(`select g.competicion, g.codigo, g.nombre, (select nombre from competiciones cc where cc.temporada=g.temporada and cc.codigo=g.competicion) cn
      from grupos g where g.temporada=? and g.estado='presente'
      and not exists (select 1 from jornadas j where j.temporada=g.temporada and j.competicion=g.competicion and j.grupo=g.codigo)
      and not exists (select 1 from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo)`, c);
  r.gruposSinIndice = sinIndice.length;
  if (sinIndice.length) { r.motivos.push(`${sinIndice.length} grupos sin índice de jornadas (ligas sin empezar)`); r.ejemplos.gruposSinIndice = sinIndice.slice(0, DETALLE).map((x) => `${x.competicion}/${x.codigo} «${x.cn}» · «${x.nombre}»`); }

  // 3. Calendario
  const jornadasSinLeer = uno(`select count(*) n, count(distinct j.competicion||'/'||j.grupo) g from jornadas j
      join grupos g on g.temporada=j.temporada and g.competicion=j.competicion and g.codigo=j.grupo and g.estado='presente'
      where j.temporada=? and j.archivo is null`, c);
  r.jornadasSinLeer = n(jornadasSinLeer.n);
  if (r.jornadasSinLeer) r.motivos.push(`${r.jornadasSinLeer} jornadas sin leer en ${jornadasSinLeer.g} grupos`);

  // 4. Actas
  const actas = uno(`select
      sum(case when a.codigo is null and not exists (select 1 from actas a2 where a2.temporada=p.temporada and a2.codigo=p.codigo_acta) then 1 else 0 end) sinFila,
      sum(case when a.codigo is null and exists (select 1 from actas a2 where a2.temporada=p.temporada and a2.codigo=p.codigo_acta) then 1 else 0 end) duplicados,
      sum(case when a.estado='pendiente' then 1 else 0 end) pend,
      sum(case when a.estado='hecha' then 1 else 0 end) hechas,
      sum(case when a.estado not in ('hecha','pendiente') then 1 else 0 end) otras
    from partidos p left join actas a on a.temporada=p.temporada and a.competicion=p.competicion and a.grupo=p.grupo
      and a.jornada=p.jornada and a.codigo=p.codigo_acta
    where p.temporada=? and ${PASADO} and p.codigo_acta is not null and p.codigo_acta<>''`, c);
  r.actasHechas = n(actas.hechas); r.actasPendientes = n(actas.pend); r.actasSinFila = n(actas.sinFila); r.actasNoServidas = n(actas.otras);
  if (r.actasPendientes) r.motivos.push(`${r.actasPendientes} actas pendientes de descargar`);
  if (r.actasSinFila) r.motivos.push(`${r.actasSinFila} partidos con código de acta y sin acta en la cola (sin trabajo)`);
  // Mismo código de acta guardado bajo otra jornada o grupo: es una fila de calendario repetida (Cataluña 2025-26:
  // 27.294, todas con el acta ya guardada en otra clave). No falta el dato; sobra la fila.
  r.partidosDuplicados = n(actas.duplicados);
  if (r.partidosDuplicados) r.reservas.push(`${r.partidosDuplicados} filas de calendario repetidas (su acta ya está guardada con otra jornada/grupo)`);
  if (r.actasNoServidas) r.reservas.push(`${r.actasNoServidas} actas que la fuente no sirve (sin_datos / ausente)`);

  // 5. Trabajo de la temporada
  const trab = todos(`select tipo, estado, count(*) n, sum(case when siguiente_intento > '2090' then 1 else 0 end) a2099
      from trabajos where temporada=? and estado in ('pendiente','bloqueado','en_curso') group by 1,2`, c);
  r.trabajosAbiertos = trab.reduce((s, x) => s + n(x.n), 0);
  r.trabajosAparcados2099 = trab.reduce((s, x) => s + n(x.a2099), 0);
  if (r.trabajosAbiertos) r.motivos.push(`${r.trabajosAbiertos} trabajos abiertos (${trab.map((x) => `${x.tipo}:${x.estado}×${x.n}`).join(', ')})${r.trabajosAparcados2099 ? `, ${r.trabajosAparcados2099} aparcados a 2099` : ''}`);

  // 6. Partidos jugados sin código de acta
  const sinCodigo = uno(`select count(*) n from partidos p where p.temporada=? and ${JUGADO} and (p.codigo_acta is null or p.codigo_acta='')`, c);
  r.jugados = n(uno(`select count(*) n from partidos p where p.temporada=? and ${JUGADO}`, c).n);
  r.jugadosSinCodigo = n(sinCodigo.n);
  if (r.jugadosSinCodigo) {
    // Un 3-0 / 0-3 sin acta suele ser un resultado administrativo (incomparecencia, alineación indebida): no hay
    // acta porque no hubo partido. Se separa para que el porcentaje que queda sea el que de verdad hay que mirar.
    r.sinCodigoAdministrativo = n(uno(`select count(*) n from partidos p where p.temporada=? and ${JUGADO}
        and (p.codigo_acta is null or p.codigo_acta='') and ((p.goles_local=3 and p.goles_visitante=0) or (p.goles_local=0 and p.goles_visitante=3))`, c).n);
    r.reservas.push(`${r.jugadosSinCodigo} partidos jugados sin código de acta (${(100 * r.jugadosSinCodigo / Math.max(1, r.jugados)).toFixed(1)} %), `
      + `${r.sinCodigoAdministrativo} de ellos 3-0/0-3 (probable resultado administrativo): revisar una muestra en la web`);
    r.ejemplos.jugadosSinCodigo = todos(`select p.competicion, p.grupo, p.jornada, p.fecha, p.local, p.goles_local gl, p.goles_visitante gv, p.visitante
        from partidos p where p.temporada=? and ${JUGADO} and (p.codigo_acta is null or p.codigo_acta='') order by random() limit ?`, c, DETALLE)
      .map((x) => `${x.competicion}/${x.grupo} J${x.jornada} ${x.fecha ?? ''} ${x.local} ${x.gl ?? '-'}-${x.gv ?? '-'} ${x.visitante}`);
  }

  r.pasadosSinResultado = n(uno(`select count(*) n from partidos p where p.temporada=? and p.fecha < ? and p.goles_local is null and not ${DESCANSO}`, c, hace7).n);
  if (r.pasadosSinResultado) r.reservas.push(`${r.pasadosSinResultado} partidos con fecha pasada y sin resultado (aplazados, suspendidos o no jugados)`);

  // ¿Se sigue jugando?
  const vivos = n(uno(`select count(*) n from partidos p where p.temporada=? and p.goles_local is null and p.fecha >= ? and not ${DESCANSO}`, c, hace7).n);
  r.partidosPorJugar = vivos;

  // 7. Canónico
  if (canonico) {
    const porGrupo = new Map(todos(`select grupo, count(*) n from actas where temporada=? and estado='hecha' group by 1`, c).map((x) => [String(x.grupo), n(x.n)]));
    const { rows } = await canonico.query(`select pg.codigo_externo grupo, count(distinct mr.match_id)::int actas
        from core.phase_group pg join core.competition_edition ce on ce.id=pg.competition_edition_id
        join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
        left join core.match m on m.phase_group_id=pg.id left join core.match_report mr on mr.match_id=m.id
        where f.codigo=$1 and s.etiqueta=$2 group by 1`, [CODIGO_CANONICO, t.etiqueta]);
    const enCanonico = new Map(rows.map((x) => [String(x.grupo), x.actas]));
    const atrasados = [...porGrupo].filter(([g, q]) => (enCanonico.get(g) ?? 0) < q);
    r.canonicoActas = rows.reduce((s, x) => s + x.actas, 0);
    r.gruposCanonicoAtrasado = atrasados.length;
    if (atrasados.length) {
      r.motivos.push(`${atrasados.length} grupos con menos actas en el canónico que en la cola (${r.canonicoActas} frente a ${r.actasHechas})`);
      r.ejemplos.canonicoAtrasado = atrasados.slice(0, DETALLE).map(([g, q]) => `${g}: cola ${q} · canónico ${enCanonico.get(g) ?? 0}`);
    }
  }

  r.veredicto = vivos > 0 ? 'EN JUEGO' : r.motivos.length ? 'ABIERTA' : r.reservas.length ? 'CERRADA CON RESERVAS' : 'CERRADA';
  informe.push(r);
}
db.close();
if (canonico) await canonico.end();

if (flag('json')) { console.log(JSON.stringify(informe, null, 2)); process.exit(0); }
console.log(`\n### ${fed} — cierre por temporada (${hoy})${canonico ? ' · con canónico' : ' · sin canónico (añadir --canonico)'}`);
console.log('  temporada  veredicto              grupos  sinÍndice  jornSinLeer  jugados  actasHech  actasPend  sinFila  sinCódigo  trabAbiertos');
for (const r of informe) {
  console.log(`  ${r.temporada.padEnd(9)}  ${r.veredicto.padEnd(21)} ${String(r.grupos).padStart(6)} ${String(r.gruposSinIndice).padStart(10)} ${String(r.jornadasSinLeer).padStart(12)} ${String(r.jugados).padStart(8)} ${String(r.actasHechas).padStart(10)} ${String(r.actasPendientes).padStart(10)} ${String(r.actasSinFila).padStart(8)} ${String(r.jugadosSinCodigo).padStart(10)} ${String(r.trabajosAbiertos).padStart(13)}`);
}
if (DETALLE > 0) {
  for (const r of informe.filter((x) => x.veredicto !== 'CERRADA')) {
    console.log(`\n  ${r.temporada} · ${r.veredicto}`);
    for (const m of r.motivos) console.log(`    ✗ ${m}`);
    for (const m of r.reservas) console.log(`    ~ ${m}`);
    for (const [k, v] of Object.entries(r.ejemplos)) console.log(`      ${k}: ${v.join(' | ')}`);
  }
}
