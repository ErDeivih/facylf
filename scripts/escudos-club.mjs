#!/usr/bin/env node
/*
 * Guarda escudos de club sin repetirlos.
 *
 * Uso manual (una imagen facilitada por el club o por el usuario):
 *   node scripts/escudos-club.mjs --club 16 --archivo informes/recursos/ciudad-rodrigo.jpg --fuente "facilitado por el usuario"
 *
 * El contenido queda en PostgreSQL con su huella y procedencia. La URL externa no es la fuente de
 * servicio de la web: el binario se conserva localmente para que un cambio de portal no rompa informes.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* el mensaje claro se da debajo */ }
}
const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const clubId = Number(arg('club'));
const archivo = arg('archivo');
const fuente = arg('fuente') ?? 'archivo local aportado para el informe';
if (!Number.isInteger(clubId) || clubId <= 0 || !archivo) {
  console.error('uso: node scripts/escudos-club.mjs --club <id> --archivo <imagen> [--fuente <texto>]');
  process.exit(2);
}
const ruta = resolve(RAIZ, archivo);
if (!existsSync(ruta)) throw new Error(`No existe la imagen: ${ruta}`);
const contenido = readFileSync(ruta);
const firmas = [
  { mime: 'image/jpeg', prueba: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', prueba: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', prueba: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'image/svg+xml', prueba: (b) => /<svg\b/i.test(b.subarray(0, 1024).toString('utf8')) },
];
const mime = firmas.find((f) => f.prueba(contenido))?.mime;
if (!mime) throw new Error(`Formato de imagen no admitido (${extname(ruta) || 'sin extensión'}).`);
const sha256 = createHash('sha256').update(contenido).digest('hex');
const url = process.env.DATABASE_URL_PUBLICADOR;
if (!url) throw new Error('Falta DATABASE_URL_PUBLICADOR en .env.');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const cliente = new Client({ connectionString: url, application_name: 'facylf-escudos' });
await cliente.connect();
try {
  await cliente.query('begin');
  const club = await cliente.query('select nombre_canonico from core.club where id=$1', [clubId]);
  if (club.rowCount !== 1) throw new Error(`No existe el club ${clubId}.`);
  await cliente.query(`update core.club_asset set vigente=false
    where club_id=$1 and tipo='escudo' and vigente and sha256<>$2`, [clubId, sha256]);
  const guardado = await cliente.query(`insert into core.club_asset
      (club_id,tipo,mime_type,sha256,contenido,fuente_descripcion,vigente)
    values ($1,'escudo',$2,$3,$4,$5,true)
    on conflict (club_id,tipo,sha256) do update set
      mime_type=excluded.mime_type, contenido=excluded.contenido,
      fuente_descripcion=excluded.fuente_descripcion, observado_en=now(), vigente=true
    returning id`, [clubId, mime, sha256, contenido, fuente]);
  await cliente.query('commit');
  console.log(JSON.stringify({ club: club.rows[0].nombre_canonico, assetId: guardado.rows[0].id,
    mime, bytes: contenido.length, sha256 }, null, 2));
} catch (error) {
  await cliente.query('rollback');
  throw error;
} finally {
  await cliente.end();
}

