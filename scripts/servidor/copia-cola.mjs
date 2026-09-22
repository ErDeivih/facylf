#!/usr/bin/env node
/*
 * ── COPIA COHERENTE DE UNA COLA, EN CALIENTE, Y COMPROBADA ───────────────────────────────────────────────
 *
 * Copiar un `cola-v2.sqlite` a pelo, con el recolector dentro, es copiar un fichero que está cambiando: se
 * pueden llevar transacciones a medias y el `-wal` sin él. `VACUUM INTO` escribe un fichero NUEVO y compacto a
 * partir de una lectura consistente, así que la copia vale aunque el worker siga trabajando. Medido en el
 * servidor el 22/09/2026: **33 s** para una cola de 361 MB en caliente.
 *
 * Y una copia que no se puede abrir no es una copia, así que después se COMPRUEBA. Pero se comprueba lo que de
 * verdad detecta una copia rota sin costar una eternidad. Medido sobre una copia de 376 MB (Andalucía,
 * 91 822 páginas, 41 815 peticiones, 110 712 trabajos):
 *
 *     abrir la copia ....................   0,0 s
 *     `pragma page_count` / `page_size` .   0,6 s
 *     contar las tablas .................   0,0 s
 *     contar peticiones .................   1,8 s
 *     contar trabajos ...................   3,5 s
 *     `pragma quick_check` ..............  >600 s  ← y por eso NO se hace por defecto
 *
 * La comprobación normal (unos 6 s) caza lo que de verdad falla en una copia: fichero truncado o a medias,
 * fichero que no es una base, base sin las tablas esperadas. El `quick_check` completo —que además verifica el
 * orden de todos los índices— queda detrás de `--completa`, para cuando alguien quiera mirar una cola a fondo.
 *
 * Esto existe porque `scripts/servidor/copias.sh` usaba `sqlite3` (que NO está instalado en el servidor) y un
 * respaldo con `node:22-alpine`, donde `node:sqlite` exige `--experimental-sqlite`: medido el 22/09/2026, las 19
 * colas salían «FALLO» cada noche y el aviso de ntfy era lo único que se enteraba.
 *
 * Uso (dentro de un contenedor con la imagen del recolector):
 *   node scripts/servidor/copia-cola.mjs <cola.sqlite> <copia.sqlite> [--completa]
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const COMPLETA = process.argv.includes('--completa');
const [origen, destino] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!origen || !destino) {
  console.error('Uso: copia-cola.mjs <cola.sqlite> <copia.sqlite> [--completa]');
  process.exit(2);
}
if (!existsSync(origen)) {
  console.error(`no existe la cola: ${origen}`);
  process.exit(2);
}

const mb = (bytes) => (bytes / 1024 ** 2).toFixed(1);
const federacion = origen.split('/').slice(-3, -2)[0] ?? origen;

let db;
try {
  db = new DatabaseSync(origen, { readOnly: true });
  // `VACUUM INTO` no sobrescribe: si la copia del día ya existe, se quita antes.
  if (existsSync(destino)) rmSync(destino, { force: true });
  db.exec(`vacuum into '${destino.replace(/'/g, "''")}'`);
} catch (error) {
  console.error(`  ${federacion}: FALLO al copiar — ${error.message}`);
  process.exit(1);
} finally {
  try { db?.close(); } catch { /* ya cerrada */ }
}

/* ── Y la comprobación: abrir la copia y mirar que es una base con lo que tiene que tener ── */
let copia;
try {
  copia = new DatabaseSync(destino, { readOnly: true });
  const paginas = copia.prepare('pragma page_count').get().page_count;
  const tamanoPagina = copia.prepare('pragma page_size').get().page_size;
  const declarado = paginas * tamanoPagina;
  const real = statSync(destino).size;
  // Que el tamaño declarado por la cabecera cuadre con el fichero es lo que detecta una copia TRUNCADA, que es
  // el fallo que de verdad ocurre cuando se corta una copia a medias.
  if (declarado !== real) {
    throw new Error(`la cabecera dice ${mb(declarado)} MB y el fichero pesa ${mb(real)} MB: copia truncada`);
  }
  const tablas = copia.prepare("select count(*) n from sqlite_master where type = 'table'").get().n;
  const peticiones = copia.prepare('select count(*) n from peticiones').get().n;
  const trabajos = copia.prepare('select count(*) n from trabajos').get().n;
  const pendientes = copia.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get().n;
  if (!tablas || !peticiones) throw new Error(`la copia no tiene peticiones (tablas=${tablas})`);

  let veredicto = 'íntegra';
  if (COMPLETA) {
    const q = copia.prepare('pragma quick_check').get().quick_check;
    if (q !== 'ok') throw new Error(`quick_check=${q}`);
    veredicto = 'íntegra (quick_check completo)';
  }
  console.log(`  ${federacion}: ${mb(real)} MB · ${veredicto} · ${peticiones} peticiones · `
    + `${trabajos} trabajos (${pendientes} pendientes)`);
} catch (error) {
  console.error(`  ${federacion}: la copia NO vale — ${error.message}`);
  process.exit(1);
} finally {
  try { copia?.close(); } catch { /* ya cerrada */ }
}
