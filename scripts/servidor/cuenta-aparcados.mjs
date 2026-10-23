/*
 * Cuántos trabajos quedan aparcados al año 2099 («nunca») en una cola. Sólo el número.
 *
 * Existe como fichero y no como `node -e` en línea porque este proyecto tiene documentado que PowerShell 5.1
 * no escapa las comillas al pasar argumentos a un ejecutable nativo: el JavaScript llega roto **y falla en
 * silencio**. El 06/10/2026 pasó, y las dieciséis federaciones contestaron «no tiene nada aparcado» con
 * 27.381 trabajos aparcados en Aragón.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/cuenta-aparcados.mjs <cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) { console.log(0); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const n = db.prepare(`select count(*) n from trabajos
    where estado in ('pendiente','bloqueado')
      and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01'`).get().n;
  console.log(Number(n));
} finally {
  db.close();
}
