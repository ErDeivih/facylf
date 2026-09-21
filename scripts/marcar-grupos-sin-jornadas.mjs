#!/usr/bin/env node
/**
 * Marca como «la fuente no publica este grupo» los grupos que la federación lista pero cuya página
 * no ofrece ninguna jornada, para que su competición pueda publicarse con los grupos que sí tienen
 * datos.
 *
 *  Por qué: la web exige, para publicar una competición, que TODOS sus grupos tengan jornadas
 *  (`grupos.jornadas > 0`). Un grupo listado sin jornadas —el relleno «GRUPO - 1», las categorías
 *  base y las fases que la federación dejó sin cargar— deja la competición entera invisible para
 *  siempre, aunque el resto de grupos estén completos. Comprobado el 13/09/2026: la página que la
 *  propia federación sirve para ese grupo trae el desplegable de jornadas vacío, y hay 702 casos en
 *  temporadas ya terminadas.
 *
 *  La web ya sabe tratarlos: los grupos con estado `ausente_web` no se exigen (es el mismo criterio
 *  que se usa con las actas y con los grupos retirados). Este script sólo pone ese estado.
 *
 *  Sin --aplicar no toca nada: informa de lo que haría.
 *
 * Uso: node scripts/marcar-grupos-sin-jornadas.mjs [--aplicar] [--federacion X] [--min-intentos N]
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const argumento = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const aplicar = process.argv.includes('--aplicar');
const solo = argumento('federacion', null);
const minimoIntentos = Number(argumento('min-intentos', 1));

// Motivos que significan «ahí no hay nada publicado», no «hemos fallado nosotros»: se excluyen a
// propósito los timeouts, las sesiones de navegador y las barreras, que sí son fallos nuestros o
// transitorios.
const SIN_CONTENIDO = /no se pudo descubrir el índice de jornadas|página vacía o sin contenido|el índice no contiene la jornada|la fuente no publica ninguna jornada|competición sin grupos verificables|no parece una página de jornada/i;

const directorios = readdirSync(RAIZ)
  .filter((d) => d.startsWith('descargas-'))
  .filter((d) => (solo ? d.includes(solo) : true))
  .sort();

let totalGrupos = 0;
let totalTrabajos = 0;
let totalCompeticiones = 0;
const resumen = [];

for (const dir of directorios) {
  const rutaDb = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(rutaDb, { readOnly: !aplicar });
  if (aplicar) db.exec('pragma busy_timeout=30000');
  const ahora = new Date().toISOString();
  const temporadaActual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0;

  const candidatos = db.prepare(`select t.temporada, t.competicion, t.grupo, t.estado trabajo_estado,
      t.intentos, t.ultimo_error, g.nombre, g.estado grupo_estado, g.jornadas
    from trabajos t left join grupos g on g.temporada=t.temporada and g.competicion=t.competicion
      and g.codigo=t.grupo
    where t.tipo='indice_jornadas' and t.ultimo_error is not null
      and t.estado in ('pendiente','bloqueado','cancelado')`).all()
    .filter((f) => f.grupo_estado && f.grupo_estado !== 'ausente_web' && !f.jornadas)
    .filter((f) => f.intentos >= minimoIntentos)
    .filter((f) => Number(f.temporada) < Number(temporadaActual))
    .filter((f) => SIN_CONTENIDO.test(String(f.ultimo_error ?? '')));

  if (!candidatos.length) { db.close(); continue; }

  const competiciones = new Set(candidatos.map((c) => `${c.temporada}/${c.competicion}`));
  const otrosTrabajos = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?
    and grupo=? and estado in ('pendiente','bloqueado') and tipo<>'indice_jornadas'`);
  let trabajos = 0;
  for (const c of candidatos) trabajos += 1 + otrosTrabajos.get(c.temporada, c.competicion, c.grupo).n;

  resumen.push({
    dir: dir.replace('descargas-', ''), grupos: candidatos.length,
    competiciones: competiciones.size, trabajos,
    ejemplo: `${candidatos[0].nombre ?? '?'} (t${candidatos[0].temporada} c${candidatos[0].competicion} g${candidatos[0].grupo}, intentos ${candidatos[0].intentos})`,
  });
  totalGrupos += candidatos.length;
  totalTrabajos += trabajos;
  totalCompeticiones += competiciones.size;

  if (!aplicar) { db.close(); continue; }

  const marcaGrupo = db.prepare(`update grupos set estado='ausente_web',comprobado_en=?
    where temporada=? and competicion=? and codigo=? and estado<>'ausente_web'`);
  const cierraTrabajo = db.prepare(`update trabajos set estado='cancelado',siguiente_intento=null,intentos=intentos+1,
    ultimo_error=?,actualizado_en=? where tipo=? and temporada=? and competicion=? and grupo=?
    and (grupo is not null) and estado in ('pendiente','bloqueado')`);
  const cierraTodos = db.prepare(`update trabajos set estado='cancelado',siguiente_intento=null,intentos=intentos+1,
    ultimo_error=?,actualizado_en=? where temporada=? and competicion=? and grupo=?
    and estado in ('pendiente','bloqueado')`);
  const motivo = 'la federación lista el grupo pero no publica jornadas para él: no hay nada que recolectar';
  const evento = db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`);
  db.exec('begin immediate');
  try {
    for (const c of candidatos) {
      marcaGrupo.run(ahora, c.temporada, c.competicion, c.grupo);
      cierraTodos.run(motivo, ahora, c.temporada, c.competicion, c.grupo);
      evento.run(ahora, 'aviso', 'grupo_sin_jornadas',
        `${c.temporada}/${c.competicion}/${c.grupo} «${c.nombre ?? '?'}»: ${motivo}`);
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    console.error(`  ${dir}: se abortó (${error instanceof Error ? error.message : String(error)})`);
  }
  db.close();
}

console.log('GRUPOS LISTADOS POR LA FEDERACIÓN SIN NINGUNA JORNADA PUBLICADA');
console.log('federación             grupos  competiciones  trabajos a cerrar  ejemplo');
for (const r of resumen) {
  console.log(`${r.dir.padEnd(22)} ${String(r.grupos).padStart(6)} ${String(r.competiciones).padStart(14)} ${String(r.trabajos).padStart(18)}  ${r.ejemplo}`);
}
console.log(`\nTOTAL ${totalGrupos} grupos en ${totalCompeticiones} competiciones · ${totalTrabajos} trabajos que dejarán de reintentarse`);
if (!aplicar) console.log('Modo consulta: añade --aplicar para marcarlos. Los grupos afectados quedan como «la fuente no publica este grupo» y sus competiciones podrán publicarse con los grupos que sí tienen datos.');
