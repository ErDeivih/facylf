#!/usr/bin/env node
/** SÓLO LECTURA: ¿sigue intacta la cola real y qué aspecto tiene la copia tras aplicar? */
import { createRequire } from 'node:module';
const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const MARCADOR = "local like '%(Sailkatua)%' or visitante like '%(Sailkatua)%'"
  + " or local like '%(Irabazlea)%' or visitante like '%(Irabazlea)%'"
  + " or local like '%(Ganador)%' or visitante like '%(Ganador)%'"
  + " or local like '%(Clasificado)%' or visitante like '%(Clasificado)%'";

for (const [etiqueta, ruta] of [
  ['COLA REAL  ', 'descargas-euskadi/recolector-local/cola-v2.sqlite'],
  ['COPIA      ', 'pruebas/reconstruccion/ciclo/descargas-euskadi/recolector-local/cola-v2.sqlite'],
]) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const partidos = db.prepare('select count(*) n from partidos').get().n;
  const conMarcador = db.prepare(`select count(*) n from partidos where ${MARCADOR}`).get().n;
  const conCodigo = db.prepare('select count(*) n from partidos where equipo_local_codigo is not null or equipo_visitante_codigo is not null').get().n;
  db.close();
  console.log(`${etiqueta} partidos=${partidos} · sin código en ningún lado=${partidos - conCodigo} · con marcador de estado=${conMarcador}`);
}
