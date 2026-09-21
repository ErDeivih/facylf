#!/usr/bin/env node
/**
 * Aplaza el trabajo pendiente de temporadas anteriores a 2023-24 en las colas federativas.
 *
 * El suelo de temporadas ya impide coger esos trabajos (`siguienteTrabajo` los excluye y `encola` no
 * crea nuevos), pero siguen contando como pendientes y ensucian el avance que enseña el visor. Este
 * script los deja «aplazados» —no cancelados y no borrados— para que el histórico se pueda retomar
 * tal cual el día que toque.
 *
 *   node scripts/aplazar-temporadas-viejas.mjs              # informe, no toca nada
 *   node scripts/aplazar-temporadas-viejas.mjs --aplicar    # aplaza
 *   node scripts/aplazar-temporadas-viejas.mjs --revertir   # los devuelve a la cola
 *
 * Sólo lectura mientras no se pase `--aplicar`: los recolectores pueden seguir trabajando.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  TEMPORADA_MINIMA, aplazaTemporadasViejas, reactivaTemporadasViejas,
} from './lib/temporada-minima.mjs';

const aplicar = process.argv.includes('--aplicar');
const revertir = process.argv.includes('--revertir');
const RAIZ = process.cwd();

let totalViejos = 0;
let totalAplazados = 0;
let totalRecientes = 0;

for (const carpeta of readdirSync(RAIZ).filter((n) => n.startsWith('descargas-') && !n.includes('sondeo'))) {
  const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta);
  try {
    // Los recolectores están escribiendo en estas mismas colas: si una escritura coincide, se espera
    // en vez de fallar.
    db.exec('pragma busy_timeout = 15000');
    const vivos = `estado in ('pendiente','bloqueado','en_curso')`;
    const viejos = Number(db.prepare(`select count(*) n from trabajos t join temporadas s on s.codigo=t.temporada
      where s.etiqueta < ? and ${vivos.replace(/estado/g, 't.estado')}`).get(TEMPORADA_MINIMA).n);
    const recientes = Number(db.prepare(`select count(*) n from trabajos t join temporadas s on s.codigo=t.temporada
      where s.etiqueta >= ? and ${vivos.replace(/estado/g, 't.estado')}`).get(TEMPORADA_MINIMA).n);
    const aplazados = Number(db.prepare(`select count(*) n from trabajos t join temporadas s on s.codigo=t.temporada
      where s.etiqueta < ? and t.estado='pendiente' and t.siguiente_intento > '2090'`).get(TEMPORADA_MINIMA).n);
    totalViejos += viejos;
    totalRecientes += recientes;

    let cambios = 0;
    if (aplicar) cambios = aplazaTemporadasViejas(db);
    if (revertir) cambios = reactivaTemporadasViejas(db);
    totalAplazados += cambios;

    const accion = aplicar ? `aplazados ${cambios}` : revertir ? `devueltos ${cambios}` : `ya aplazados ${aplazados}`;
    console.log(`${carpeta.replace('descargas-', '').padEnd(20)} vivos anteriores a ${TEMPORADA_MINIMA}: ${String(viejos).padStart(7)} · `
      + `en la ventana de trabajo: ${String(recientes).padStart(7)} · ${accion}`);
  } finally {
    db.close();
  }
}

console.log(`\ntotal: ${totalViejos.toLocaleString('es-ES')} trabajos vivos de temporadas anteriores a ${TEMPORADA_MINIMA} · `
  + `${totalRecientes.toLocaleString('es-ES')} dentro de la ventana`);
if (aplicar) console.log(`aplazados ${totalAplazados.toLocaleString('es-ES')} (se pueden devolver con --revertir)`);
else if (revertir) console.log(`devueltos ${totalAplazados.toLocaleString('es-ES')} a la cola`);
else console.log('informe solamente: añade --aplicar para apartarlos sin borrarlos');
