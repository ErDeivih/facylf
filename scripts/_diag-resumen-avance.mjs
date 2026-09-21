#!/usr/bin/env node
/**
 * Resumen compacto del estado de todas las federaciones leyendo sus colas: pendientes, actas hechas,
 * jornadas con archivo, cancelados y sin_datos. Sirve para comparar avance entre dos momentos.
 *
 * Uso: node scripts/_diag-resumen-avance.mjs [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const etiqueta = process.argv[2] ?? '';
console.log(`AVANCE ${etiqueta} · ${new Date().toLocaleString('es-ES')}`);
console.log('federación            pendientes   hechos   cancelados  sin_datos  actas hechas  jornadas con archivo');
let t = { pend: 0, hecho: 0, cancel: 0, sinDatos: 0, actas: 0, jornadas: 0 };
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort().filter((x) => x !== 'descargas-federacion-sondeo')) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const u = (sql) => { try { return db.prepare(sql).get().n ?? 0; } catch { return 0; } };
  const f = {
    pend: u("select count(*) n from trabajos where estado in ('pendiente','en_curso','bloqueado')"),
    hecho: u("select count(*) n from trabajos where estado='hecho'"),
    cancel: u("select count(*) n from trabajos where estado='cancelado'"),
    sinDatos: u("select count(*) n from actas where estado='sin_datos'"),
    actas: u("select count(*) n from actas where estado='hecha'"),
    jornadas: u("select count(*) n from jornadas where archivo is not null"),
  };
  for (const k of Object.keys(t)) t[k] += f[k];
  console.log(`${d.replace('descargas-', '').padEnd(21)} ${String(f.pend).padStart(10)} ${String(f.hecho).padStart(8)} ${String(f.cancel).padStart(11)} ${String(f.sinDatos).padStart(10)} ${String(f.actas).padStart(13)} ${String(f.jornadas).padStart(22)}`);
  db.close();
}
console.log(`${'TOTAL'.padEnd(21)} ${String(t.pend).padStart(10)} ${String(t.hecho).padStart(8)} ${String(t.cancel).padStart(11)} ${String(t.sinDatos).padStart(10)} ${String(t.actas).padStart(13)} ${String(t.jornadas).padStart(22)}`);
