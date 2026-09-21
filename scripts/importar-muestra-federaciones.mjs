#!/usr/bin/env node
/**
 * Importa, de cada federación, el grupo con más datos DENTRO DE LA VENTANA (2023-24 en adelante).
 *
 * Para qué: el canónico tenía seis grupos de cuatro federaciones. Con esto entra una muestra real de
 * cada una de las dieciocho, que es lo que prueba de verdad el importador: cada federación publica a
 * su manera (idiomas distintos en los roles, competiciones sin códigos de jugador, federaciones sin
 * actas, grupos a medias…). Si alguna trae un valor fuera del vocabulario medido, su lote se revierte
 * entero y se informa: no se escribe nada a medias.
 *
 * Uso:
 *   node scripts/importar-muestra-federaciones.mjs [--limite 18] [--federacion galicia] [--seco]
 *
 * Sólo lee las colas; escribe únicamente en el canónico y siempre por el importador.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

const RAIZ = resolve(import.meta.dirname, '..');
const TEMPORADA_MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2023-24';
const arg = (nombre, defecto = '') => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? defecto) : defecto;
};
const limite = Number(arg('limite', '18'));
const soloFederacion = arg('federacion');
const seco = process.argv.includes('--seco');

const CARPETAS_ESPECIALES = { 'castilla-leon': 'descargas-federacion' };

function rutaCola(codigo) {
  const carpeta = CARPETAS_ESPECIALES[codigo] ?? `descargas-${codigo}`;
  return join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
}

/** El grupo con más partidos dentro de la ventana, leído en sólo lectura. */
function mejorGrupo(codigo) {
  const ruta = rutaCola(codigo);
  if (!existsSync(ruta)) return null;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const fila = db.prepare(`
      select t.etiqueta as etiqueta, g.temporada as temporada, g.competicion as competicion, g.codigo as grupo,
             count(p.orden) as partidos
        from grupos g
        join temporadas t on t.codigo = g.temporada
        join partidos p on p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo
       where t.etiqueta >= ?
       group by g.temporada, g.competicion, g.codigo
       order by count(p.orden) desc
       limit 1`).get(TEMPORADA_MINIMA);
    return fila ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

const federaciones = JSON.parse(readFileSync(join(RAIZ, 'config', 'federaciones-espana.json'), 'utf8')).fuentes
  .map((f) => f.codigo)
  .filter((codigo) => !soloFederacion || codigo === soloFederacion)
  .slice(0, limite);

console.log(`Muestra de ${federaciones.length} federaciones · ventana ${TEMPORADA_MINIMA}+${seco ? ' · MODO SECO' : ''}\n`);
const resumen = [];

for (const codigo of federaciones) {
  const grupo = mejorGrupo(codigo);
  if (!grupo) {
    console.log(`· ${codigo.padEnd(20)} sin grupos en la ventana (o sin cola)`);
    resumen.push({ codigo, estado: 'sin datos en la ventana' });
    continue;
  }
  const inicio = Date.now();
  const ejecucion = spawnSync('npx', ['tsx', 'packages/canonico/src/cli.ts',
    '--federacion', codigo, '--temporada', grupo.etiqueta, '--grupo', grupo.grupo, ...(seco ? ['--seco'] : [])], {
    cwd: RAIZ, encoding: 'utf8', shell: true,
  });
  const salida = `${ejecucion.stdout ?? ''}${ejecucion.stderr ?? ''}`;
  const segundos = Math.round((Date.now() - inicio) / 1000);
  const fallo = /Valor desconocido|ha fallado|Error:/i.test(salida) || ejecucion.status !== 0;
  const entidades = [...salida.matchAll(/^\s{4}(\S+)\s+\+\s*(\d+)/gm)].reduce((n, m) => n + Number(m[2]), 0);
  const cobertura = /cobertura: (.+)$/m.exec(salida)?.[1] ?? '';
  if (fallo) {
    const motivo = (/Valor desconocido[^\n]*/.exec(salida) ?? /Error: [^\n]*/.exec(salida) ?? ['fallo sin mensaje'])[0];
    console.log(`✗ ${codigo.padEnd(20)} ${grupo.etiqueta} ${grupo.grupo} · ${segundos} s · ${motivo.slice(0, 120)}`);
    resumen.push({ codigo, grupo: grupo.grupo, etiqueta: grupo.etiqueta, estado: 'falló', motivo });
  } else {
    console.log(`✓ ${codigo.padEnd(20)} ${grupo.etiqueta} ${grupo.grupo} · ${segundos} s · ${entidades} filas · ${cobertura.slice(0, 70)}`);
    resumen.push({ codigo, grupo: grupo.grupo, etiqueta: grupo.etiqueta, estado: 'ok', entidades, segundos });
  }
}

const bien = resumen.filter((r) => r.estado === 'ok');
console.log(`\n${bien.length}/${resumen.length} federaciones importadas · ${bien.reduce((n, r) => n + (r.entidades ?? 0), 0).toLocaleString('es-ES')} filas`);
for (const r of resumen.filter((x) => x.estado !== 'ok')) console.log(`  · ${r.codigo}: ${r.estado}${r.motivo ? ` — ${r.motivo.slice(0, 140)}` : ''}`);
