#!/usr/bin/env node
/*
 * sql-paquete.mjs — SÓLO LEE. Ejecuta una consulta SQL de lectura sobre un paquete SQLite de _traspaso.
 *
 * Para qué: diagnosticar casos como el de Euskadi 2022-23 (un partido de más en el paquete)
 * sin escribir código en el importador ni tocar nada.
 *
 * Uso:  node pruebas/reconstruccion/sql-paquete.mjs <paquete.sqlite> "<consulta sql>"
 *       node pruebas/reconstruccion/sql-paquete.mjs <paquete.sqlite> --tablas
 *       node pruebas/reconstruccion/sql-paquete.mjs <paquete.sqlite> --columnas <tabla>
 */
import { DatabaseSync } from 'node:sqlite';

const [ruta, sql, extra] = process.argv.slice(2);
if (!ruta) { console.error('Falta el paquete.'); process.exit(2); }

const d = new DatabaseSync(ruta, { readOnly: true });
const tablas = d.prepare("select name from sqlite_master where type='table' order by name").all().map((r) => r.name);

if (sql === '--tablas') { console.log(tablas.join('\n')); process.exit(0); }
if (sql === '--columnas') { console.log(d.prepare(`pragma table_info(${extra})`).all().map((c) => c.name).join(', ')); process.exit(0); }
if (!sql) { console.error('Uso: sql-paquete.mjs <paquete.sqlite> "<consulta sql>" | --tablas | --columnas <tabla>'); process.exit(2); }

// Sólo lectura: se rechaza cualquier cosa que no empiece por select/pragma/with.
if (!/^\s*(select|pragma|with)\b/i.test(sql)) { console.error('Sólo consultas de lectura (select/pragma/with).'); process.exit(2); }

const filas = d.prepare(sql).all();
console.log(JSON.stringify(filas, null, 1));
console.log(`(${filas.length} filas)`);
d.close();
