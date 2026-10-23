/*
 * ── ABRIR UNA TEMPORADA APARCADA (de una en una, y comprobando) ──────────────────────────────────────────
 *
 * Medido el 06/10/2026 en el servidor: las temporadas de 2010 a 2018 de doce federaciones están aparcadas con
 * `siguiente_intento = 2099-01-01`, que en este proyecto significa «nunca». Sin un solo error apuntado: no las
 * aparcó un fallo, las aparcó una decisión. En Aragón eran 28.154 trabajos de 31.299.
 *
 * Eso es lo que David quiere abrir, y con razón: con quince temporadas de historial detrás, una federación no
 * puede estar «sin trabajo». Pero NO se abre todo de golpe —eso ahogaría a los recolectores y taparía otra vez
 * la temporada en curso—, sino **una temporada por federación y se mide**.
 *
 * Qué hace, en este orden y sólo para la temporada pedida:
 *
 *   1. Cuenta lo que hay aparcado en esa temporada (por tipo) y lo enseña.
 *   2. Con `--abrir`: devuelve `siguiente_intento` a nulo en los trabajos de ESA temporada que están a 2099.
 *   3. Añade la temporada al fichero de temporadas asignadas de la federación, que es la puerta que ya existe
 *      para que una temporada por debajo del suelo se recolecte igualmente (lib/temporadas-asignadas.mjs).
 *
 * Sin `--abrir` no toca nada: sólo mira.
 *
 * Uso:
 *   node scripts/servidor/abre-temporada.mjs <cola.sqlite> <temporada> [--abrir] [--asignadas <fichero>]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [ruta, temporada] = args;
const abrir = args.includes('--abrir');
const iAsig = args.indexOf('--asignadas');
const ficheroAsignadas = iAsig >= 0 ? args[iAsig + 1] : null;

if (!ruta || !temporada) {
  console.error('uso: abre-temporada.mjs <cola.sqlite> <temporada> [--abrir] [--asignadas <fichero>]');
  process.exit(2);
}
if (!existsSync(ruta)) { console.error(`no encuentro la cola: ${ruta}`); process.exit(2); }

const db = new DatabaseSync(ruta, { timeout: 60_000 });
const t = String(temporada);

const cuenta = (sql, ...p) => Number(db.prepare(sql).get(...p)?.n ?? 0);
const aparcados = cuenta(`select count(*) n from trabajos where temporada = ? and estado in ('pendiente','bloqueado')
  and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01'`, t);
const enCursoT = cuenta(`select count(*) n from trabajos where temporada = ? and estado = 'hecho'`, t);
const totalT = cuenta(`select count(*) n from trabajos where temporada = ?`, t);

console.log(`\n════════ temporada ${t} ════════`);
console.log(`  trabajos de la temporada: ${totalT}  ·  hechos: ${enCursoT}  ·  aparcados en 2099: ${aparcados}`);
console.log('  por tipo (lo aparcado):');
for (const f of db.prepare(`select tipo, count(*) n from trabajos where temporada = ? and estado in ('pendiente','bloqueado')
  and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01' group by 1 order by n desc`).all(t)) {
  console.log(`    ${String(f.tipo).padEnd(20)} ${String(f.n).padStart(7)}`);
}
// El error que llevan apuntado dice si las aparcó un fallo o una decisión. Es la diferencia importante.
const errores = db.prepare(`select coalesce(ultimo_error,'(sin error)') e, count(*) n from trabajos
  where temporada = ? and estado in ('pendiente','bloqueado')
  and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01'
  group by 1 order by n desc limit 3`).all(t);
console.log('  motivo apuntado:');
for (const f of errores) console.log(`    ${String(f.n).padStart(7)}  ${f.e.slice(0, 90)}`);

if (!abrir) {
  console.log('\n  (esto ha sido MIRAR: no se ha tocado nada. Repetir con --abrir para abrirla.)');
  db.close();
  process.exit(0);
}

if (!aparcados) { console.log('\n  no hay nada aparcado en esa temporada: nada que abrir.'); db.close(); process.exit(0); }

const cambios = db.prepare(`update trabajos set siguiente_intento = null, actualizado_en = ?
  where temporada = ? and estado in ('pendiente','bloqueado')
    and siguiente_intento is not null and date(siguiente_intento) >= '2090-01-01'`).run(new Date().toISOString(), t).changes;
console.log(`\n  ABIERTA: ${cambios} trabajos de la temporada ${t} vuelven a la cola.`);

if (ficheroAsignadas) {
  /*
   * ── SE ESCRIBE LA ETIQUETA, NUNCA EL CÓDIGO (fallo corregido el 06/10/2026) ──────────────────────────────
   *
   * Esta herramienta escribía el CÓDIGO de temporada (`18`) en el fichero de temporadas asignadas. Y eso es
   * exactamente lo que `lib/temporadas-asignadas.mjs` avisa que no se puede hacer, tres veces y con estas
   * palabras: **«`trabajos.temporada` guarda el CÓDIGO, y ese código NO significa lo mismo en cada federación:
   * en La Rioja el 9 es 2013-14 y en Andalucía el 19 es 2023-24. Escribir el código a mano sería un error
   * silencioso: filtraría por la temporada equivocada sin dar ningún aviso.»**
   *
   * Consecuencia medida: los ficheros de Madrid y Valencia quedaron con códigos sueltos (`18 17 16…`), que el
   * lector NO reconoce porque él traduce ETIQUETAS por la tabla `temporadas`. Es decir, **la asignación no
   * valía para nada** — el trabajo se abría en la cola y el suelo lo volvía a excluir al elegir. Y en CyL la
   * lista quedó mezclada (`2025-26 … 18 16 14 12`).
   *
   * Así que se traduce el código a la etiqueta de ESTA cola antes de escribirlo, y se normaliza lo que ya
   * hubiera: si una línea es un código conocido de esta federación, se sustituye por su etiqueta.
   */
  const etiquetaDe = (codigo) => {
    const fila = db.prepare('select etiqueta from temporadas where codigo = ?').get(String(codigo));
    return fila?.etiqueta ?? null;
  };
  const esCodigo = (linea) => etiquetaDe(linea) !== null;
  const etiqueta = etiquetaDe(t);

  const previas = existsSync(ficheroAsignadas)
    ? readFileSync(ficheroAsignadas, 'utf8').split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)
    : [];
  // Normaliza: un código se convierte en su etiqueta; una etiqueta se queda como está.
  const normalizadas = [...new Set(previas.map((l) => (esCodigo(l) ? etiquetaDe(l) : l)))];
  if (!etiqueta) {
    console.log(`  ⚠ la cola no conoce el código ${t}: no se puede traducir a etiqueta, NO se asigna.`);
  } else if (!normalizadas.includes(etiqueta)) {
    normalizadas.push(etiqueta);
  }
  const cambiado = normalizadas.length !== previas.length || previas.some((l) => esCodigo(l));
  if (cambiado) {
    writeFileSync(ficheroAsignadas, normalizadas.join('\n') + '\n', 'utf8');
    console.log(`  fichero de asignadas normalizado a etiquetas: ${normalizadas.join(' ')}`);
  } else {
    console.log(`  la temporada ${etiqueta ?? t} ya estaba asignada (como etiqueta).`);
  }
} else {
  console.log('  aviso: sin --asignadas, el suelo puede volver a excluirla del selector. Añádela a mano.');
}
db.close();
