/*
 * Imprime el código de la TEMPORADA MÁS RECIENTE que esté aparcada («nunca» = 2099) en una cola, o nada si no
 * hay ninguna. Es la que toca abrir primero: lo más cercano en el tiempo da «temporadas anteriores» para los
 * jugadores de hoy, y es el orden que pidió David.
 *
 * Existe como fichero y no como `node -e` en línea porque este proyecto ya tiene documentado que **PowerShell
 * 5.1 no escapa las comillas al pasar argumentos a un ejecutable nativo**, y el JavaScript llega roto. El
 * 06/10/2026 volvió a pasar dentro de `abre-recientes.sh`: las dieciséis federaciones contestaron «no tiene
 * nada aparcado» con 27.381 trabajos aparcados en Aragón, porque la consulta en línea falló en silencio.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/temporada-aparcada-mas-reciente.mjs <cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) process.exit(0);

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const fila = db.prepare(`select temporada, count(*) n from trabajos
    where estado in ('pendiente','bloqueado')
      and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01'
    group by 1 order by cast(temporada as integer) desc limit 1`).get();
  if (fila) console.log(`${fila.temporada} ${fila.n}`);
} finally {
  db.close();
}
