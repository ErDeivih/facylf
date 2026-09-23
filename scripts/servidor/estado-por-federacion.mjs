#!/usr/bin/env node
/*
 * ── LA FOTO DE CADA FEDERACIÓN: qué queda, de qué tipo y cuánto tardará ──────────────────────────────────
 *
 * Responde a las preguntas que de verdad se hacen sobre la recolección y que `colas.json` no contesta, porque
 * sólo da totales:
 *
 *   · **¿cuántas actas quedan?** — desglosadas por estado: hechas, pendientes, sin datos en la fuente, ausentes
 *     (`ausente_web`) y fuera de ámbito. Un total de «pendientes» mezcla actas con jornadas, grupos y
 *     clasificaciones, y no sirve para estimar nada;
 *   · **¿de qué temporadas hay trabajo?** — por etiqueta (`2023-24`, `2025-26`…), que es lo que dice hasta qué
 *     año se está recogiendo de verdad;
 *   · **¿queda algo por hacer o está aplazado?** — disponibles AHORA frente a aplazados a una fecha futura;
 *   · **¿cuánto tardará?** — con el ritmo REAL de esa federación (peticiones de acta en la última hora), que es
 *     lo único que permite estimar.
 *
 * Es de SÓLO LECTURA sobre la cola.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app -v /srv/ssd/facylf:/srv/ssd/facylf \
 *     --entrypoint node facylf-recolectores:local /app/scripts/servidor/estado-por-federacion.mjs [federación…]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';

const pedidas = process.argv.slice(2);
const federaciones = pedidas.length
  ? pedidas
  : readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
    .map((n) => n.replace('descargas-', ''))
    .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
    .sort();

const hora = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-ES'));

console.log('  federación            actas:  total   hechas    pend   s/datos  ausente   ámbito');
console.log('                               jornadas pend · grupos pend · otras · DISPONIBLES · aplazados');

const resumen = [];
const temporadasGlobal = new Map();

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
    const uno = (sql, ...p) => Object.values(db.prepare(sql).get(...p) ?? {})[0] ?? 0;

    const actas = db.prepare('select estado, count(*) n from actas group by estado').all();
    const porEstado = Object.fromEntries(actas.map((a) => [String(a.estado), Number(a.n)]));
    const totalActas = Object.values(porEstado).reduce((a, b) => a + b, 0);

    /*
     * ── OJO CON LA COMPARACIÓN DE FECHAS ─────────────────────────────────────────────────────────────────
     *
     * `siguiente_intento` se guarda como ISO con `T` y `Z` (`2026-09-27T06:00:00.000Z`), y el recolector lo
     * compara así: `siguiente_intento <= ahoraIso()`. Hay que usar EL MISMO formato, no `datetime('now')`, que
     * devuelve `2026-09-23 17:30:00`: al comparar como texto, en la posición 11 una `T` es mayor que un espacio,
     * así que un trabajo aplazado al MISMO día salía siempre como «no disponible». La primera versión de esta
     * herramienta lo hacía mal y contaba de menos los disponibles.
     */
    /*
     * ── EL SUELO DE TEMPORADA NO ES UN DETALLE PARA ESTIMAR ──────────────────────────────────────────────
     *
     * El recolector NO recoge temporadas por debajo de `TEMPORADA_MINIMA` (hoy `2023-24`): `siguienteTrabajo` las
     * excluye con `sqlExcluyeTemporadasViejas`. Pero siguen en la tabla `trabajos` como pendientes, así que
     * contarlas infla el trabajo que queda y dispara la estimación: hay federaciones con trabajo de 2008-09
     * aplazado que no se va a recoger nunca mientras el suelo esté ahí.
     *
     * Por eso se cuentan DOS cosas: lo que queda DENTRO del alcance (que es lo que da la estimación buena) y lo
     * que queda fuera (histórico, sólo informativo).
     */
    const MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2023-24';
    const dentroDelAlcance = `(trabajos.temporada is null or trabajos.temporada not in
      (select codigo from temporadas where etiqueta < ?))`;

    const ahoraIso = new Date().toISOString();
    const trabajos = db.prepare(`select tipo, count(*) n,
        sum(case when estado in ('pendiente','bloqueado') then 1 else 0 end) pend,
        sum(case when estado in ('pendiente','bloqueado') and ${dentroDelAlcance} then 1 else 0 end) pendAlcance,
        sum(case when estado in ('pendiente','bloqueado') and ${dentroDelAlcance}
          and (siguiente_intento is null or siguiente_intento <= ?) then 1 else 0 end) disp
      from trabajos group by tipo`).all(MINIMA, ahoraIso);
    const t = Object.fromEntries(trabajos.map((x) => [String(x.tipo), x]));

    const disponibles = trabajos.reduce((a, x) => a + Number(x.disp), 0);
    const pendientes = trabajos.reduce((a, x) => a + Number(x.pend), 0);
    const pendientesAlcance = trabajos.reduce((a, x) => a + Number(x.pendAlcance), 0);
    // Y cuándo vuelve a haber trabajo: es lo que distingue «terminada» de «esperando a que publiquen».
    const proximo = db.prepare(`select min(siguiente_intento) t from trabajos
      where estado in ('pendiente','bloqueado') and siguiente_intento > ?`).get(ahoraIso)?.t ?? null;

    // Las actas pendientes, separando las que están dentro del alcance de las históricas.
    const actasAlcance = db.prepare(`select
        sum(case when a.estado in ('pendiente','bloqueado') then 1 else 0 end) todas,
        sum(case when a.estado in ('pendiente','bloqueado') and
          (a.temporada is null or a.temporada not in (select codigo from temporadas where etiqueta < ?))
          then 1 else 0 end) alcance
      from actas a`).get(MINIMA) ?? { todas: 0, alcance: 0 };

    // Ritmo REAL de actas en la última hora: es lo que permite estimar.
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const actasUltimaHora = uno(`select count(*) n from peticiones
      where iniciada_en >= ? and trabajo like 'acta|%' and resultado = 'ok'`, desde);

    // Temporadas que tienen trabajo pendiente, por etiqueta.
    const temps = db.prepare(`select coalesce(t.etiqueta, w.temporada) etiqueta, count(*) n
      from trabajos w left join temporadas t on t.codigo = w.temporada
      where w.estado in ('pendiente','bloqueado') group by etiqueta order by etiqueta`).all();
    for (const x of temps) {
      const clave = String(x.etiqueta ?? '(sin etiqueta)');
      if (!temporadasGlobal.has(clave)) temporadasGlobal.set(clave, 0);
      temporadasGlobal.set(clave, temporadasGlobal.get(clave) + Number(x.n));
    }

    /*
     * ── ¿DE QUÉ TEMPORADAS HAY DATOS? ────────────────────────────────────────────────────────────────────
     *
     * Se cuenta por temporada lo que HAY (actas hechas), no lo que falta: así se ve de un vistazo si una
     * federación tiene la temporada en curso empezada o no la ha tocado todavía. La etiqueta (`2025-26`) es la
     * que sirve: el código numérico de temporada NO es comparable entre federaciones (en La Rioja el 9 es
     * 2013-14 y en Andalucía el 19 es 2023-24).
     */
    const porTemporada = db.prepare(`select coalesce(t.etiqueta, a.temporada) etiqueta,
        count(*) n, sum(case when a.estado='hecha' then 1 else 0 end) hechas
      from actas a left join temporadas t on t.codigo = a.temporada
      group by etiqueta having n > 0 order by etiqueta`).all();

    const pendActas = Number(t.acta?.pendAlcance ?? 0);
    const actasFueraDeAlcance = Number(t.acta?.pend ?? 0) - pendActas;
    const eta = actasUltimaHora > 0 ? pendActas / actasUltimaHora : null;

    resumen.push({
      federacion, totalActas, porEstado, pendActas, disponibles, pendientes, pendientesAlcance,
      actasHora: actasUltimaHora, eta, temps, porTemporada, actasFueraDeAlcance,
      jornadasPend: Number(t.jornada?.pendAlcance ?? 0),
      gruposPend: Number(t.grupos?.pendAlcance ?? 0),
      otrasPend: pendientesAlcance - pendActas - Number(t.jornada?.pendAlcance ?? 0)
        - Number(t.grupos?.pendAlcance ?? 0),
    });

    // Temporadas con datos: se enseñan en una línea corta, «2023-24:1204/5210» = hechas/total.
    const lineaTemps = porTemporada
      .map((x) => `${x.etiqueta}:${Number(x.hechas)}/${Number(x.n)}`)
      .join(' ');

    console.log(`  ${federacion.padEnd(20)} ${hora(totalActas).padStart(7)} ${hora(porEstado.hecha ?? 0).padStart(8)} `
      + `${hora(porEstado.pendiente ?? 0).padStart(7)} ${hora(porEstado.sin_datos ?? 0).padStart(9)} `
      + `${hora(porEstado.ausente_web ?? 0).padStart(8)} ${hora(porEstado.pendiente_ambito ?? 0).padStart(8)}`);
    console.log(`      ${' '.repeat(20)} ${hora(resumen.at(-1).jornadasPend).padStart(7)} jorn · `
      + `${hora(resumen.at(-1).gruposPend).padStart(6)} grup · ${hora(resumen.at(-1).otrasPend).padStart(6)} otras · `
      + `${hora(disponibles).padStart(7)} disponibles · ${hora(pendientes - disponibles).padStart(6)} aplazados · `
      + `${hora(actasUltimaHora).padStart(5)} actas/h · ETA ${eta === null ? '—' : `${(eta / 24).toFixed(1)} días`}`);
    console.log(`      ${' '.repeat(20)} temporadas (hechas/total): ${lineaTemps || '(ninguna)'}`);
    if (disponibles === 0 && proximo) {
      console.log(`      ${' '.repeat(20)} sin nada disponible AHORA; el próximo trabajo vuelve el ${proximo}`);
    }
    if (actasFueraDeAlcance > 0) {
      console.log(`      ${' '.repeat(20)} (+${hora(actasFueraDeAlcance)} actas de temporadas anteriores al suelo `
        + `de ${MINIMA}, que NO se recogen mientras el suelo esté ahí)`);
    }
    db.close();
  } catch (error) {
    console.log(`  ${federacion.padEnd(20)} no se pudo leer: ${String(error.message).slice(0, 50)}`);
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log('\n  ── TOTAL DE LA FLOTA (sólo lo que está DENTRO del alcance) ──');
const suma = (campo) => resumen.reduce((a, r) => a + r[campo], 0);
const totalPendActas = suma('pendActas');
const totalActasHora = suma('actasHora');
const dias = totalActasHora > 0 ? totalPendActas / totalActasHora / 24 : null;
const sinDatos = resumen.reduce((a, r) => a + (r.porEstado.sin_datos ?? 0), 0);
const ausentes = resumen.reduce((a, r) => a + (r.porEstado.ausente_web ?? 0), 0);

console.log(`     actas hechas:            ${hora(suma('totalActas') - totalPendActas - sinDatos - ausentes - suma('actasFueraDeAlcance'))}`);
console.log(`     actas PENDIENTES:        ${hora(totalPendActas)}   ← esto es lo que queda por descargar`);
console.log(`     actas sin datos:         ${hora(sinDatos)}  (la fuente publica la ficha pero sin contenido)`);
console.log(`     actas ausentes:          ${hora(ausentes)}  (la fuente ya no las publica: están contadas y cerradas)`);
console.log(`     temporadas anteriores:   ${hora(suma('actasFueraDeAlcance'))} actas pendientes por debajo del suelo`);
console.log(`     ritmo de actas:          ${hora(totalActasHora)} actas/hora`);
console.log(`     ETA de las actas:        ${dias === null ? '—' : `${dias.toFixed(1)} días`} de recolección continua`);

console.log('\n  ── TRABAJO PENDIENTE POR TEMPORADA (etiqueta) ──');
for (const [etiqueta, n] of [...temporadasGlobal.entries()].sort()) {
  console.log(`     ${etiqueta.padEnd(12)} ${hora(n).padStart(9)} trabajos pendientes`);
}
