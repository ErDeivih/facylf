#!/usr/bin/env node
/*
 * ── COPIA COHERENTE DE UNA COLA, EN CALIENTE ────────────────────────────────────────────────────────────
 *
 * Copiar un `cola-v2.sqlite` a pelo, con el recolector dentro, es copiar un fichero que está cambiando: se
 * puede llevar transacciones a medias y el `-wal` sin él. `VACUUM INTO` escribe un fichero NUEVO y compacto a
 * partir de una lectura consistente, así que la copia vale aunque el worker siga trabajando.
 *
 * Y una copia que no se puede abrir no es una copia: después de escribirla se le pasa un `quick_check` y se
 * cuenta lo que trae (peticiones y trabajo pendiente). Si no abre, el guion sale con código distinto de cero y
 * la copia de seguridad de la noche lo cuenta como fallo y avisa.
 *
 * Esto existe porque `scripts/servidor/copias.sh` usaba `sqlite3` (que NO está instalado en el servidor) y un
 * respaldo con `node:22-alpine`, donde `node:sqlite` exige `--experimental-sqlite`: medido el 22/09/2026, las 19
 * colas salían «FALLO» cada noche y el aviso de ntfy era lo único que se enteraba.
 *
 * Uso (dentro de un contenedor con la imagen del recolector):
 *   node scripts/servidor/copia-cola.mjs <cola.sqlite> <copia.sqlite>
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [origen, destino] = process.argv.slice(2);
if (!origen || !destino) {
  console.error('Uso: copia-cola.mjs <cola.sqlite> <copia.sqlite>');
  process.exit(2);
}
if (!existsSync(origen)) {
  console.error(`no existe la cola: ${origen}`);
  process.exit(2);
}

const mb = (bytes) => (bytes / 1024 ** 2).toFixed(1);

let db;
try {
  db = new DatabaseSync(origen, { readOnly: true });
  // `VACUUM INTO` no sobrescribe: si la copia del día ya existe, se quita antes.
  if (existsSync(destino)) rmSync(destino, { force: true });
  db.exec(`vacuum into '${destino.replace(/'/g, "''")}'`);
} catch (error) {
  console.error(`FALLO al copiar ${origen}: ${error.message}`);
  process.exit(1);
} finally {
  try { db?.close(); } catch { /* ya cerrada */ }
}

// La copia se comprueba abriéndola: es lo que convierte «hay un fichero» en «hay una copia».
let copia;
try {
  copia = new DatabaseSync(destino, { readOnly: true });
  const integridad = copia.prepare('pragma quick_check').get().quick_check;
  if (integridad !== 'ok') throw new Error(`quick_check=${integridad}`);
  const peticiones = copia.prepare('select count(*) n from peticiones').get().n;
  const pendientes = copia.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get().n;
  console.log(`  ${origen.split('/').slice(-3, -2)[0]}: ${mb(statSync(destino).size)} MB · `
    + `íntegra · ${peticiones} peticiones · ${pendientes} pendientes`);
} catch (error) {
  console.error(`la copia NO abre: ${error.message}`);
  process.exit(1);
} finally {
  try { copia?.close(); } catch { /* ya cerrada */ }
}
