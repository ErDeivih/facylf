#!/usr/bin/env node
/**
 * Comprime los ficheros YA archivados que siguen sin comprimir.
 *
 *  Los que se guardaron antes del cambio ocupan ~30 GB entre todas las federaciones (medido: solo
 *  Castilla y León tiene 8 GB en ficheros de más de 8 KB). Se comprime cada uno y **sólo se borra el
 *  original si la comprobación de ida y vuelta coincide byte a byte**: si algo falla, el fichero se
 *  deja como estaba y se sigue con el siguiente. Las rutas de `actas` y `jornadas` se actualizan a la
 *  nueva, y las que queden sin actualizar también se leen bien porque `leeArchivo` busca el `.gz`.
 *
 * Uso: node scripts/comprimir-archivo.mjs [--federacion X] [--limite N] [--aplicar]
 */
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';

const RAIZ = resolve(import.meta.dirname, '..');
const argumento = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const solo = argumento('federacion', null);
const limite = Number(argumento('limite', 4000));
const aplicar = process.argv.includes('--aplicar');
const MINIMO = 8192;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let vistos = 0;

const dirs = readdirSync(RAIZ).filter((d) => d.startsWith('descargas-'))
  .filter((d) => (solo ? d.includes(solo) : true));
let comprimidos = 0; let ahorrado = 0; let fallos = 0; let pendientes = 0; let reparados = 0;

for (const dir of dirs) {
  const rutaDb = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(rutaDb, aplicar ? {} : { readOnly: true });
  // Los workers escriben en estas bases mientras esto corre: sin esperar el turno, cualquier choque
  // termina en «database is locked» (pasó el 12/09/2026) y la pasada se queda a medias.
  try { db.exec('pragma busy_timeout = 30000'); } catch { /* no crítico */ }
  let filas;
  try {
    filas = db.prepare(`select ruta, tipo, bytes, hash from archivos
      where bytes >= ? and ruta not like '%.gz' order by bytes desc limit ?`).all(MINIMO, limite);
    pendientes += Number(db.prepare(`select count(*) n from archivos where bytes >= ? and ruta not like '%.gz'`)
      .get(MINIMO).n ?? 0);
  } catch { db.close(); continue; }

  // Renombrar la fila, no actualizarla en sitio: al comprimir, la ruta nueva (`…​.gz`) puede existir
  // YA en `archivos` (el worker guardó ese mismo fichero otra vez), y un `update` chocaba con la clave
  // única y abortaba la transacción entera de la federación — pasó en 12 federaciones.
  const renombraArchivo = (destino, bytes, hash, origen) => {
    db.prepare('delete from archivos where ruta=?').run(destino);
    db.prepare(`insert into archivos(ruta,tipo,hash,bytes,guardado_en)
      values(?,coalesce((select tipo from archivos where ruta=?),'archivo'),?,?,?)
      on conflict(ruta) do update set bytes=excluded.bytes, hash=excluded.hash`).run(destino, origen, hash, bytes, new Date().toISOString());
    db.prepare('delete from archivos where ruta=?').run(origen);
  };
  const actualizaActas = db.prepare('update actas set archivo=? where archivo=?');
  const actualizaJornadas = db.prepare('update jornadas set archivo=? where archivo=?');
  let hechosAqui = 0;
  // Las actualizaciones de la base van DENTRO de una transacción. Sin ella, cada fichero hacía tres
  // escrituras sueltas (una por tabla) y cada una espera su turno frente al worker que está
  // recolectando: se medían ~4 s por fichero, cuando comprimir tarda milisegundos.
  db.exec('begin immediate');
  try {
    for (const f of filas) {
      if (!existsSync(f.ruta)) {
        // La primera pasada comprimió ficheros pero no pudo anotarlo en la base (hacía las escrituras
        // sueltas y el worker se las dejaba esperando). El fichero está en su sitio con `.gz`, así que
        // se corrige la ruta en vez de dejarla apuntando a algo que ya no existe.
        const yaComprimido = `${f.ruta}.gz`;
        if (existsSync(yaComprimido)) {
          renombraArchivo(yaComprimido, statSync(yaComprimido).size, f.hash, f.ruta);
          actualizaActas.run(yaComprimido, f.ruta);
          actualizaJornadas.run(yaComprimido, f.ruta);
          reparados += 1;
        }
        continue;
      }
      try {
        const original = readFileSync(f.ruta);
        // Nivel 1 (rápido) en vez del 6 por defecto: comprimir 280.000 ficheros al nivel por defecto
        // satura el CPU y deja a los recolectores sin turno (medido el 13/09/2026: 97 % de CPU y siete
        // federaciones sin pedir nada). Al nivel 1 se comprime casi igual y cuesta una fracción.
        const comprimido = gzipSync(original, { level: 1 });
        // Cada 200 ficheros se suelta el turno un instante para no acaparar CPU ni disco.
        if (++vistos % 200 === 0) await dormir(250);
        // Ida y vuelta antes de tocar nada: si no coincide, no se borra el original.
        if (gunzipSync(comprimido).compare(original) !== 0) { fallos += 1; continue; }
        if (comprimido.length >= original.length) continue; // no compensa
        if (!aplicar) { comprimidos += 1; ahorrado += original.length - comprimido.length; continue; }
        const destino = `${f.ruta}.gz`;
        const temporal = `${destino}.tmp`;
        writeFileSync(temporal, comprimido);
        renameSync(temporal, destino);
        if (statSync(destino).size !== comprimido.length) { rmSync(destino, { force: true }); fallos += 1; continue; }
        rmSync(f.ruta, { force: true });
        renombraArchivo(destino, comprimido.length, f.hash, f.ruta);
        actualizaActas.run(destino, f.ruta);
        actualizaJornadas.run(destino, f.ruta);
        comprimidos += 1; hechosAqui += 1;
        ahorrado += original.length - comprimido.length;
      } catch { fallos += 1; }
    }
    db.exec('commit');
  } catch (error) {
    try { db.exec('rollback'); } catch { /* la transacción ya estaba cerrada */ }
    console.log(`  ${dir}: se abortó la transacción (${error.message}); lo ya comprimido se conserva`);
  }
  if (hechosAqui) console.log(`  ${dir}: ${hechosAqui} ficheros comprimidos`);
  db.close();
}
console.log(`${aplicar ? 'comprimidos' : 'se comprimirían'}: ${comprimidos} · rutas reparadas: ${reparados} · ahorro ${(ahorrado / 1048576).toFixed(1)} MB · fallos ${fallos}`);
console.log(`quedan por comprimir en total: ${pendientes}`);
if (!aplicar) console.log('(sin --aplicar no se toca nada)');


