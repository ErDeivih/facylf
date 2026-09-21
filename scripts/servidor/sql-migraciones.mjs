#!/usr/bin/env node
/*
 * ── GENERA EL SQL DE TODAS LAS MIGRACIONES, PARA APLICARLO EN EL SERVIDOR ───────────────────────────────
 *
 * `scripts/migrar-canonico.mjs` ejecuta `psql` dentro del contenedor con el cliente de Docker del host. En el
 * servidor **no hay Node en el host** (así que ese guion no se puede correr allí) pero sí hay `psql` dentro del
 * contenedor de PostgreSQL. Esto genera un único fichero SQL que deja el mismo resultado:
 *
 *   · recorre `infra/migraciones/*.sql` en orden,
 *   · calcula el MISMO hash que el guion oficial (sha256 del contenido, 16 caracteres),
 *   · y después de cada migración escribe su fila en `ops.migracion`.
 *
 * Va como SQL PLANO, no dentro de un bloque `do $$…$$`: ahí dentro el SQL sería PL/pgSQL y hay migraciones con
 * sentencias que no se pueden ejecutar así. Es a propósito para una base RECIÉN CREADA: si `ops.migracion` ya
 * existe, este script no se debe usar (para eso está el guion oficial, que respeta lo ya aplicado).
 *
 * Uso:  node scripts/servidor/sql-migraciones.mjs --salida migraciones.sql
 *       node scripts/servidor/sql-migraciones.mjs > migraciones.sql      (con `cmd`, NO con PowerShell)
 *
 * ── POR QUÉ HAY `--salida` ──────────────────────────────────────────────────────────────────────────────
 *
 * Redirigir con `>` en PowerShell escribe el fichero en **UTF-16**, y `psql` lo rechaza con «invalid byte
 * sequence for encoding UTF8: 0xff» (ese 0xff es la marca de orden de bytes). Con `--salida` el fichero lo
 * escribe Node en UTF-8 y el problema desaparece.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMigraciones = join(raiz, 'infra', 'migraciones');
const argumentos = process.argv.slice(2);
const indice = argumentos.indexOf('--salida');
const salida = indice >= 0 ? argumentos[indice + 1] : null;

const ficheros = readdirSync(dirMigraciones).filter((f) => f.endsWith('.sql')).sort();
const lineas = [];
// Todo se acumula y al final se escribe: así el fichero sale en UTF-8 (lo que `psql` espera) y no en el UTF-16
// que escribe una redirección de PowerShell.
const escribe = (texto) => { lineas.push(texto); };

escribe('-- Migraciones del canónico de facylf, generadas desde infra/migraciones.');
escribe('-- PARA UNA BASE RECIÉN CREADA. Cada migración deja su fila en ops.migracion con el mismo hash');
escribe('-- que calcula scripts/migrar-canonico.mjs, así que después no se vuelven a aplicar.');
escribe('\\set ON_ERROR_STOP on');
escribe('');

for (const nombre of ficheros) {
  const numero = Number(nombre.slice(0, 4));
  if (!Number.isInteger(numero)) throw new Error(`Nombre de migración inválido: ${nombre}`);
  const sql = readFileSync(join(dirMigraciones, nombre), 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex').slice(0, 16);

  escribe(`-- ══════════ ${nombre} (${hash}) ══════════`);
  escribe('begin;');
  escribe(sql.trimEnd());
  escribe(`insert into ops.migracion (numero, nombre, hash) values (${numero}, '${nombre}', '${hash}');`);
  escribe('commit;');
  escribe('');
}
escribe('-- fin de las migraciones');

const texto = `${lineas.join('\n')}\n`;
if (salida) writeFileSync(salida, texto, 'utf8');
else process.stdout.write(texto);
