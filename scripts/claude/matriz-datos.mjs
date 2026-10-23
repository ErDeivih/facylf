#!/usr/bin/env node
/**
 * MATRIZ DE DATOS DE UNA COLA: qué publica de verdad cada federación y con qué cobertura (sólo cifras, ni un nombre).
 * Sirve para decidir cómo se muestra cada federación (qué pestañas y gráficos tienen sentido) y para la tabla
 * core.federacion_dato (migración 0032). Abre la cola en SÓLO LECTURA.
 *
 *   node scripts/claude/matriz-datos.mjs <ruta cola-v2.sqlite o traspaso .sqlite> [--nombre fed] [--salida fichero.json]
 * En el servidor: docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/matriz-datos.mjs \
 *   /app/descargas-<fed>/recolector-local/cola-v2.sqlite --nombre <fed> --salida /app/tmp/claude/matriz/<fed>.json
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const ruta = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const nombre = opt('--nombre') ?? ruta;
// immutable=1: la cola puede estar en uso (WAL) y la carpeta no deja crear el -shm; se lee una foto fija.
let db;
try { db = new DatabaseSync(`file:${ruta.replace(/\\/g, '/')}?immutable=1`, { readOnly: true }); db.prepare('select 1 from sqlite_master').get(); }
catch { db = new DatabaseSync(ruta, { readOnly: true }); }
const t0 = Date.now();
// --temporada <código de la cola> (p. ej. 21): las colas grandes se miden por temporada para no pasar de 3 min.
// Vistas TEMPORALES con el mismo nombre que las tablas: SQLite busca primero en temp, así que todas las
// consultas de abajo ven sólo esa temporada sin tocar la base (la conexión sigue siendo de sólo lectura).
const temporada = opt('--temporada');
if (temporada) {
  for (const t of ['temporadas:codigo', 'competiciones:temporada', 'grupos:temporada', 'partidos:temporada', 'actas:temporada',
                   'participaciones:temporada', 'eventos_acta:temporada', 'tecnicos_acta:temporada']) {
    const [tabla, col] = t.split(':');
    try { db.exec(`create temp view ${tabla} as select * from main.${tabla} where ${col} = '${temporada.replace(/'/g, '')}'`); } catch { /* tabla ausente */ }
  }
}
const uno = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch (e) { return { error: e.message }; } };
const todos = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return [{ error: e.message }]; } };
const tablas = new Set(todos(`select name from sqlite_master where type='table'`).map((r) => r.name));
const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);

const r = { federacion: nombre, generado: new Date().toISOString(), tablas: [...tablas] };
r.temporadas = todos(`select t.codigo, t.etiqueta,
   (select count(*) from competiciones c where c.temporada=t.codigo) competiciones,
   (select count(*) from grupos g where g.temporada=t.codigo) grupos,
   (select count(*) from partidos p where p.temporada=t.codigo) partidos,
   (select count(*) from partidos p where p.temporada=t.codigo and p.goles_local is not null) con_resultado,
   (select count(*) from actas a where a.temporada=t.codigo) actas,
   (select count(*) from actas a where a.temporada=t.codigo and a.datos is not null) actas_con_datos
   from temporadas t order by t.codigo`);
const P = uno(`select count(*) n, sum(goles_local is not null) res, sum(arbitro is not null and trim(arbitro)<>'') arb,
   sum(arbitro like '% / %') arb_varios, sum(campo is not null and trim(campo)<>'') campo, sum(hora is not null and trim(hora)<>'') hora,
   sum(fecha is not null) fecha, sum(codigo_acta is not null) con_acta from partidos`);
r.partidos = { total: P.n, pct_resultado: pct(P.res, P.n), pct_arbitro: pct(P.arb, P.n), pct_varios_arbitros: pct(P.arb_varios, P.arb),
  pct_campo: pct(P.campo, P.n), pct_hora: pct(P.hora, P.n), pct_fecha: pct(P.fecha, P.n), pct_codigo_acta: pct(P.con_acta, P.n) };
r.actas = { estados: todos(`select estado, count(*) n from actas group by 1 order by 2 desc`),
  calidad: todos(`select coalesce(calidad,'(nula)') calidad, count(*) n from actas group by 1 order by 2 desc`),
  pct_menores: (() => { const x = uno(`select count(*) n, sum(menores=1) m from actas`); return pct(x.m, x.n); })(),
  formato_archivo: todos(`select case when archivo like '%.json%' then 'json' when archivo like '%.html%' then 'html' when archivo is null then '(sin archivo)' else 'otro' end f, count(*) n from actas group by 1`) };
if (tablas.has('participaciones')) {
  const A = uno(`select count(*) n, sum(jugador_codigo is not null and jugador_codigo<>'') cod, sum(dorsal is not null) dorsal,
     sum(portero=1) portero, count(distinct acta) actas from participaciones`);
  r.participaciones = { filas: A.n, actas_con_alineacion: A.actas, pct_con_codigo: pct(A.cod, A.n), pct_con_dorsal: pct(A.dorsal, A.n),
    pct_portero_marcado: pct(A.portero, A.n),
    condiciones: todos(`select condicion, count(*) n from participaciones group by 1 order by 2 desc`),
    columnas: todos(`pragma table_info(participaciones)`).map((c) => c.name) };
}
if (tablas.has('eventos_acta')) {
  r.eventos = todos(`select tipo, count(*) n, round(100.0*sum(minuto is not null)/count(*),1) pct_minuto,
     round(100.0*sum(jugador_codigo is not null and jugador_codigo<>'')/count(*),1) pct_codigo,
     round(100.0*sum(subtipo is not null and subtipo<>'')/count(*),1) pct_subtipo,
     round(100.0*sum(lado_beneficiado is not null)/count(*),1) pct_lado_benef
     from eventos_acta group by tipo order by n desc`);
  r.subtipos_gol = todos(`select coalesce(subtipo,'(nulo)') s, count(*) n from eventos_acta where tipo='gol' group by 1 order by 2 desc`);
  r.sujetos = todos(`select coalesce(sujeto_tipo,'(nulo)') s, count(*) n from eventos_acta group by 1 order by 2 desc`);
  const conAlin = uno(`select count(distinct acta) n from participaciones`).n;
  const conCambios = uno(`select count(distinct acta) n from eventos_acta where tipo in ('entra','sale')`).n;
  const conTarj = uno(`select count(distinct acta) n from eventos_acta where tipo in ('amarilla','roja','doble-amarilla')`).n;
  r.actas_con = { alineacion: conAlin, cambios: conCambios, tarjetas: conTarj, pct_cambios_sobre_alineadas: pct(conCambios, conAlin), pct_tarjetas_sobre_alineadas: pct(conTarj, conAlin) };
}
if (tablas.has('tecnicos_acta')) {
  r.tecnicos = todos(`select rol, count(*) n from tecnicos_acta group by 1 order by 2 desc limit 15`);
  r.pct_actas_con_tecnico = pct(uno(`select count(distinct acta) n from tecnicos_acta`).n, uno(`select count(*) n from actas where datos is not null`).n);
}
r.personas = uno(`select count(*) n from personas`).n;
r.segundos = Math.round((Date.now() - t0) / 1000);
const salida = opt('--salida');
if (salida) writeFileSync(salida, JSON.stringify(r, null, 1));
console.log(JSON.stringify({ federacion: r.federacion, partidos: r.partidos.total, segundos: r.segundos, salida }));
