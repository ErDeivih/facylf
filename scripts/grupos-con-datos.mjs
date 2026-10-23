#!/usr/bin/env node
/*
 * LISTA LOS GRUPOS DE UNA TEMPORADA QUE TIENEN ALGO QUE IMPORTAR.
 *
 * Lee la cola de una federación y escribe una línea por grupo —`competicion|grupo|nombre`— para que la
 * consuma `scripts/importar-temporada.ps1`, que los importa de uno en uno para que un grupo roto no tumbe
 * el resto.
 *
 * La temporada se pide por ETIQUETA (`2025-26`), no por el código interno de la federación: los códigos no
 * son comparables entre federaciones y el 21 de Castilla y León es el 21 de otras por casualidad, no por
 * regla.
 *
 * Uso:
 *   node scripts/grupos-con-datos.mjs --cola <ruta.sqlite> --temporada 2025-26
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};

const rutaCola = arg('cola');
const etiqueta = arg('temporada');
if (!rutaCola || !etiqueta) {
  console.error('Uso: node scripts/grupos-con-datos.mjs --cola <ruta.sqlite> --temporada 2025-26');
  process.exit(2);
}
if (!existsSync(rutaCola)) {
  console.error(`No existe la cola: ${rutaCola}`);
  process.exit(2);
}

const db = new DatabaseSync(rutaCola, { readOnly: true });
const temporada = db.prepare('select codigo from temporadas where etiqueta = ?').get(etiqueta);
if (!temporada) {
  console.error(`La cola no tiene la temporada ${etiqueta}`);
  process.exit(1);
}

const grupos = db.prepare(`
  select g.competicion, g.codigo, g.nombre from grupos g where g.temporada = ?
    and (exists (select 1 from jornadas j
          where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
      or exists (select 1 from partidos p
          where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo))
  order by g.competicion, cast(g.codigo as integer)`).all(temporada.codigo);

for (const g of grupos) console.log(`${g.competicion}|${g.codigo}|${g.nombre ?? ''}`);
db.close();
