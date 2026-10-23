/*
 * Una línea por temporada: `hechos|pendiente|aplazado|actasHechas`. Para medir si lo que se abrió avanza.
 *
 * Existe como fichero y no como `node -e` en línea porque este proyecto ya tiene documentado que PowerShell
 * 5.1 no escapa las comillas al pasar argumentos a un ejecutable nativo, y el JavaScript llega roto **y falla
 * en silencio**: el 06/10/2026 las dieciséis federaciones contestaron «no tiene nada aparcado» con 27.381
 * trabajos aparcados en Aragón.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/progreso-temporada.mjs <cola.sqlite> <temporada>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, temporada] = process.argv.slice(2);
if (!ruta || !temporada || !existsSync(ruta)) { console.log('?|?|?|?'); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const ahora = new Date().toISOString();
try {
  const u = (sql, ...p) => Number(db.prepare(sql).get(...p)?.n ?? 0);
  const hechos = u(`select count(*) n from trabajos where temporada = ? and estado='hecho'`, String(temporada));
  const pend = u(`select count(*) n from trabajos where temporada = ? and estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)`, String(temporada), ahora);
  const aplaz = u(`select count(*) n from trabajos where temporada = ? and estado in ('pendiente','bloqueado')
    and siguiente_intento > ?`, String(temporada), ahora);
  // Las actas de esa temporada que ya están guardadas: es el resultado final, lo que de verdad importa.
  const actas = u(`select count(*) n from actas where temporada = ? and estado = 'hecha'`, String(temporada));
  console.log(`${hechos}|${pend}|${aplaz}|${actas}`);
} finally {
  db.close();
}
