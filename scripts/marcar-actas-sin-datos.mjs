#!/usr/bin/env node
/**
 * Cierra como «ficha publicada sin datos» las actas que la federación sirve con las tablas de
 * alineaciones y cuerpo técnico VACÍAS, para que sus grupos puedan publicarse.
 *
 *  Por qué: son fichas que existen y se descargan enteras, pero sin datos que analizar (comprobado el
 *  14/09/2026 en el HTML archivado de la Copa del Rey de Euskadi: encabezados «Titularrak» y
 *  «Langile Teknikikoak» con las tablas en blanco y el entrenador como «Ez du aurkezten»). El
 *  recolector no las marca 'hecha' —publicaría el grupo sin plantillas— y las reintentaba cada mes
 *  para siempre; mientras, la web exige que NINGUNA acta esté fuera de 'hecha'/'ausente_web', así que
 *  una sola ficha vacía dejaba su eliminatoria sin publicar de por vida: 34 grupos, 27 de ellos copas
 *  de Euskadi.
 *
 *  Qué hace: pasa el acta a `sin_datos` (un estado nuevo, con su motivo escrito), cancela su trabajo y
 *  NO toca el HTML ni `version_parser` (se queda en 0): si algún día un parser mejor sabe leerla, los
 *  reparadores la recuperan solos y vuelve a 'hecha'. No se marca 'ausente_web' a propósito: la fuente
 *  SÍ publica la ficha; lo que no publica son sus datos.
 *
 *  Sin --aplicar sólo informa.
 *
 * Uso: node scripts/marcar-actas-sin-datos.mjs [--aplicar] [--federacion X]
 */
import { readdirSync, existsSync, globSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo, inspeccionaActa } from './lib/recolector-local.mjs';

const RAIZ = resolve(import.meta.dirname, '..');
const aplicar = process.argv.includes('--aplicar');
const i = process.argv.indexOf('--federacion');
const solo = i >= 0 ? process.argv[i + 1] : null;
const MOTIVO = 'la federación publica la ficha pero sin datos: alineaciones y cuerpo técnico vacíos';

const directorios = readdirSync(RAIZ).filter((d) => d.startsWith('descargas-'))
  .filter((d) => (solo ? d.includes(solo) : true)).sort();

let total = 0;
let totalGrupos = 0;
const resumen = [];

for (const dir of directorios) {
  const rutaDb = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(rutaDb, { readOnly: !aplicar });
  if (aplicar) db.exec('pragma busy_timeout=30000');
  const temporadaActual = Number(db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0);

  // El bloqueo real es el TRABAJO vivo (mientras una acta tenga trabajo sin cerrar, su grupo no se
  // publica), así que la lista sale de los trabajos y no de la incidencia de la fila: los reparadores
  // reescriben `incidencias` al reanalizar, y hay fichas marcadas «ilegible» por el trabajo cuya fila
  // ya dice otra cosa. Sólo temporadas YA CERRADAS: en la temporada en curso la ficha puede llenarse
  // cuando se juegue el partido y hay que seguir esperando.
  const candidatasBrutas = db.prepare(`select t.temporada, t.competicion, t.grupo, t.jornada, t.acta codigo,
      a.estado acta_estado, a.archivo, a.incidencias, a.version_parser
    from trabajos t left join actas a on a.temporada=t.temporada and a.competicion=t.competicion
      and a.grupo=t.grupo and a.jornada=t.jornada and a.codigo=t.acta
    where t.tipo='acta' and t.estado in ('pendiente','bloqueado')
      and t.ultimo_error like '%no se puede interpretar%'
      and cast(t.temporada as integer) < ?`).all(temporadaActual);
  // Antes de dar una ficha por «sin datos» hay que MIRARLA. El motivo «maquetación distinta» mezcla dos
  // cosas muy distintas: fichas publicadas de verdad sin alineaciones (tablas vacías) y fichas que SÍ
  // traen los jugadores pero con una maquetación que el parser no lee. Marcar eso como «sin datos»
  // sería tapar un fallo nuestro, así que se aparta y se informa para poder arreglar el parser.
  const candidatas = [];
  const conDatosSinLeer = [];
  const sinHtml = [];
  for (const c of candidatasBrutas) {
    // Si la fila no enlaza el HTML (fichas antiguas, anteriores a que se guardara el enlace), se busca
    // el fichero por su nombre: el código de acta es único dentro de la federación.
    let ruta = c.archivo;
    if (!ruta) {
      const encontrados = globSync(`**/acta-${c.codigo}.html*`, { cwd: join(RAIZ, dir, 'recolector-local') });
      if (encontrados.length) ruta = join(RAIZ, dir, 'recolector-local', encontrados[0]);
    }
    const html = ruta ? (leeArchivo(ruta)?.toString('utf8') ?? '') : '';
    if (!html) { sinHtml.push(c); continue; }
    const inspeccion = inspeccionaActa(html);
    if (Number(inspeccion.jugadores ?? 0) > 0 || Number(inspeccion.goles ?? 0) > 0) {
      conDatosSinLeer.push({ ...c, jugadores: inspeccion.jugadores, conNombre: inspeccion.conNombre, goles: inspeccion.goles });
      continue;
    }
    candidatas.push({ ...c, archivo: ruta });
  }
  if (conDatosSinLeer.length) {
    console.log(`  ⚠️ ${dir.replace('descargas-', '')}: ${conDatosSinLeer.length} fichas SÍ traen datos y el parser no las lee (NO se marcan):`);
    for (const c of conDatosSinLeer.slice(0, 4)) {
      console.log(`       acta ${c.codigo} (t${c.temporada} c${c.competicion}) · jugadores en el HTML: ${c.jugadores} con nombre: ${c.conNombre} goles: ${c.goles}`);
    }
  }
  if (sinHtml.length) {
    console.log(`  ❓ ${dir.replace('descargas-', '')}: ${sinHtml.length} fichas sin HTML localizable (NO se marcan, hay que mirarlas):`);
    for (const c of sinHtml.slice(0, 4)) console.log(`       acta ${c.codigo} (t${c.temporada} c${c.competicion} g${c.grupo})`);
  }
  if (!candidatas.length) { db.close(); continue; }

  const grupos = new Set(candidatas.map((c) => `${c.temporada}/${c.competicion}/${c.grupo}`));
  let competicionesCopas = 0;
  for (const c of new Set(candidatas.map((x) => x.competicion))) {
    const nombre = db.prepare('select nombre from competiciones where codigo=? limit 1').get(c)?.nombre ?? '';
    if (/copa|trofeo|eliminatoria|fase/i.test(nombre)) competicionesCopas += 1;
  }
  resumen.push({ fed: dir.replace('descargas-', ''), actas: candidatas.length, grupos: grupos.size,
    competiciones: new Set(candidatas.map((c) => c.competicion)).size, copas: competicionesCopas });
  total += candidatas.length;
  totalGrupos += grupos.size;

  if (!aplicar) { db.close(); continue; }

  const ahora = new Date().toISOString();
  const marca = db.prepare(`update actas set estado='sin_datos',incidencias=?,comprobada_en=?
    where codigo=? and temporada=? and competicion=? and grupo=? and jornada=? and estado='pendiente'`);
  const cierra = db.prepare(`update trabajos set estado='cancelado',siguiente_intento=null,
    ultimo_error=?,actualizado_en=? where tipo='acta' and acta=? and estado in ('pendiente','bloqueado')`);
  const evento = db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`);
  db.exec('begin immediate');
  try {
    for (const c of candidatas) {
      marca.run(JSON.stringify([MOTIVO]), ahora, c.codigo, c.temporada, c.competicion, c.grupo, c.jornada);
      cierra.run(MOTIVO, ahora, c.codigo);
      evento.run(ahora, 'aviso', 'acta_sin_datos',
        `${c.temporada}/${c.competicion}/${c.grupo}/J${c.jornada}/${c.codigo}: ${MOTIVO}`);
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    console.error(`  ${dir}: se abortó (${error instanceof Error ? error.message : String(error)})`);
  }
  db.close();
}

console.log('ACTAS CON LA FICHA PUBLICADA PERO SIN DATOS');
console.log('federación             actas  grupos  competiciones  de ellas de copa/trofeo');
for (const r of resumen) {
  console.log(`${r.fed.padEnd(22)} ${String(r.actas).padStart(5)} ${String(r.grupos).padStart(7)} ${String(r.competiciones).padStart(14)} ${String(r.copas).padStart(23)}`);
}
console.log(`\nTOTAL ${total} fichas sin datos · ${totalGrupos} grupos que podrán publicarse`);
if (!aplicar) console.log('Modo consulta: añade --aplicar. Las actas pasan a «sin_datos» (no bloquean), conservan su HTML archivado y siguen en disposición de recuperarse si un parser mejor las lee. Sólo se tocan temporadas ya cerradas.');
