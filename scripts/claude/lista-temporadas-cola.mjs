#!/usr/bin/env node
/* lista-temporadas-cola.mjs — SÓLO LEE. Las temporadas de una cola que tienen al menos un acta hecha, una por línea
 * (de la más reciente a la más antigua). Lo usa trae-federacion-servidor.ps1 para saber qué traer.
 * Uso: node lista-temporadas-cola.mjs <cola-v2.sqlite> */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true, timeout: 60000 });
for (const r of db.prepare(`select t.etiqueta e from temporadas t where exists (select 1 from actas a where a.temporada=t.codigo
  and a.estado='hecha') order by t.etiqueta desc`).all()) console.log(r.e);
db.close();
