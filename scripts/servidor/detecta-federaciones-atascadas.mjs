#!/usr/bin/env node
/*
 * ── ¿QUÉ FEDERACIONES TIENEN DATOS ESPERANDO DETRÁS DEL DESCUBRIMIENTO? ──────────────────────────────────
 *
 * Las fases del plan ponen el DESCUBRIMIENTO antes que los DATOS: `catalogo_temporada`, `grupos`,
 * `indice_jornadas`, `calendario` y `clasificacion` son fase 1, y `jornada` y `acta` son fase 2. Está bien
 * pensado —primero la estructura y luego el contenido— salvo en un caso: **cuando el descubrimiento no puede
 * avanzar**. Un calendario de una competición que aún no se ha publicado no es un fallo: es una espera. Pero
 * mientras sigue disponible, se elige una y otra vez, y las actas de fase 2 no llegan a pedirse NUNCA.
 *
 * Medido en Cataluña el 23/09/2026: 180 calendarios fallando por hora y **90.832 actas disponibles sin
 * descargar**, con la federación gastando todas sus peticiones en calendarios que no podía leer. La causa era
 * una pestaña sin pulsar, pero el EFECTO —datos parados detrás del descubrimiento— puede repetirse en cualquier
 * federación por cualquier motivo.
 *
 * Esto lo busca: por federación, cuántas actas hay DISPONIBLES y cuánto descubrimiento sigue disponible
 * delante de ellas. Si las dos cifras son grandes, esa federación está atascada y se arregla apartando el
 * descubrimiento con `aparta-trabajos-atascados.mjs`.
 *
 * SÓLO LEE.
 *
 * Uso: docker exec facylf-monitor node /app/scripts/servidor/detecta-federaciones-atascadas.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';

/** Las fases, copiadas del planificador: lo de fase 1 va antes que lo de fase 2. */
const FASE = {
  catalogo_temporada: 1, grupos: 1, muestra_competicion: 1, indice_jornadas: 1,
  muestra_jornadas: 1, calendario: 1, muestra_calendario: 1, clasificacion: 1,
  jornada: 2, acta: 2,
};

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

/*
 * ── OJO CON EL CRITERIO: NO BASTA CON QUE HAYA DESCUBRIMIENTO DELANTE ────────────────────────────────────
 *
 * La primera versión de este detector marcaba «atascada» a toda federación que tuviera actas disponibles Y
 * trabajos de fase 1 disponibles. **Y era un falso positivo casi siempre**: medido el 23/09/2026, Andalucía,
 * Valencia, Asturias y Galicia tienen descubrimiento pendiente y a la vez descargan 255-660 actas por hora. Que
 * haya trabajo de descubrimiento por delante es NORMAL: forma parte del plan y avanza.
 *
 * Lo que de verdad indica atasco es otra cosa: que las actas NO avancen Y que el descubrimiento esté FALLANDO.
 * Porque entonces el trabajo roto se elige una y otra vez, y las actas que sí se pueden descargar no llegan a
 * pedirse. Es exactamente lo que pasaba en Cataluña: 180 calendarios fallando por hora y **cero actas**.
 *
 * Así que el veredicto mira TRES cosas: cuántas actas hay esperando, cuánto descubrimiento hay delante y si ese
 * descubrimiento avanza o se atasca.
 */
const desde = new Date(Date.now() - 3600_000).toISOString();
const ahora = new Date().toISOString();
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

console.log('  federación            actas AHORA   descub. delante   actas ok/h   descub. FALLA/h   veredicto');
console.log('                                    (fase 1, disponible)');

const atascadas = [];
for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
    const filas = db.prepare(`select tipo, count(*) n from trabajos
      where estado in ('pendiente','bloqueado')
        and (siguiente_intento is null or siguiente_intento <= ?)
      group by tipo`).all(ahora);
    // Y lo que ha pasado DE VERDAD en la última hora: es lo que distingue avanzar de atascarse.
    //
    // OJO: la tabla `peticiones` NO tiene columna `tipo`. El tipo va en el prefijo de la clave del trabajo
    // (`acta|22|...`, `calendario|22|...`), así que hay que sacarlo de ahí. La primera versión de esto pedía
    // `tipo` y reventaba con «no such column: tipo» en todas las federaciones.
    const recientes = db.prepare(`select substr(coalesce(trabajo,'x'), 1,
        max(instr(coalesce(trabajo,'x') || '|', '|') - 1, 0)) tipo, resultado, count(*) n
      from peticiones where iniciada_en >= ? group by tipo, resultado`).all(desde);
    db.close();

    const porTipo = Object.fromEntries(filas.map((f) => [String(f.tipo), Number(f.n)]));
    const actas = porTipo.acta ?? 0;
    const descubrimiento = Object.entries(porTipo)
      .filter(([tipo]) => FASE[tipo] === 1)
      .reduce((a, [, v]) => a + v, 0);
    const fichas = porTipo.jornada ?? 0;

    const actasOk = recientes.filter((f) => String(f.tipo) === 'acta' && String(f.resultado) === 'ok')
      .reduce((a, f) => a + Number(f.n), 0);
    const descubrimientoFalla = recientes
      .filter((f) => FASE[String(f.tipo)] === 1 && String(f.resultado) !== 'ok')
      .reduce((a, f) => a + Number(f.n), 0);

    let veredicto = '—';
    if (actas >= 500 && actasOk === 0 && descubrimientoFalla >= 20) {
      veredicto = '⚠ ATASCADA: el descubrimiento falla y tapa los datos';
      atascadas.push({ federacion, actas, descubrimiento, actasOk, descubrimientoFalla });
    } else if (actas >= 500 && actasOk > 0) {
      veredicto = `avanza (${n(actasOk)} actas/h)`;
    } else if (actas < 500) {
      veredicto = 'sin actas pendientes';
    } else {
      veredicto = 'sin peticiones de acta en la última hora';
    }

    console.log(`  ${federacion.padEnd(20)} ${n(actas).padStart(11)}   ${n(descubrimiento).padStart(18)}   `
      + `${n(actasOk).padStart(10)}   ${n(descubrimientoFalla).padStart(15)}   ${veredicto}`
      + (fichas >= 500 && actasOk > 0 ? `   (+${n(fichas)} fichas de jornada)` : ''));
  } catch (error) {
    console.log(`  ${federacion.padEnd(20)} no se pudo leer: ${String(error.message).slice(0, 40)}`);
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log(`\n  federaciones atascadas de verdad: ${atascadas.length}`);
for (const a of atascadas) {
  console.log(`    · ${a.federacion}: ${n(a.actas)} actas disponibles, CERO descargadas en la última hora, `
    + `y ${n(a.descubrimientoFalla)} fallos de descubrimiento en esa misma hora`);
}
console.log('\n  Para desatascar una, se le da fecha a su descubrimiento y vuelve solo:');
console.log('    node /app/scripts/servidor/aparta-trabajos-atascados.mjs <fed> calendario 12 --incluir-sin-intentos --aplicar');
console.log('    node /app/scripts/servidor/aparta-trabajos-atascados.mjs <fed> clasificacion 12 --incluir-sin-intentos --aplicar');
