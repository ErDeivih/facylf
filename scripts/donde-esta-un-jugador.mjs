/*
 * Â¿Ese jugador del que el informe dice Â«sin datosÂ» estÃ¡ de verdad en algÃºn sitio, o no lo tenemos?
 *
 * Busca un nombre en las `participaciones` de las 19 colas y dice en quÃ© grupo y temporada aparece, y si ese
 * grupo estÃ¡ ya en el canÃ³nico. Es la comprobaciÃ³n que convierte un Â«sin datosÂ» en una respuesta: o no estÃ¡
 * recolectado, o estÃ¡ recolectado y pendiente de importar.
 *
 * SÃ“LO LEE. Uso: node scripts/donde-esta-un-jugador.mjs "DE LA IGLESIA" ["SANCHEZ ESPINOSA"]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');

const norm = (texto) => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const patrones = process.argv.slice(2).map(norm);
if (patrones.length === 0) { console.error('uso: node .tmp-busca-jugador.mjs "APELLIDO NOMBRE" â€¦'); process.exit(1); }

for (const linea of (await import('node:fs')).readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
  const i = linea.indexOf('=');
  if (i > 0 && !process.env[linea.slice(0, i)]) process.env[linea.slice(0, i)] = linea.slice(i + 1).trim();
}
const cliente = new Client({ connectionString: process.env.DATABASE_URL_LECTOR, statement_timeout: 120_000 });
await cliente.connect();
const { rows: fed } = await cliente.query('select codigo from core.federation');
await cliente.end();
const federacionesConCanonico = new Set(fed.map((f) => f.codigo));

for (const carpeta of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!carpeta.isDirectory() || !carpeta.name.startsWith('descargas-')) continue;
  if (carpeta.name === 'descargas-federacion-sondeo' || carpeta.name === 'descargas-prueba-10gb') continue;
  const ruta = join(RAIZ, carpeta.name, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta) || existsSync(join(RAIZ, carpeta.name, '.PRUEBA'))) continue;
  const federacion = carpeta.name === 'descargas-federacion' ? 'castilla-leon' : carpeta.name.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const filas = db.prepare(`select temporada, competicion, grupo, jornada, acta, nombre from participaciones`).all();
    const porJugador = new Map();
    for (const f of filas) {
      const nombre = norm(f.nombre);
      const patron = patrones.find((p) => nombre.includes(p));
      if (!patron) continue;
      const clave = `${patron}|${f.temporada}|${f.competicion}|${f.grupo}`;
      const actual = porJugador.get(clave) ?? { patron, temporada: f.temporada, competicion: f.competicion, grupo: f.grupo, filas: 0, nombres: new Set() };
      actual.filas += 1;
      actual.nombres.add(f.nombre);
      porJugador.set(clave, actual);
    }
    if (porJugador.size === 0) continue;
    // Las temporadas de la cola son cÃ³digos; se traducen con su tabla.
    const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));
    console.log(`\n=== ${federacion}${federacionesConCanonico.has(federacion) ? '' : ' (sin federaciÃ³n en el canÃ³nico)'}`);
    for (const v of porJugador.values()) {
      console.log(`  ${etiquetas.get(v.temporada) ?? v.temporada} c${v.competicion} g${v.grupo} Â· ${v.filas} participaciones Â· `
        + `${[...v.nombres].slice(0, 3).join(' / ')}`);
    }
  } catch (error) {
    console.error(`  ${federacion}: ${error.message}`);
  } finally { db.close(); }
}

