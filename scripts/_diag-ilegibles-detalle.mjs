#!/usr/bin/env node
/**
 * Cruza trabajo y acta para las actas que el parser no entiende: qué dice cada fila, si hay HTML
 * archivado y si el HTML tiene datos o está vacío.
 *
 * Uso: node scripts/_diag-ilegibles-detalle.mjs <federacion>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { leeArchivo, inspeccionaActa } from './lib/recolector-local.mjs';

const fed = process.argv[2] ?? 'euskadi';
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const filas = db.prepare(`select t.temporada, t.competicion, t.grupo, t.jornada, t.acta, t.estado trabajo,
    t.intentos, t.siguiente_intento, t.ultimo_error,
    a.estado acta, a.archivo, a.incidencias, a.version_parser
  from trabajos t left join actas a on a.temporada=t.temporada and a.competicion=t.competicion
    and a.grupo=t.grupo and a.jornada=t.jornada and a.codigo=t.acta
  where t.tipo='acta' and t.estado in ('pendiente','bloqueado')
    and t.ultimo_error like '%no se puede interpretar%'
  order by t.temporada limit 12`).all();
console.log(`actas ilegibles en ${fed}: ${filas.length} (mostrando 12)`);
for (const f of filas) {
  const existe = f.archivo ? existsSync(f.archivo) || existsSync(`${f.archivo}.gz`) : false;
  let inspeccion = null;
  if (existe) {
    const html = leeArchivo(f.archivo)?.toString('utf8') ?? '';
    inspeccion = inspeccionaActa(html);
  }
  console.log(`\nt${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} acta=${f.acta}`);
  console.log(`   trabajo: ${f.trabajo} intentos=${f.intentos} sig=${f.siguiente_intento}`);
  console.log(`   acta: ${f.acta} · archivo=${f.archivo ? (existe ? 'existe' : 'NO EXISTE') : 'sin enlace'} · v${f.version_parser}`);
  console.log(`   incidencias: ${f.incidencias}`);
  if (inspeccion) console.log(`   HTML: jugadores=${inspeccion.jugadores} conNombre=${inspeccion.conNombre} goles=${inspeccion.goles}`);
}
db.close();
