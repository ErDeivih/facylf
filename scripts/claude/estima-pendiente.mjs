#!/usr/bin/env node
/**
 * ¿CUÁNTO FALTA DE VERDAD? Por temporada de una cola PNFG: lo leído, lo que queda por leer y una ESTIMACIÓN de los
 * partidos (y actas) que esconden las jornadas aún no leídas, a partir de lo que dan las jornadas ya leídas de su
 * mismo grupo. Sólo cifras. Abre la cola en sólo lectura.
 *
 *   node scripts/claude/estima-pendiente.mjs <cola-v2.sqlite> [--temporadas 2015-16,2022-23] [--hoy 2026-10-24]
 */
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ruta = args[0];
let db;
// Primero normal (ve el WAL); si el sistema de ficheros no deja (la carpeta montada en la VM), foto inmutable.
try { db = new DatabaseSync(ruta, { readOnly: true }); db.prepare('select count(*) from actas').get(); }
catch { db = new DatabaseSync(`file:${ruta.replace(/\\/g, '/')}?immutable=1`, { readOnly: true }); }
const hoy = opt('--hoy', new Date().toISOString().slice(0, 10));
const pedidas = (opt('--temporadas') ?? '').split(',').filter(Boolean);
const temporadas = db.prepare('select codigo, etiqueta from temporadas order by etiqueta').all()
  .filter((t) => !pedidas.length || pedidas.includes(t.etiqueta));
const filas = [];
for (const t of temporadas) {
  const T = String(t.codigo);
  const uno = (sql, ...p) => db.prepare(sql).get(T, ...p);
  const comp = uno('select count(*) n from competiciones where temporada=?').n;
  const grupos = uno('select count(*) n from grupos where temporada=?').n;
  // Por grupo: jornadas leídas, partidos que dieron, jornadas sin leer pasadas/futuras.
  const porGrupo = db.prepare(`select j.competicion c, j.grupo g,
      sum(j.comprobada_en is not null) leidas,
      sum(j.comprobada_en is null and (j.fecha is null or substr(j.fecha,1,10) <= ?)) sinLeerPasadas,
      sum(j.comprobada_en is null and substr(j.fecha,1,10) > ?) sinLeerFuturas,
      (select count(*) from partidos p where p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo) partidos
    from jornadas j where j.temporada=? group by j.competicion, j.grupo`).all(hoy, hoy, T);
  let leidas = 0; let pasadas = 0; let futuras = 0; let partidos = 0; let estimados = 0; let gruposSinLeer = 0;
  const medias = [];
  for (const x of porGrupo) if (x.leidas > 0) medias.push(x.partidos / x.leidas);
  medias.sort((a, b) => a - b);
  const mediana = medias.length ? medias[Math.floor(medias.length / 2)] : 0;
  for (const x of porGrupo) {
    leidas += x.leidas; pasadas += x.sinLeerPasadas; futuras += x.sinLeerFuturas; partidos += x.partidos;
    const media = x.leidas > 0 ? x.partidos / x.leidas : mediana;
    if (!x.leidas) gruposSinLeer += 1;
    estimados += media * x.sinLeerPasadas;
  }
  const gruposSinJornadas = uno(`select count(*) n from grupos g where g.temporada=? and not exists
    (select 1 from jornadas j where j.temporada=g.temporada and j.competicion=g.competicion and j.grupo=g.codigo)`).n;
  const actas = Object.fromEntries(db.prepare('select estado, count(*) n from actas where temporada=? group by estado').all(T).map((r) => [r.estado, r.n]));
  const conCodigo = uno("select count(*) n from partidos where temporada=? and codigo_acta is not null and codigo_acta<>''").n;
  const jugados = uno('select count(*) n from partidos where temporada=? and goles_local is not null').n;
  const trab = Object.fromEntries(db.prepare(`select tipo, count(*) n from trabajos where temporada=? and estado in ('pendiente','bloqueado')
    group by tipo`).all(T).map((r) => [r.tipo, r.n]));
  const actasPorPartido = partidos ? (Object.values(actas).reduce((a, b) => a + b, 0) / partidos) : 0;
  filas.push({ temporada: t.etiqueta, comp, grupos, gruposSinJornadas, gruposSinLeer, jornadasLeidas: leidas,
    sinLeerPasadas: pasadas, sinLeerFuturas: futuras, partidos, jugados, conCodigo, actas, trabajos: trab,
    partidosEstimadosOcultos: Math.round(estimados), actasEstimadasOcultas: Math.round(estimados * actasPorPartido),
    medianaPartidosPorJornada: Math.round(mediana * 10) / 10 });
}
for (const f of filas) console.log(JSON.stringify(f));
