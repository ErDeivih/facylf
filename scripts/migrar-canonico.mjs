#!/usr/bin/env node
// Aplica las migraciones SQL de infra/migraciones sobre el PostgreSQL canónico.
// No usa ORM ni dependencias nuevas: ejecuta psql dentro del contenedor.
//   node scripts/migrar-canonico.mjs            aplica las pendientes
//   node scripts/migrar-canonico.mjs --estado   sólo informa
//   node scripts/migrar-canonico.mjs --seco     imprime lo que haría
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirMigraciones = join(raiz, 'infra', 'migraciones');
const CONTENEDOR = process.env.FACYLF_PG_CONTENEDOR ?? 'facylf-postgres';
const BASE = process.env.FACYLF_PG_BASE ?? 'facylf';
const USUARIO = process.env.FACYLF_PG_USUARIO ?? 'facylf_admin';

const soloEstado = process.argv.includes('--estado');
const seco = process.argv.includes('--seco');

function psql(sql, { silencioso = false } = {}) {
  try {
    return execFileSync(
      'docker',
      ['exec', '-i', CONTENEDOR, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', USUARIO, '-d', BASE,
       ...(silencioso ? ['-tA'] : []), '-f', '-'],
      { input: sql, encoding: 'utf8' },
    );
  } catch (error) {
    const detalle = String(error?.stderr ?? error?.message ?? error).trim().split('\n').at(-1);
    console.error(`✗ No se pudo ejecutar psql en el contenedor ${CONTENEDOR}.`);
    if (detalle) console.error(`  ${detalle}`);
    console.error('  Comprueba que Docker Desktop está iniciado y ejecuta primero pnpm db:arrancar.');
    process.exit(1);
  }
}

const ficheros = readdirSync(dirMigraciones)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((nombre) => {
    const numero = Number(nombre.slice(0, 4));
    if (!Number.isInteger(numero)) throw new Error(`Nombre de migración inválido: ${nombre}`);
    const sql = readFileSync(join(dirMigraciones, nombre), 'utf8');
    return { numero, nombre, sql, hash: createHash('sha256').update(sql).digest('hex').slice(0, 16) };
  });

const aplicadas = new Map();
// No se captura un error de conexión como si fuese una base vacía. Primero comprobamos que
// PostgreSQL responde y después preguntamos si existe el registro de migraciones.
const registroExiste = psql(
  "select to_regclass('ops.migracion') is not null;",
  { silencioso: true },
).trim() === 't';
if (registroExiste) {
  const salida = psql(
    'select numero, nombre, hash from ops.migracion order by numero;',
    { silencioso: true },
  );
  for (const linea of salida.trim().split('\n').filter(Boolean)) {
    const [numero, nombre, hash] = linea.split('|');
    aplicadas.set(Number(numero), { nombre, hash });
  }
} else {
  console.log('· ops.migracion todavía no existe: base vacía.');
}

let cambios = 0;
for (const m of ficheros) {
  const ya = aplicadas.get(m.numero);
  if (ya) {
    if (ya.hash !== m.hash) {
      console.error(`✗ ${m.nombre} ya se aplicó y su contenido ha cambiado.`);
      console.error('  Una migración aplicada no se edita: escribe otra.');
      process.exit(1);
    }
    console.log(`= ${m.nombre}`);
    continue;
  }
  cambios += 1;
  if (soloEstado || seco) { console.log(`+ ${m.nombre} (pendiente)`); continue; }
  process.stdout.write(`+ ${m.nombre} … `);
  psql(`begin;\n${m.sql}\ninsert into ops.migracion (numero, nombre, hash) values (${m.numero}, '${m.nombre}', '${m.hash}');\ncommit;`);
  console.log('hecha');
}

if (!cambios) console.log('Nada pendiente.');
