/*
 * Desaplaza tres trabajos de jornada en una cola COPIA, para que una prueba tenga algo que hacer.
 *
 * Existe porque una prueba de bloqueo necesita que el recolector LLEGUE a pedir plaza de navegador: con la
 * cola entera aplazada, sale antes y no se prueba nada. Se usa sólo sobre copias en un directorio temporal.
 *
 * Uso: node scripts/_prueba-desaplazar-tres.mjs <ruta-cola.sqlite>
 */
import { createRequire } from 'node:module';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: _prueba-desaplazar-tres.mjs <ruta-cola.sqlite>');
  process.exit(1);
}
const db = new DatabaseSync(ruta);
/*
 * Se eligen jornadas de temporadas HISTÓRICAS a propósito: las de la temporada en curso tienen fecha futura y
 * el planificador las vuelve a aplazar en el siguiente arranque, así que desaplazarlas no sirve de nada —eso
 * fue lo que hizo fallar el primer intento de esta prueba—.
 */
/*
 * `siguiente_intento = null` NO significa «disponible ahora»: el seleccionador exige una fecha que ya haya
 * pasado, y un nulo es «sin programar», que no se coge. Se pone una fecha CLARAMENTE pasada.
 */
const r = db.prepare(`update trabajos set siguiente_intento = '2026-01-01T00:00:00.000Z'
  where clave in (
    select t.clave from trabajos t
     where t.estado = 'pendiente' and t.tipo = 'jornada'
       and t.temporada not in (select cast(max(cast(codigo as integer)) as text) from temporadas)
     limit 3)`).run();
console.log(`desaplazados: ${r.changes} (de temporadas históricas, con fecha pasada)`);
db.close();
