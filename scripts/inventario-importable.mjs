/*
 * MIDE LO QUE HAY: por federación, cuántos grupos de cada temporada tienen algo que importar.
 *
 * Esto responde a "¿cuánto es todo?". Sin esta cifra no se puede decir si el canónico está completo o si
 * le falta el 95 %, que es lo que pasó con 2025-26 de Castilla y León (5 grupos importados de 193).
 *
 * Uso: node scripts/inventario-importable.mjs [--json]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const comoJson = process.argv.includes('--json');

/** Las colas de verdad: una por federación, con la carpeta excepcional de Castilla y León. */
function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    const carpeta = entrada.name;
    const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    // Las colas de prueba no son federaciones: llevan la marca `.PRUEBA` y no cuentan.
    if (existsSync(join(RAIZ, carpeta, '.PRUEBA'))) continue;
    if (carpeta === 'descargas-federacion-sondeo' || carpeta === 'descargas-prueba-10gb') continue;
    const federacion = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
    salida.push({ federacion, carpeta, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

const informe = [];
let totalGrupos = 0;
let totalActas = 0;

for (const cola of colas()) {
  const db = new DatabaseSync(cola.ruta, { readOnly: true });
  let grupos = [];
  try {
    // Un grupo "importable" es el que tiene al menos una jornada o un partido: es exactamente el criterio
    // que usa el importador (`gruposConDatos`), así que la cifra es comparable con lo que se importa.
    grupos = db.prepare(`
      select g.temporada, t.etiqueta, count(*) as grupos,
             sum(exists (select 1 from actas a where a.temporada = g.temporada
                   and a.competicion = g.competicion and a.grupo = g.codigo and a.estado = 'hecha')) as con_actas
      from grupos g
      join temporadas t on t.codigo = g.temporada
      where exists (select 1 from jornadas j
              where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
         or exists (select 1 from partidos p
              where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo)
      group by g.temporada, t.etiqueta order by t.etiqueta`).all();
  } catch (error) {
    console.error(`  ${cola.federacion}: no se pudo leer la cola (${error.message})`);
    db.close();
    continue;
  }
  db.close();

  const suma = grupos.reduce((n, g) => n + Number(g.grupos), 0);
  const actas = grupos.reduce((n, g) => n + Number(g.con_actas), 0);
  totalGrupos += suma;
  totalActas += actas;
  informe.push({ federacion: cola.federacion, grupos: suma, gruposConActas: actas, porTemporada: grupos });
  if (!comoJson) {
    console.log(`${cola.federacion.padEnd(20)} ${String(suma).padStart(6)} grupos con datos · ${String(actas).padStart(6)} con actas`);
  }
}

if (comoJson) {
  console.log(JSON.stringify({ totalGrupos, totalActas, federaciones: informe }, null, 2));
} else {
  console.log('');
  console.log(`${informe.length} federaciones · ${totalGrupos} grupos con datos · ${totalActas} con actas`);
  writeFileSync(join(RAIZ, 'pruebas', 'reconstruccion', 'inventario-importable.json'),
    `${JSON.stringify({ cuando: new Date().toISOString(), totalGrupos, totalActas, federaciones: informe }, null, 2)}\n`);
  console.log('  detalle por temporada en pruebas/reconstruccion/inventario-importable.json');
}
