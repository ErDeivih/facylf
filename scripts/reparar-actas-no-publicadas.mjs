#!/usr/bin/env node
/**
 * Sanea dos falsos positivos comprobados en actas PNFG/nova:
 *  - CodActa negativo: el enlace abre una plantilla vacía y no identifica un acta pública.
 *  - "Ez du aurkezten" / "No presenta": ausencia de técnico, no nombre de persona.
 *
 * Los HTML archivados no se borran. Sin --aplicar sólo informa.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const raiz = resolve(import.meta.dirname, '..');
const aplicar = process.argv.includes('--aplicar');
const ahora = new Date().toISOString();
const siguiente = new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString();
const esAusencia = (valor) => /^(?:ez\s+du\s+aurkezten|no\s+presenta|no\s+se\s+presenta|sin\s+presentar|—|-)$/i
  .test(String(valor ?? '').trim());

for (const directorio of readdirSync(raiz).filter((d) => d.startsWith('descargas-')).sort()) {
  const ruta = join(raiz, directorio, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta);
  db.exec('pragma busy_timeout=5000');
  try {
    const versionObjetivo = directorio === 'descargas-cataluna' ? 3
      : ['descargas-madrid', 'descargas-valencia'].includes(directorio) ? 4 : 19;
    // Corrige ejecuciones antiguas de este saneador que habían escrito por error la versión 19
    // también en adaptadores con numeración propia. Los datos ya quedaron saneados; sólo se
    // normaliza el contador para que futuras versiones vuelvan a detectarlos correctamente.
    if (aplicar && versionObjetivo !== 19) {
      db.prepare('update actas set version_parser=? where version_parser>?')
        .run(versionObjetivo, versionObjetivo);
    }
    const negativas = db.prepare("select count(*) n from actas where codigo glob '-[0-9]*' and estado<>'ausente_web'").get().n;
    const filasTecnico = db.prepare(`select temporada,competicion,grupo,jornada,acta,lado,rol,nombre
      from tecnicos_acta`).all().filter((fila) => esAusencia(fila.nombre));
    const vaciasAplazadas = db.prepare(`select count(*) n from actas
      where estado='pendiente' and incidencias like '%todavía no publica datos%'`).get().n;
    const negativasSaneadas = db.prepare(`select count(*) n from actas
      where codigo glob '-[0-9]*' and estado='ausente_web'`).get().n;
    const referencias = new Map(filasTecnico.map((fila) => [
      [fila.temporada, fila.competicion, fila.grupo, fila.jornada, fila.acta].join('|'), fila,
    ]));
    if (!negativas && !filasTecnico.length) {
      if (vaciasAplazadas || negativasSaneadas) {
        console.log(`${directorio}: fichas vacías aplazadas=${vaciasAplazadas} · ` +
          `identificadores no públicos saneados=${negativasSaneadas}`);
      }
      continue;
    }
    console.log(`${directorio}: actas con código no público=${negativas} · falsos técnicos=${filasTecnico.length}`);
    if (filasTecnico.length) {
      console.log(`  ejemplos: ${filasTecnico.slice(0, 3).map((f) => `${f.nombre} (${f.rol})`).join(' · ')}`);
    }
    if (!aplicar) continue;

    db.exec('begin immediate');
    try {
      // Los identificadores negativos nunca deben ofrecer un enlace de acta al usuario.
      db.exec(`delete from participaciones where acta glob '-[0-9]*';
        delete from eventos_acta where acta glob '-[0-9]*';
        delete from tecnicos_acta where acta glob '-[0-9]*';
        update partidos set codigo_acta=null where codigo_acta glob '-[0-9]*';
        update actas set estado='ausente_web',datos=null,calidad=null,
          incidencias='["identificador negativo: la fuente no publica un acta"]',
          comprobada_en='${ahora}' where codigo glob '-[0-9]*';
        update trabajos set estado='cancelado',siguiente_intento=null,
          ultimo_error='identificador negativo: la fuente no publica un acta',actualizado_en='${ahora}'
          where tipo='acta' and acta glob '-[0-9]*';`);

      const borraTecnico = db.prepare(`delete from tecnicos_acta where temporada=? and competicion=?
        and grupo=? and jornada=? and acta=? and lado is ? and rol=? and nombre=?`);
      const leeActa = db.prepare(`select datos from actas where temporada=? and competicion=? and grupo=?
        and jornada=? and codigo=?`);
      // Cada adaptador tiene su propia numeración. Usar aquí la versión de PNFG (19) en iSquad
      // hacía que Madrid/Valencia parecieran más nuevas que su parser real y ya no se reparasen.
      const guardaDatos = db.prepare(`update actas set datos=?,version_parser=${versionObjetivo},comprobada_en=?
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`);
      const cuentaParticipaciones = db.prepare(`select count(*) n from participaciones where temporada=?
        and competicion=? and grupo=? and jornada=? and acta=?`);
      const cuentaEventos = db.prepare(`select count(*) n from eventos_acta where temporada=?
        and competicion=? and grupo=? and jornada=? and acta=?`);
      const partido = db.prepare(`select goles_local,goles_visitante from partidos where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo_acta=? limit 1`);
      const aplazaActa = db.prepare(`update actas set estado='pendiente',calidad=null,
        incidencias='["la ficha existe pero todavía no publica datos"]' where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo=?`);
      const aplazaTrabajo = db.prepare(`update trabajos set estado='pendiente',intentos=0,
        siguiente_intento=?,ultimo_error='la ficha existe pero todavía no publica datos',actualizado_en=?
        where tipo='acta' and temporada=? and competicion=? and grupo=? and jornada=? and acta=?`);

      for (const fila of filasTecnico) {
        borraTecnico.run(fila.temporada, fila.competicion, fila.grupo, fila.jornada, fila.acta,
          fila.lado, fila.rol, fila.nombre);
      }
      let aplazadas = 0;
      for (const fila of referencias.values()) {
        const parametros = [fila.temporada, fila.competicion, fila.grupo, fila.jornada, fila.acta];
        const registro = leeActa.get(...parametros);
        let datos = null;
        try { datos = JSON.parse(registro?.datos ?? 'null'); } catch { /* se conserva null */ }
        if (datos) {
          datos.tecnicos = (datos.tecnicos ?? []).filter((t) => !esAusencia(t.nombre));
          for (const [rol, nombre] of Object.entries(datos.tecnico ?? {})) {
            if (esAusencia(nombre)) delete datos.tecnico[rol];
          }
          guardaDatos.run(JSON.stringify(datos), ahora, ...parametros);
        }
        const sinPersonas = cuentaParticipaciones.get(...parametros).n === 0;
        const sinEventos = cuentaEventos.get(...parametros).n === 0;
        const p = partido.get(...parametros);
        const sinResultadoJornada = p && p.goles_local == null && p.goles_visitante == null;
        const sinArbitro = !datos?.arbitro;
        const marcadorVacio = datos && (datos.golesLocal == null || datos.golesLocal === 0) &&
          (datos.golesVisitante == null || datos.golesVisitante === 0);
        if (sinPersonas && sinEventos && sinResultadoJornada && sinArbitro && marcadorVacio) {
          aplazaActa.run(...parametros);
          aplazaTrabajo.run(siguiente, ahora, ...parametros);
          aplazadas++;
        }
      }
      db.exec('commit');
      console.log(`  saneado: negativas=${negativas} · técnicos retirados=${filasTecnico.length} · ` +
        `fichas aún vacías reabiertas=${aplazadas}`);
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
  } catch (error) {
    console.error(`  no se pudo sanear ahora: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db.close();
  }
}

if (!aplicar) console.log('\nModo consulta; añade --aplicar para sanear conservando los HTML.');
