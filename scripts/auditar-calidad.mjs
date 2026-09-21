#!/usr/bin/env node
/** Auditoría local y de sólo lectura de todas las bases federativas. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const raiz = resolve(import.meta.dirname, '..');
const fuentes = [{ nombre: 'Castilla y León', carpeta: 'descargas-federacion' }];
for (const archivo of readdirSync(join(raiz, 'perfiles')).filter((x) => x.endsWith('.json'))) {
  const perfil = JSON.parse(readFileSync(join(raiz, 'perfiles', archivo), 'utf8').replace(/^\uFEFF/, ''));
  fuentes.push({ nombre: perfil.nombre, carpeta: perfil.carpeta ?? `descargas-${perfil.nombre}` });
}
fuentes.push(
  { nombre: 'Cataluña', carpeta: 'descargas-cataluna' },
  { nombre: 'Madrid', carpeta: 'descargas-madrid' },
  { nombre: 'Comunidad Valenciana', carpeta: 'descargas-valencia' },
);

for (const fuente of fuentes) {
  const ruta = join(raiz, fuente.carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) {
    console.log(`${fuente.nombre}: sin base todavía`);
    continue;
  }
  const db = new DatabaseSync(ruta, { readOnly: true });
  const uno = (sql, ...parametros) => db.prepare(sql).get(...parametros)?.n ?? 0;
  const integridad = db.prepare('pragma integrity_check').get()?.integrity_check ?? 'desconocida';
  const procesadas = uno("select count(*) n from actas where estado='hecha'");
  const correctas = uno("select count(*) n from actas where estado='hecha' and calidad='correcta'");
  const revisar = uno("select count(*) n from actas where estado='hecha' and calidad='revisar'");
  const administrativas = uno("select count(*) n from actas where estado='hecha' and calidad='administrativa'");
  const versionesParser = db.prepare(`select coalesce(version_parser, 0) version, count(*) cantidad
    from actas where estado='hecha' group by coalesce(version_parser, 0) order by version`).all();
  const jsonInvalidos = uno("select count(*) n from actas where estado='hecha' and (datos is null or json_valid(datos)=0)");
  const marcadoresDistintos = uno(`select count(*) n from actas a join partidos p on
    p.temporada=a.temporada and p.competicion=a.competicion and p.grupo=a.grupo
    and p.jornada=a.jornada and p.codigo_acta=a.codigo
    where a.estado='hecha' and p.goles_local is not null and
      (cast(json_extract(a.datos,'$.golesLocal') as integer)<>p.goles_local or
       cast(json_extract(a.datos,'$.golesVisitante') as integer)<>p.goles_visitante)`);
  const trabajosDuplicados = uno(`select count(*) n from (
    select clave from trabajos group by clave having count(*)>1)`);
  const participacionesDuplicadas = uno(`select count(*) n from (
    select temporada,competicion,grupo,jornada,acta,lado,condicion,orden
    from participaciones group by temporada,competicion,grupo,jornada,acta,lado,condicion,orden
    having count(*)>1)`);
  const eventosSinLado = uno(`select count(*) n from eventos_acta
    where tipo in ('gol','amarilla','roja','doble-amarilla','entra','sale') and lado is null`);
  const minutosImposibles = uno(`select count(*) n from eventos_acta
    where minuto is not null and (minuto < 0 or minuto > 130)`);
  const actasSinPartido = uno(`select count(*) n from actas a where a.estado='hecha' and not exists (
    select 1 from partidos p where p.temporada=a.temporada and p.competicion=a.competicion
      and p.grupo=a.grupo and p.jornada=a.jornada and p.codigo_acta=a.codigo)`);
  const partidosSinEquipos = uno(`select count(*) n from partidos where
    trim(coalesce(local,''))='' or trim(coalesce(visitante,''))=''`);
  const marcadoresParciales = uno(`select count(*) n from partidos where
    (goles_local is null and goles_visitante is not null) or
    (goles_local is not null and goles_visitante is null)`);
  const codigosActaReutilizados = uno(`select count(*) n from (
    select temporada,competicion,grupo,codigo_acta from partidos
    where codigo_acta is not null and trim(codigo_acta)<>''
    group by temporada,competicion,grupo,codigo_acta having count(*)>1)`);
  const participacionesHuerfanas = uno(`select count(*) n from participaciones pc where not exists (
    select 1 from actas a where a.temporada=pc.temporada and a.competicion=pc.competicion
      and a.grupo=pc.grupo and a.jornada=pc.jornada and a.codigo=pc.acta)`);
  console.log(`${fuente.nombre}: integridad=${integridad} · actas=${procesadas} · ` +
    `correctas=${correctas} · revisar=${revisar} · administrativas=${administrativas} · ` +
    `json inválidos=${jsonInvalidos} · marcadores distintos=${marcadoresDistintos} · ` +
    `trabajos duplicados=${trabajosDuplicados} · participaciones duplicadas=${participacionesDuplicadas} · ` +
    `eventos sin lado=${eventosSinLado} · minutos imposibles=${minutosImposibles} · ` +
    `actas sin partido=${actasSinPartido} · partidos sin equipos=${partidosSinEquipos} · ` +
    `marcadores parciales=${marcadoresParciales} · códigos de acta reutilizados=${codigosActaReutilizados} · ` +
    `participaciones huérfanas=${participacionesHuerfanas}`);
  if (versionesParser.length) {
    console.log(`  parser: ${versionesParser.map(({ version, cantidad }) => `v${version}=${cantidad}`).join(', ')}`);
  }
  if (revisar) {
    const motivos = new Map();
    for (const fila of db.prepare("select incidencias from actas where estado='hecha' and calidad='revisar'").all()) {
      let incidencias = [];
      try { incidencias = JSON.parse(fila.incidencias ?? '[]'); } catch { incidencias = ['incidencias_json_invalido']; }
      for (const incidencia of incidencias) {
        const familia = String(incidencia).split(':', 1)[0];
        motivos.set(familia, (motivos.get(familia) ?? 0) + 1);
      }
    }
    const resumen = [...motivos.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([motivo, cantidad]) => `${motivo}=${cantidad}`)
      .join(', ');
    console.log(`  motivos principales: ${resumen}`);
  }
  db.close();
}
