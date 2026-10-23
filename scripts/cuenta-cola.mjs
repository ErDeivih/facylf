/*
 * cuenta-cola.mjs — lo esencial de una cola, en una línea, sin abrirla en escritura
 *
 * ── POR QUÉ EXISTE (y no un `node -e` en línea) ─────────────────────────────────────────────────────────
 *
 * El 24/09/2026, al instalar en el PC las colas que vienen del servidor, el guion de PowerShell comprobaba el
 * contenido con `node -e "<javascript>"`. No funciona: **Windows PowerShell 5.1 no escapa las comillas dobles al
 * pasar argumentos a un ejecutable nativo**, así que Node recibía el JavaScript roto (`[eval]:1` y error de
 * sintaxis). Sacarlo a un fichero quita el problema de raíz, y de paso la comprobación se puede repetir desde
 * cualquier máquina.
 *
 * Imprime `trabajos|actas_hechas|actas_pendientes`, que es lo que hace falta para responder a dos preguntas:
 * ¿la copia se abre y tiene las tablas que debe?, y ¿trae MÁS trabajo hecho que la que había?
 *
 * SÓLO LEE: abre la cola en modo `readOnly`.
 *
 * Uso:  node scripts/cuenta-cola.mjs <ruta-de-la-cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) {
  console.error('uso: cuenta-cola.mjs <ruta-de-la-cola.sqlite>');
  process.exit(2);
}
if (!existsSync(ruta)) {
  console.error(`no existe la cola: ${ruta}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const n = (sql, ...parametros) => Number(db.prepare(sql).get(...parametros)?.n ?? 0);

try {
  console.log([
    n('select count(*) n from trabajos'),
    n('select count(*) n from actas where estado = ?', 'hecha'),
    n('select count(*) n from actas where estado = ?', 'pendiente'),
  ].join('|'));
} finally {
  db.close();
}
