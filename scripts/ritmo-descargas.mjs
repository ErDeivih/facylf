/*
 * Ritmo de descargas de las últimas 24 horas, federación por federación.
 *
 * Se mide sobre la tabla `peticiones` de cada cola (lleva `iniciada_en` y `duracion_ms`), que es el registro
 * de lo que de verdad se ha pedido a cada federación, y sobre `actas` (`comprobada_en`), que es lo que se ha
 * guardado. Las dos cifras importan y no son lo mismo: una petición puede traer un acta, pero también puede
 * ser un calendario, una clasificación o un índice que no produce datos.
 *
 * Uso:  node scripts/ritmo-descargas.mjs <cola.sqlite> [cola.sqlite ...] [--horas N]
 *       (sin argumentos usa las cuatro colas de este PC)
 *
 * ── LA VENTANA SE PUEDE ACORTAR (`--horas`), Y HACE FALTA (29/09/2026) ───────────────────────────────────
 *
 * Con la ventana fija de 24 h, un cambio de reparto hecho hace veinte minutos se mide mezclado con las veinte
 * horas anteriores y parece que no ha servido de nada. `--horas 1` (o `--horas 3`) dice lo que está pasando
 * AHORA, que es la única pregunta que se puede contestar justo después de tocar una asignación.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const POR_DEFECTO = [
  ['castilla-leon', 'descargas-federacion/recolector-local/cola-v2.sqlite'],
  ['valencia', 'descargas-valencia/recolector-local/cola-v2.sqlite'],
  ['madrid', 'descargas-madrid/recolector-local/cola-v2.sqlite'],
  ['cataluna', 'descargas-cataluna/recolector-local/cola-v2.sqlite'],
];
/*
 * Con rutas pasadas a mano, el nombre es la CARPETA que contiene la cola: en el servidor las de siempre son
 * `/srv/ssd/facylf/<federacion>/cola-v2.sqlite`, así que la carpeta padre es la federación.
 */
const argumentos = process.argv.slice(2);
const iHoras = argumentos.indexOf('--horas');
const VENTANA = iHoras >= 0 ? Math.max(1, Number(argumentos[iHoras + 1]) || 24) : 24;
if (iHoras >= 0) argumentos.splice(iHoras, 2);
const colas = argumentos.length
  ? argumentos.map((r) => [r.replace(/\/+$/, '').split('/').slice(-2, -1)[0] ?? r, r])
  : POR_DEFECTO;

/*
 * ── DOS COSAS QUE NO SON LO MISMO, Y QUE YO MEZCLÉ (corregido el 28/09/2026) ────────────────────────────
 *
 * `duracion_ms` es lo que TARDA la respuesta, no el tiempo que se espera entre peticiones. Yo lo etiqueté como
 * «seg/petición» y de ahí salió la duda razonable del responsable: «Castilla y León a 1,5 s por petición… ¿y no
 * salta el bloqueo?». No salta porque **no son 1,5 s entre peticiones**: son 1,5 s de respuesta, y el hueco real
 * entre una petición y la siguiente se mide dividiendo la hora entre las peticiones de esa hora.
 *
 * Se dan las tres cifras, cada una con su nombre: peticiones/hora, segundos ENTRE peticiones (el ritmo de
 * cortesía que de verdad se respeta) y duración media de la respuesta.
 */
const totales = { peticiones: 0, actas: 0 };
console.log(`federacion           pet.${VENTANA}h   actas${VENTANA}h   pet/hora   seg ENTRE pet.   respuesta media   ultima peticion`);
for (const [nombre, ruta] of colas) {
  if (!existsSync(ruta)) {
    console.log(`${nombre.padEnd(20)} (no existe la cola)`);
    continue;
  }
  const db = new DatabaseSync(ruta, { readOnly: true });
  let pet = 0;
  let actas = 0;
  let respuesta = null;
  let ultima = null;
  try {
    pet = db.prepare(`select count(*) as n from peticiones where datetime(iniciada_en) >= datetime('now',?)`).get(`-${VENTANA} hours`).n;
    respuesta = db.prepare(`select round(avg(duracion_ms)/1000.0,1) as s from peticiones
      where duracion_ms is not null and datetime(iniciada_en) >= datetime('now',?)`).get(`-${VENTANA} hours`).s;
    ultima = db.prepare(`select max(iniciada_en) as u from peticiones`).get().u;
  } catch { /* cola sin tabla de peticiones */ }
  try {
    actas = db.prepare(`select count(*) as n from actas where datetime(comprobada_en) >= datetime('now',?)`).get(`-${VENTANA} hours`).n;
  } catch { /* cola sin tabla de actas */ }
  totales.peticiones += Number(pet);
  totales.actas += Number(actas);
  const porHora = Number(pet) / VENTANA;
  const entre = porHora > 0 ? (3600 / porHora).toFixed(1) : '-';
  console.log(`${nombre.padEnd(20)} ${String(pet).padStart(7)} ${String(actas).padStart(10)} ${String(Math.round(porHora)).padStart(10)} ${String(entre).padStart(16)} ${String(respuesta ?? '-').padStart(17)}   ${ultima ?? '-'}`);
  db.close();
}
console.log(`\nTOTAL                ${String(totales.peticiones).padStart(7)} ${String(totales.actas).padStart(10)} ${String(Math.round(totales.peticiones / VENTANA)).padStart(10)} peticiones/hora`);

// Y el reparto por hora, para ver si el ritmo es regular o hay huecos.
//
// OJO con la etiqueta: los sellos de `peticiones` son ISO en UTC, así que `strftime` agrupa por hora UTC, NO por
// la hora local del PC. Decía «hora local del PC» y eso hizo leer mal un hueco (creí ver una parada a las 00:00
// cuando era a las 02:00 locales). La etiqueta dice ahora lo que de verdad es.
console.log(`\n=== PETICIONES POR HORA (últimas ${VENTANA} h, hora UTC) ===`);
for (const [nombre, ruta] of colas) {
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const filas = db.prepare(`select strftime('%d %H', iniciada_en) as hora, count(*) as n
      from peticiones where datetime(iniciada_en) >= datetime('now',?) group by 1 order by 1`).all(`-${VENTANA} hours`);
    const porHora = filas.map((f) => `${f.hora}h:${f.n}`).join('  ');
    console.log(`  ${nombre.padEnd(16)} ${porHora || '(sin peticiones)'}`);
  } catch { console.log(`  ${nombre.padEnd(16)} (sin tabla de peticiones)`); }
  db.close();
}
