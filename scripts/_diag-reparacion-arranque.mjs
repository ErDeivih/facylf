/* Comprobación de la causa: cuántas actas tiene cada federación pendientes de "reparar" por el
 * cambio de VERSION_PARSER_ACTA, y si eso explica que algunas no hayan hecho nada desde el reinicio.
 *
 * `arrancar` ejecuta `reparaActasDesactualizadas` ANTES de empezar a recolectar, y sólo imprime al
 * terminar. Con miles de actas por re-parsear, la federación se pasa minutos (o mucho más) en
 * silencio. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const VERSION_ACTUAL = 16;

const federaciones = [
  ['castilla-leon', 'descargas-federacion'], ['andalucia', 'descargas-andalucia'], ['aragon', 'descargas-aragon'],
  ['asturias', 'descargas-asturias'], ['canarias', 'descargas-canarias'], ['cantabria', 'descargas-cantabria'],
  ['castilla-la-mancha', 'descargas-castilla-la-mancha'], ['ceuta', 'descargas-ceuta'], ['euskadi', 'descargas-euskadi'],
  ['extremadura', 'descargas-extremadura'], ['galicia', 'descargas-galicia'], ['madrid', 'descargas-madrid'],
  ['murcia', 'descargas-murcia'], ['navarra', 'descargas-navarra'], ['rioja', 'descargas-rioja'],
  ['valencia', 'descargas-valencia'],
];

console.log('federación           actas     a reparar   última línea del registro tras el arranque');
console.log('-'.repeat(96));
for (const [nombre, carpeta] of federaciones) {
  const ruta = `${carpeta}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const conArchivo = db.prepare('select count(*) n from actas where archivo is not null').get().n;
  const aReparar = db.prepare(`select count(*) n from actas
    where archivo is not null and coalesce(version_parser,0) < ?`).get(VERSION_ACTUAL).n;
  db.close();

  // ¿Qué ha escrito el registro después del último "Arrancando o reanudando la ingesta"?
  const log = `${carpeta}/recolector-local/worker-programado.log`;
  let despues = 0; let ultima = '(sin registro)';
  if (existsSync(log)) {
    const lineas = readFileSync(log, 'utf8').split(/\r?\n/);
    let idx = -1;
    for (let i = lineas.length - 1; i >= 0; i -= 1) {
      if (/Arrancando o reanudando la ingesta/.test(lineas[i])) { idx = i; break; }
    }
    if (idx >= 0) {
      const posteriores = lineas.slice(idx + 1).filter((l) => l.trim());
      despues = posteriores.length;
      const util = posteriores.filter((l) => /✓|→|Mantenimiento/.test(l));
      ultima = util.length ? util[util.length - 1].replace(/\s+/g, ' ').trim().slice(0, 46)
        : (posteriores.length ? posteriores[posteriores.length - 1].trim().slice(0, 46) : '(nada)');
    }
  }
  console.log(`${nombre.padEnd(20)} ${String(conArchivo).padStart(7)} ${String(aReparar).padStart(11)}   ` +
    `(${String(despues).padStart(3)} líneas) ${ultima}`);
}
