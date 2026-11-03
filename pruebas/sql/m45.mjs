// 0045: buscador por pares de palabras — «nombre apellido» comunes a la vez, sin perder a nadie.
import { base29, ok, fin } from './m29.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'entidades.ts'), 'utf8').replaceAll('\r\n', '\n');
const i = src.indexOf("nombre: 'busqueda-por-nombre'"); const a = src.indexOf('sql: `', i) + 6;
const crudo = src.slice(a, src.indexOf('`,\n};', a));
// La consulta tal y como la recibe PostgreSQL desde JavaScript (la plantilla quita las barras invertidas sueltas).
const sql = eval('`' + crudo.replaceAll('${SQL_FEDERACION_NO_EXCLUIDA}', 'true').replaceAll('`', '') + '`');
ok(sql === crudo.replaceAll('${SQL_FEDERACION_NO_EXCLUIDA}', 'true'), 'la consulta no cambia al pasar por una plantilla de JS (sin barras invertidas)');
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
// 6.000 «García» (más que el tope de 5.000) y 6.000 «Hugo»; sólo 3 «Hugo García López», muy poco populares,
// y 1 «Hugo Martín López» (las dos palabras separadas).
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('cyl','Castilla y León','pnfg');
 insert into core.person (nombre_mostrado)
   select 'Pedro García ' || g from generate_series(1, 6000) g
   union all select 'Hugo Sanz ' || g from generate_series(1, 6000) g
   union all select 'Hugo García López' from generate_series(1, 3)
   union all select 'Hugo Martín López';
 insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, federation_id, popularidad, contexto)
 select 'persona', id, nombre_mostrado, core.normaliza_nombre(nombre_mostrado), 1,
        case when nombre_mostrado like 'Hugo %L%pez' then 0 else 100 end, 'jugador' from core.person;`);
const busca = async (t) => (await q(sql, [t, null, null, null, 50])).map((r) => r.nombre);
ok((await q(`select count(*)::int n from analytics.search_par where par = 'hugo garcia'`))[0].n === 3, 'el disparador llena el índice de pares');
let r = await busca('hugo garcía');
ok(r.length === 3 && r.every((n) => n === 'Hugo García López'), 'dos palabras muy comunes: aparecen los 3, aunque sean los menos populares', r);
r = await busca('garcia hugo');
ok(r.length === 3, 'en cualquier orden');
r = await busca('hugo garcia lo');
ok(r.length === 3, 'con la última palabra a medias');
r = await busca('hugo lopez');
ok(r.includes('Hugo Martín López') && r.filter((n) => n === 'Hugo García López').length === 3,
   'palabras separadas en el nombre («hugo [martín] lópez»): «lópez» es poco común, se parte de ella y no se pierde nadie', r);
r = await busca('garcia');
ok(r.length === 50 && (await q(sql, ['garcia', null, null, null, 50]))[0].total === 5000, 'una palabra sola sigue igual (tope «más de 5.000»)');
await q(`delete from analytics.search_entity where entity_id = (select min(id) from core.person where nombre_mostrado = 'Hugo García López')`);
ok((await q(`select count(*)::int n from analytics.search_par where par = 'hugo garcia'`))[0].n === 2, 'al borrar, se borran sus pares');
fin();
