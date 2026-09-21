/*
 * Repara las 22 líneas con marcas de reemplazo (U+FFFD) que dejó un ciclo de «leer y escribir» en
 * `scripts/recolector-local.mjs` (PowerShell 5.1 lee UTF-8 sin BOM como ANSI; el detalle está en
 * docs/plataforma-web/RECOLECCION-10GB.md). Un U+FFFD es IRRECUPERABLE: el byte original ya no está, así que
 * esto no es una conversión de codificación sino una RECONSTRUCCIÓN del carácter que había, hecha con dos
 * criterios:
 *
 *   1. los mismos mensajes, con su glifo, existen intactos en `recolector-valencia.mjs` (salido del mismo
 *      tronco de código): de ahí salen `…`, `ℹ️`, `◷`, `⛔` y `✗`;
 *   2. el resto se reconstruye por el VOCABULARIO del propio fichero y por los registros de producción
 *      (los mensajes `→ clave` y `  ✓ detalle` están impresos tal cual en los registros de las colas), con
 *      los mismos glifos que ya usa el código: `→` trabajo, `✓` hecho, `↻` se recrea la sesión, `⚠️` aviso,
 *      `—` raya, `─` en las reglas de los comentarios.
 *
 * OJO con la forma del destrozo: cada carácter se convirtió en `U+FFFD` más un `?`, un `\` y una comilla (o
 * una combinación parecida). Escribir el patrón «a ojo» con `?"` no casa: el `\` intermedio es un carácter
 * más del fichero. Los patrones de abajo están copiados de la lectura real, uno por uno.
 *
 * Cada sustitución se comprueba contra su número de apariciones esperado en SU línea; si alguna no cuadra,
 * no se escribe nada y se informa. Uso: node scripts/_repara-marcas-recolector-local.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = new URL('./recolector-local.mjs', import.meta.url);
const F = '\uFFFD';

const arreglos = [
  // ── reglas y rayas de los comentarios ──────────────────────────────────────────────────────────────
  { linea: 113, busca: `${F}"?`, pon: '─', todas: true, motivo: 'regla del comentario (como la de la línea 1600)' },
  { linea: 219, busca: `${F}?"`, pon: '—', motivo: 'raya en la prosa' },
  { linea: 359, busca: `${F}?"`, pon: '—', motivo: 'raya entre las dos horas' },
  { linea: 1780, busca: `${F}?"`, pon: '—', motivo: 'raya en la prosa' },
  { linea: 1781, busca: `${F}?"`, pon: '—', motivo: 'raya en la prosa' },
  { linea: 1798, busca: `${F}?"`, pon: '—', motivo: 'raya en la prosa' },
  { linea: 1799, busca: `${F}?"`, pon: '—', motivo: 'raya en la prosa' },
  { linea: 1894, busca: `${F}?"`, pon: '—', todas: true, motivo: 'dos rayas en el comentario' },
  { linea: 1791, busca: `${F}"`, pon: 'Ó', motivo: 'FEDERACIÓN' },
  // ── glifos confirmados en recolector-valencia.mjs ──────────────────────────────────────────────────
  { linea: 370, busca: `${F}?${F}`, pon: '…', motivo: 'igual que Valencia: «… pausa respetuosa»' },
  { linea: 426, busca: `${F}"${F}️`, pon: 'ℹ️', motivo: 'igual que Valencia: «ℹ️ Proyecto personal/no comercial»' },
  { linea: 1682, busca: `${F}-${F}`, pon: '◷', motivo: 'igual que Valencia: «◷ Aún no publicado»' },
  { linea: 1760, busca: `${F}>"`, pon: '⛔', motivo: 'igual que Valencia: «⛔ ... Pausa global preventiva»' },
  { linea: 1774, busca: `${F}o-`, pon: '✗', motivo: 'igual que Valencia: «✗ ... Se descarta tras N intentos»' },
  // ── glifos reconstruidos por el vocabulario y por los registros de producción ──────────────────────
  { linea: 445, busca: `${F}?'`, pon: '→', todas: true, motivo: 'cadena de pasos: catálogo → grupos → jornadas → actas' },
  { linea: 500, busca: `${F}?'`, pon: '→', todas: true, motivo: 'orden de prioridades: recientes → regional/nacional → ...' },
  { linea: 1622, busca: `${F}?'`, pon: '→', motivo: 'los registros de las colas imprimen «→ acta|21|...»' },
  { linea: 1626, busca: `${F}o"`, pon: '✓', motivo: 'los registros imprimen «  ✓ <detalle>»' },
  { linea: 1690, busca: `${F}?${F}`, pon: '↻', motivo: 'se recrea la sesión (mismo caso que usa ↻ en Cataluña)' },
  { linea: 1731, busca: `${F}"${F}️`, pon: 'ℹ️', motivo: 'mismo dibujo que el aviso informativo de la línea 426' },
  { linea: 1737, busca: `${F}s${F}️`, pon: '⚠️', motivo: 'aviso: la ficha va sin datos y queda archivada' },
  { linea: 1748, busca: `${F}Y"'`, pon: '◷', motivo: 'se reintenta el <fecha> (mismo glifo que el resto de aplazamientos)' },
];

const original = readFileSync(RUTA, 'utf8');
const lineas = original.split('\n');
const informe = [];
let fallos = 0;

for (const a of arreglos) {
  const i = a.linea - 1;
  const texto = lineas[i];
  if (texto === undefined) { informe.push(`✗ línea ${a.linea}: no existe`); fallos++; continue; }
  const trozos = texto.split(a.busca);
  const encontrados = trozos.length - 1;
  if (encontrados === 0) { informe.push(`✗ línea ${a.linea}: no aparece ${JSON.stringify(a.busca)}`); fallos++; continue; }
  if (!a.todas && encontrados !== 1) {
    informe.push(`✗ línea ${a.linea}: ${JSON.stringify(a.busca)} aparece ${encontrados} veces (se esperaba 1)`); fallos++; continue;
  }
  const antes = texto;
  lineas[i] = trozos.join(a.pon);
  informe.push(`✓ línea ${String(a.linea).padStart(4)}  ${encontrados}×  → ${JSON.stringify(a.pon)}  (${a.motivo})`);
  informe.push(`      antes: ${JSON.stringify(antes)}`);
  informe.push(`      ahora: ${JSON.stringify(lineas[i])}`);
}

const quedan = lineas.filter((l) => l.includes(F));
if (fallos) {
  console.log(informe.join('\n'));
  console.log(`\n${fallos} sustitución(es) no cuadraron: NO se ha escrito nada.`);
  process.exitCode = 1;
} else {
  writeFileSync(RUTA, lineas.join('\n'));
  console.log(informe.join('\n'));
  console.log(`\nEscrito. Líneas con U+FFFD antes: ${original.split('\n').filter((l) => l.includes(F)).length} · después: ${quedan.length}`);
  if (quedan.length) console.log(quedan.map((l) => `    ${l}`).join('\n'));
}
