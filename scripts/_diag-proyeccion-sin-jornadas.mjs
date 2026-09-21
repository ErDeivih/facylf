#!/usr/bin/env node
/**
 * Proyección honesta: cuántas competiciones pasarían a publicarse si se marcan como
 * «la fuente no publica este grupo» los grupos listados sin jornadas.
 *
 * Reproduce la condición de la web (`grupoProcesado` de apps/web/src/lib/repositorio-local.ts)
 * contando los grupos candidatos como `ausente_web`, sin tocar nada.
 *
 * Uso: node scripts/_diag-proyeccion-sin-jornadas.mjs [--federacion X]
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const argumento = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const solo = argumento('federacion', null);
const SIN_CONTENIDO = /no se pudo descubrir el índice de jornadas|página vacía o sin contenido|el índice no contiene la jornada|la fuente no publica ninguna jornada|competición sin grupos verificables|no parece una página de jornada/i;

const directorios = readdirSync(RAIZ).filter((d) => d.startsWith('descargas-'))
  .filter((d) => (solo ? d.includes(solo) : true)).sort();

let totalAntes = 0;
let totalDespues = 0;
const filas = [];

for (const dir of directorios) {
  const rutaDb = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(rutaDb, { readOnly: true });
  const temporadaActual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0;

  const candidatos = db.prepare(`select t.temporada, t.competicion, t.grupo, t.intentos, t.ultimo_error,
      g.estado grupo_estado, g.jornadas
    from trabajos t join grupos g on g.temporada=t.temporada and g.competicion=t.competicion
      and g.codigo=t.grupo
    where t.tipo='indice_jornadas' and t.ultimo_error is not null
      and t.estado in ('pendiente','bloqueado','cancelado')`).all()
    .filter((f) => f.grupo_estado !== 'ausente_web' && !f.jornadas && f.intentos >= 1)
    .filter((f) => Number(f.temporada) < Number(temporadaActual))
    .filter((f) => SIN_CONTENIDO.test(String(f.ultimo_error ?? '')));
  if (!candidatos.length) { db.close(); continue; }
  const clave = (t, c, g) => `${t}|${c}|${g}`;
  const ausentes = new Set(candidatos.map((c) => clave(c.temporada, c.competicion, c.grupo)));
  const competiciones = [...new Set(candidatos.map((c) => `${c.temporada}|${c.competicion}`))];

  const condicionGrupo = (temporada, competicion) => {
    const grupos = db.prepare(`select codigo, jornadas, estado from grupos where temporada=? and competicion=?`)
      .all(temporada, competicion)
      .filter((g) => g.estado !== 'ausente_web' && !ausentes.has(clave(temporada, competicion, g.codigo)));
    if (!grupos.length) return false;
    return grupos.every((g) => {
      if (!(Number(g.jornadas ?? 0) > 0)) return false;
      const conArchivo = db.prepare(`select count(*) n from jornadas where temporada=? and competicion=?
        and grupo=? and archivo is not null`).get(temporada, competicion, g.codigo).n;
      if (conArchivo < Number(g.jornadas)) return false;
      for (const tipo of ['calendario', 'clasificacion']) {
        const hecho = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?
          and grupo=? and tipo=? and estado='hecho'`).get(temporada, competicion, g.codigo, tipo).n;
        if (!hecho) return false;
      }
      const vivos = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?
        and grupo=? and tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
        and estado not in ('hecho','cancelado')`).get(temporada, competicion, g.codigo).n;
      if (vivos) return false;
      const actas = db.prepare(`select count(*) n from actas where temporada=? and competicion=?
        and grupo=? and estado not in ('hecha','ausente_web')`).get(temporada, competicion, g.codigo).n;
      return actas === 0;
    });
  };

  let antes = 0; let despues = 0;
  for (const comp of competiciones) {
    const [temporada, competicion] = comp.split('|');
    const comprobados = db.prepare(`select grupos_comprobados_en g from competiciones where temporada=? and codigo=?`)
      .get(temporada, competicion)?.g;
    if (!comprobados) continue;
    const grupos = db.prepare(`select codigo, jornadas, estado from grupos where temporada=? and competicion=?`)
      .all(temporada, competicion);
    const reales = grupos.filter((g) => g.estado !== 'ausente_web');
    const pasabaAntes = reales.length > 0 && reales.every((g) => {
      if (!(Number(g.jornadas ?? 0) > 0)) return false;
      const conArchivo = db.prepare(`select count(*) n from jornadas where temporada=? and competicion=?
        and grupo=? and archivo is not null`).get(temporada, competicion, g.codigo).n;
      if (conArchivo < Number(g.jornadas)) return false;
      const vivos = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?
        and grupo=? and tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
        and estado not in ('hecho','cancelado')`).get(temporada, competicion, g.codigo).n;
      return vivos === 0;
    });
    if (pasabaAntes) antes++;
    if (condicionGrupo(temporada, competicion)) despues++;
  }
  totalAntes += antes;
  totalDespues += despues;
  filas.push({ fed: dir.replace('descargas-', ''), competiciones: competiciones.length, antes, despues, grupos: candidatos.length });
  db.close();
}

filas.sort((a, b) => b.despues - a.despues);
console.log('PROYECCIÓN: competiciones afectadas que pasarían a publicarse');
console.log('federación             grupos  competiciones  publicables ahora  publicables después');
for (const f of filas) {
  console.log(`${f.fed.padEnd(22)} ${String(f.grupos).padStart(6)} ${String(f.competiciones).padStart(14)} ${String(f.antes).padStart(18)} ${String(f.despues).padStart(21)}`);
}
console.log(`\nTOTAL: de ${totalAntes} competiciones publicables pasaríamos a ${totalDespues} (+${totalDespues - totalAntes}) entre las ${filas.reduce((a, f) => a + f.competiciones, 0)} afectadas.`);
