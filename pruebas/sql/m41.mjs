// 0041: buscador por palabras — mismos resultados útiles, en cualquier orden, sin recorrer todos los nombres.
import { base29, ok, fin } from './m29.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'entidades.ts'), 'utf8');
const i = src.indexOf("nombre: 'busqueda-por-nombre'"); const a = src.indexOf('sql: `', i) + 6;
const sql = src.slice(a, src.indexOf('`,\n};', a)).replaceAll('${SQL_FEDERACION_NO_EXCLUIDA}', 'true');
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('cyl','Castilla y León','pnfg'),('madrid','Madrid','pnfg');
 insert into core.club (federation_id,nombre_canonico) values (1,'Club Deportivo Ciudad Rodrigo'),(2,'Rodrigo Atlético');
 insert into core.person (nombre_mostrado) values ('Martín Ezquerra Valcárcel'),('Rodrigo Pérez Gil'),('Pedro García López'),('Ana García Pérez'),('Javier Rodríguez Peña');
 insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, federation_id, popularidad, contexto)
 select 'persona', id, nombre_mostrado, core.normaliza_nombre(nombre_mostrado), 1, id::int, 'jugador' from core.person;
 insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, federation_id, popularidad, contexto, es_alias)
   values ('persona', 1, 'M. Ezquerra', core.normaliza_nombre('M. Ezquerra'), 1, 1, 'jugador', true);
 insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, federation_id, popularidad, contexto)
 select 'club', id, nombre_canonico, core.normaliza_nombre(nombre_canonico), federation_id, 50, 'club' from core.club;`);
const busca = async (t, tipo = null) => (await q(sql, [t, null, tipo, null, 20])).map((r) => `${r.tipo}:${r.nombre}`);
ok((await q(`select count(*)::int n from analytics.search_palabra`))[0].n > 15, 'el disparador llena el índice de palabras al proyectar');
let r = await busca('ezquerra');
ok(r.length === 1 && r[0] === 'jugador:Martín Ezquerra Valcárcel', 'apellido raro: una persona (el alias no la duplica)', r);
ok((await busca('valcarcel ezquerra')).length === 1, 'palabras en cualquier orden');
ok((await busca('ezq')).length === 1, 'comienzo de palabra (ezq → Ezquerra)');
r = await busca('rodrigo');
ok(r.includes('jugador:Rodrigo Pérez Gil') && r.includes('club:Rodrigo Atlético') && r.includes('club:Club Deportivo Ciudad Rodrigo') && !r.includes('jugador:Javier Rodríguez Peña'),
   'rodrigo: jugadores y clubes que tienen esa palabra; «Rodríguez» no (es otra palabra)', r);
ok(r[0] === 'club:Rodrigo Atlético' || r[0] === 'jugador:Rodrigo Pérez Gil', 'primero lo que empieza por la palabra buscada', r);
ok((await busca('rodrigo', 'club')).every((x) => x.startsWith('club:')), 'filtro de tipo');
r = await busca('garcia perez');
ok(r.length === 1 && r[0] === 'jugador:Ana García Pérez', 'dos apellidos: sólo quien tiene los dos', r);
ok((await busca('garcía')).length === 2, 'tildes: «garcía» = «garcia»');
await q(`delete from analytics.search_entity where entity_type = 'persona' and entity_id = 1`);
ok((await busca('ezquerra')).length === 0 && (await q(`select count(*)::int n from analytics.search_palabra where entity_id = 1 and entity_type = 'persona'`))[0].n === 0, 'al borrar de search_entity se borran sus palabras');
ok((await busca('   ')).length === 0, 'búsqueda vacía: nada (y sin error)');
fin();
