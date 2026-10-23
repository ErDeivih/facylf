/*
 * busca-grupo.mjs — localiza en una cola el grupo de una competición por su nombre
 *
 * Para generar el informe de un equipo, sus datos tienen que estar en el canónico LOCAL (el del PC), y lo que
 * alimenta ese canónico es el importador leyendo la cola SQLite de la federación. Así que hace falta saber con
 * qué códigos se llama ese grupo en la cola: temporada, competición y grupo.
 *
 * Este guion los busca por el nombre de la competición y del grupo, que es lo que uno conoce.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/busca-grupo.mjs <ruta-cola.sqlite> <texto-competicion> [texto-grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [, , ruta, textoComp, textoGrupo] = process.argv;
if (!ruta || !textoComp || !existsSync(ruta)) {
  console.error('uso: busca-grupo.mjs <ruta-cola.sqlite> <texto-competicion> [texto-grupo]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));

const filas = db.prepare(`select g.temporada, g.competicion, g.codigo as grupo, g.nombre as nombreGrupo,
    g.jornadas, g.estado,
    (select nombre from competiciones c where c.temporada = g.temporada and c.codigo = g.competicion) as nombreComp
  from grupos g
 where upper(coalesce((select nombre from competiciones c where c.temporada = g.temporada and c.codigo = g.competicion), ''))
       like upper(?)
   and (? is null or upper(g.nombre) like upper(?))
 order by g.temporada desc, g.competicion, g.codigo`).all(`%${textoComp}%`, textoGrupo ?? null, `%${textoGrupo ?? ''}%`);

console.log(`cola: ${ruta}`);
console.log(`competiciones que contienen «${textoComp}»${textoGrupo ? ` y grupos con «${textoGrupo}»` : ''}: ${filas.length}\n`);
console.log('  temporada  etiqueta   competición        grupo          jornadas  estado      nombre del grupo / competición');
for (const f of filas.slice(0, 40)) {
  console.log(`  ${String(f.temporada).padEnd(9)}  ${String(etiquetas.get(String(f.temporada)) ?? '—').padEnd(9)}`
    + `  ${String(f.competicion).padEnd(17)}  ${String(f.grupo).padEnd(13)}  ${String(f.jornadas ?? '—').padStart(8)}`
    + `  ${String(f.estado).padEnd(10)}  «${f.nombreGrupo}» · ${f.nombreComp ?? '?'}`);
}
db.close();
