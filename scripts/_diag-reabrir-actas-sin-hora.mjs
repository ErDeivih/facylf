#!/usr/bin/env node
/**
 * Reabre las actas ya guardadas de un partido al que le falta la hora (las que se leyeron antes de
 * que el intérprete capturara el bloque de detalles). Se vuelven a pedir UNA vez: con el código
 * nuevo quedan con fecha exacta, hora y campo.
 *
 * SÓLO Cataluña: es la única federación cuyo intérprete lee ese bloque. En las pnfg la hora y el
 * campo no salen del acta, así que reabrirlas allí sería gastar miles de peticiones para nada (pasó
 * el 12/09/2026: 5.428 trabajos reabiertos de más y hubo que deshacerlo).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const ahora = new Date().toISOString();
const ruta = join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite');
if (existsSync(ruta)) {
  const db = new DatabaseSync(ruta);
  const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, actualizado_en=?
    where tipo='acta' and estado='hecho' and exists (
      select 1 from partidos p where p.codigo_acta = trabajos.acta and p.hora is null)`).run(ahora);
  console.log(`Cataluña: ${r.changes} actas reabiertas para completar hora y campo`);
  db.close();
}

