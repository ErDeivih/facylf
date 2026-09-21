/*
 * Comprueba el `insert` de la fila CONSERVADA contra el esquema REAL de la cola.
 *
 * Es la parte del cambio del recolector que las pruebas de la función pura no cubren: los nombres y el número
 * de columnas. Se lee el DDL de la cola real de Valencia, se crea una base temporal con él y se ejecuta la
 * MISMA sentencia que escribe el recolector. Si el esquema y la sentencia no encajan, aquí se ve —y no la
 * primera vez que el recolector reescriba una jornada con una recuperación, que sería a saber cuándo—.
 *
 * No toca ninguna cola real: la base temporal se borra al terminar.
 *
 * Uso: node scripts/_verifica-insert-conservada.mjs
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const real = new DatabaseSync(join(raiz, 'descargas-valencia', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const ddl = real.prepare("select sql from sqlite_master where type='table' and name='partidos'").get()?.sql;
real.close();
if (!ddl) { console.error('✗ no se pudo leer el DDL de `partidos`'); process.exit(1); }

const carpeta = mkdtempSync(join(tmpdir(), 'facylf-insert-'));
const db = new DatabaseSync(join(carpeta, 'prueba.sqlite'));
db.exec(ddl);

// La MISMA sentencia del recolector (`registraPartidos`, rama `conservada`), con 18 columnas y 18 valores.
const sentencia = `insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
  equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
  fecha,hora,campo,campo_codigo,arbitro,actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const valores = ['21', '29509571', '904325856', 1, 0, '26411904',
  '21583', '22066', "Canals Promeses C.F. 'A'", "C.D. L'Alcúdia de Crespins 'A'", null, null,
  '2025-09-07', '12:00', 'CAMPO', '77', null, new Date().toISOString()];

try {
  db.prepare(sentencia).run(...valores);
  const fila = db.prepare('select orden, codigo_acta, local, visitante, equipo_local_codigo, equipo_visitante_codigo, campo_codigo from partidos').get();
  console.log('✓ el insert de la fila conservada encaja con el esquema real');
  console.log(' ', JSON.stringify(fila));
} catch (error) {
  console.error(`✗ el insert NO encaja: ${error.message}`);
} finally {
  db.close();
  rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
