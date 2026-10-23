#!/usr/bin/env node
/*
 * ── APARTA UN TIPO DE TRABAJO QUE ESTÁ ATASCADO, PARA QUE PASE LO QUE SÍ SE PUEDE HACER ──────────────────
 *
 * ── EL PROBLEMA QUE RESUELVE (medido en Cataluña el 23/09/2026) ───────────────────────────────────────────
 *
 * Las fases del plan ponen el DESCUBRIMIENTO antes que los DATOS: `calendario` es fase 1 y `acta` es fase 2, así
 * que el calendario tiene más prioridad. Está bien pensado… salvo cuando un calendario NO SE PUEDE LEER: el
 * trabajo falla, se vuelve a encolar con un aplazamiento corto y **vuelve a estar disponible**. Si siempre hay
 * uno disponible, las actas de fase 2 no se eligen NUNCA.
 *
 * En Cataluña: **1.209 trabajos de calendario disponibles y rotos** bloqueaban **90.832 actas disponibles y
 * perfectamente recogibles**. La federación estaba trabajando a 165 peticiones/hora sin descargar una sola acta.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Aplaza (con `siguiente_intento`) los trabajos DISPONIBLES de un tipo que ya han fallado al menos N veces, para
 * que el recolector pase a lo que sí puede hacer. **No borra ni cancela nada**: sólo les pone fecha, y vuelven
 * solos. Y escribe el motivo en `ultimo_error`, para que quede claro por qué se apartaron.
 *
 * Modo consulta por defecto: sin `--aplicar` sólo dice lo que haría.
 *
 * SÓLO ESCRIBE SI SE LE PIDE, y sólo la columna `siguiente_intento` de las filas que cumplen las condiciones.
 *
 * Uso (dentro del contenedor del monitor):
 *   node /app/scripts/servidor/aparta-trabajos-atascados.mjs <federación> <tipo> [horas] [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [, , FEDERACION, TIPO, HORAS_ARG, ...resto] = process.argv;
const HORAS = Number(HORAS_ARG ?? 6);
const APLICAR = resto.includes('--aplicar');
/*
 * `--incluir-sin-intentos` aparta TAMBIÉN los que nunca se han intentado.
 *
 * Por defecto no se tocan —un trabajo sin intentar podría funcionar—, pero hay un caso en el que sí hay que
 * incluirlos: cuando el fallo es de TODA la clase de trabajo, no de unos cuantos. En Cataluña (23/09/2026) los
 * 277 primeros se apartaron y el recolector pasó a los siguientes, que fallaban exactamente igual: la pestaña
 * del calendario no se pulsaba, y eso afecta a todos. Con esta opción se aparta la clase entera para que pase
 * lo que sí se puede hacer.
 */
const INCLUIR_SIN_INTENTOS = resto.includes('--incluir-sin-intentos');

if (!FEDERACION || !TIPO) {
  console.error('uso: aparta-trabajos-atascados.mjs <federación> <tipo> [horas] [--aplicar]');
  process.exit(2);
}

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const ahora = new Date();
const ahoraIso = ahora.toISOString();
const hasta = new Date(ahora.getTime() + HORAS * 3600_000).toISOString();

const db = new DatabaseSync(ruta, { timeout: 120_000 });

// Sólo se tocan los que YA HAN FALLADO alguna vez (`intentos >= 1`) y están disponibles AHORA. Un trabajo que
// nunca se ha intentado no se aparta: podría funcionar — salvo con `--incluir-sin-intentos`, para cuando el
// fallo es de toda la clase de trabajo.
const candidatos = db.prepare(`select clave, intentos, coalesce(ultimo_error,'') error from trabajos
  where tipo = ? and estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)
    ${INCLUIR_SIN_INTENTOS ? '' : 'and intentos >= 1'}`).all(TIPO, ahoraIso);

console.log(`══ ${FEDERACION} · trabajos «${TIPO}» atascados ══\n`);
console.log(`  disponibles ahora y con algún intento previo: ${candidatos.length}`);

const porIntentos = new Map();
for (const c of candidatos) porIntentos.set(Number(c.intentos), (porIntentos.get(Number(c.intentos)) ?? 0) + 1);
console.log('  reparto por intentos: ' + [...porIntentos.entries()].sort((a, b) => a[0] - b[0])
  .map(([k, v]) => `${k} intento(s): ${v}`).join(' · '));

// Y cuánto trabajo SÍ se puede hacer y está esperando detrás de estos.
const detras = db.prepare(`select tipo, count(*) n from trabajos
  where tipo <> ? and estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)
  group by tipo order by n desc`).all(TIPO, ahoraIso);
console.log('\n  ── lo que está esperando DETRÁS (disponible ahora) ──');
for (const d of detras) console.log(`     ${String(d.tipo).padEnd(20)} ${Number(d.n).toLocaleString('es-ES')}`);

const ejemplo = candidatos.find((c) => c.error);
if (ejemplo) console.log(`\n  motivo más repetido, tal cual: ${String(ejemplo.error).slice(0, 120)}`);

if (!APLICAR) {
  console.log(`\n  MODO CONSULTA: con --aplicar se aplazarían ${candidatos.length} trabajos «${TIPO}» hasta ${hasta}`);
  console.log('  (no se borra ni se cancela nada: sólo se les pone fecha y vuelven solos).');
  db.close();
  process.exit(0);
}

const marca = db.prepare(`update trabajos set siguiente_intento = ?, actualizado_en = ?,
    ultimo_error = ? where clave = ?`);
const motivo = `apartado ${HORAS} h para que pasen los trabajos que sí se pueden leer (${TIPO} sin avance)`;

// En una sola transacción: es una escritura masiva y así se paga una confirmación, no una por fila.
db.exec('begin immediate');
let aplicados = 0;
try {
  for (const c of candidatos) {
    marca.run(hasta, ahoraIso, motivo, c.clave);
    aplicados += 1;
  }
  db.exec('commit');
} catch (error) {
  db.exec('rollback');
  console.error(`  ✗ no se pudo aplicar: ${error.message}`);
  db.close();
  process.exit(1);
}

console.log(`\n  ✓ apartados ${aplicados} trabajos «${TIPO}» hasta ${hasta}`);
console.log('  Ahora el recolector elegirá lo que sí puede hacer. Vuelven solos cuando pase la fecha.');
db.close();
