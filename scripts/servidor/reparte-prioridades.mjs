#!/usr/bin/env node
/*
 * ── REPARTO DE PRIORIDADES ENTRE LO DE HOY Y EL HISTÓRICO ────────────────────────────────────────────────
 *
 * Diseño de Codex (22/11/2026). El problema que arregla: el histórico y la temporada en curso tenían la
 * misma prioridad, así que las 29.141 jornadas históricas iban por delante de los 537 partidos del domingo.
 * Resultado: a las 11:35 solo 6 partidos tenían hora, y sin hora no se puede cumplir la regla de pedir el
 * acta 3 horas después del comienzo.
 *
 * Bandas (menor = antes se procesa):
 *   -1.650.000.000  descubrimiento de las jornadas próximas
 *   -1.600.000.000  horarios próximos (leer o refrescar)
 *   -1.550.000.000  actas de partidos ya jugados
 *   -1.400.000.000  mantenimiento sin plazo
 *                0  histórico: solo cuando no queda trabajo actual
 *
 * Se ejecuta sobre las tres colas. Es idempotente: se puede lanzar siempre que haga falta.
 */
import { DatabaseSync } from 'node:sqlite';

const BANDA_DESCUBRIR = -1650000000;
const BANDA_HORARIOS = -1600000000;
const BANDA_ACTAS = -1550000000;
const BANDA_MANTENIMIENTO = -1400000000;

const colas = process.argv.slice(2);
if (colas.length === 0) {
  console.error('uso: reparte-prioridades.mjs <ruta-cola> [...]');
  process.exit(1);
}

const hoy = new Date().toISOString().slice(0, 10);
const limite = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);

for (const ruta of colas) {
  const db = new DatabaseSync(`${ruta}/recolector-local/cola-v2.sqlite`, { timeout: 20000 });
  const actual = db.prepare(`select codigo from temporadas where etiqueta = '2026-27'`).get()?.codigo;

  // Jornadas con partidos entre hoy y dentro de 10 días: su horario manda sobre todo lo demás.
  const proximas = db.prepare(`
    select distinct temporada, competicion, grupo, jornada
      from partidos where fecha >= ? and fecha <= ?
  `).all(hoy, limite);

  let horarios = 0;
  let actas = 0;
  let historico = 0;
  const upJornada = db.prepare(`update trabajos set prioridad = ? where tipo = 'jornada' and estado = 'pendiente'
      and temporada = ? and competicion = ? and grupo = ? and jornada = ?`);
  db.exec('begin immediate');
  // 1) Todo el trabajo pendiente al fondo.
  historico += db.prepare(`update trabajos set prioridad = 0 where estado = 'pendiente'`).run().changes;
  // 2) Las jornadas de los próximos diez días, arriba.
  for (const j of proximas) {
    horarios += upJornada.run(BANDA_HORARIOS, j.temporada, j.competicion, String(j.grupo), String(j.jornada)).changes;
  }
  // 3) Las actas de esta temporada, por encima del histórico pero por debajo de los horarios.
  actas += db.prepare(`update trabajos set prioridad = ? where tipo = 'acta' and estado = 'pendiente' and temporada = ?`)
    .run(BANDA_ACTAS, actual).changes;
  // 4) El descubrimiento que hace falta para localizar esas jornadas.
  db.prepare(`update trabajos set prioridad = ? where estado = 'pendiente' and tipo in ('indice_jornadas','grupos','catalogo_temporada') and temporada = ?`)
    .run(BANDA_DESCUBRIR, actual);
  db.exec('commit');
  console.log(`${ruta}: ${horarios} horarios · ${actas} actas · ${historico} al fondo`);
  db.close();
}
