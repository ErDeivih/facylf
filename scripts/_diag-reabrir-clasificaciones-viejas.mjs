#!/usr/bin/env node
/**
 * Reabre las clasificaciones guardadas en el formato antiguo (objeto en vez de array) para que el
 * recolector las vuelva a capturar con el intérprete bueno. Sólo toca las que de verdad están mal.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = join(import.meta.dirname, '..');
const db = new DatabaseSync(join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite'));
const base = join(RAIZ, 'descargas-cataluna');
let reabiertas = 0;
for (const carpetaTemporada of readdirSync(base).filter((d) => d.startsWith('t'))) {
  const temporada = carpetaTemporada.replace(/^t(\d+)-.*$/, '$1');
  for (const carpetaComp of readdirSync(join(base, carpetaTemporada))) {
    const competicion = carpetaComp.replace(/^comp-/, '');
    for (const carpetaGrupo of readdirSync(join(base, carpetaTemporada, carpetaComp))) {
      const grupo = carpetaGrupo.replace(/^grupo-/, '');
      const ruta = join(base, carpetaTemporada, carpetaComp, carpetaGrupo, 'clasificacion.json');
      if (!existsSync(ruta)) continue;
      let doc;
      try { doc = JSON.parse(readFileSync(ruta, 'utf8')); } catch { continue; }
      if (Array.isArray(doc)) continue;
      const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0
        where tipo='clasificacion' and temporada=? and competicion=? and grupo=?`)
        .run(temporada, competicion, grupo);
      reabiertas += Number(r.changes ?? 0);
    }
  }
}
console.log(`reabiertas ${reabiertas} clasificaciones en formato antiguo`);
db.close();
