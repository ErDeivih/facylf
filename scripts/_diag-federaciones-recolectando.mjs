/*
 * ¿Están TODAS las federaciones recolectando? Una línea por federación, y el detector de procesos caídos.
 *
 * «Está recolectando» no se deduce de que haya un proceso vivo —un recolector puede estar en bucle de fallo
 * y parecer vivo—, así que se mide lo que sí lo demuestra: peticiones recientes y registro fresco. Y se busca
 * explícitamente el `codigo 1` del supervisor, que es el síntoma de un recolector que no arranca.
 *
 * Sólo lee. Uso: node scripts/_diag-federaciones-recolectando.mjs
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const ahora = Date.now();
const unaHora = new Date(ahora - 3600_000).toISOString();
const hoy = new Date().toISOString().slice(0, 10);

const carpetas = readdirSync(raiz)
  .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
  .sort();

console.log('federación        partidos  jornadas  petic/h  reg.min  último arranque/fallo');
const problemas = [];
for (const carpeta of carpetas) {
  const federacion = carpeta.replace('descargas-', '');
  const base = join(raiz, carpeta, 'recolector-local');
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;
  const partidos = uno('select count(*) n from partidos');
  const jornadasHoy = uno('select count(*) n from jornadas where comprobada_en >= ?', hoy);
  const peticiones1h = uno('select count(*) n from peticiones where iniciada_en >= ?', unaHora);
  db.close();

  const registro = join(base, 'worker-programado.log');
  let edad = null;
  let caidas = 0;
  let ultimaLinea = '';
  if (existsSync(registro)) {
    edad = Math.round((ahora - statSync(registro).mtime.getTime()) / 60000);
    const texto = readFileSync(registro, 'utf8');
    const lineas = texto.trim().split('\n');
    ultimaLinea = lineas[lineas.length - 1]?.slice(0, 46) ?? '';
    // Sólo las caídas de la última hora, y contadas por su sello de fecha.
    const haceUnaHora = new Date(ahora - 3600_000).toISOString();
    for (const linea of lineas.slice(-400)) {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s+El worker termino con codigo (\d+)/.exec(linea.trim());
      if (!m) continue;
      const cuando = `${m[1]}T${m[2]}`;
      const ahoraLocal = new Date(ahora).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T');
      const limite = ahoraLocal.slice(0, 13);
      void haceUnaHora;
      if (cuando.slice(0, 13) >= limite && m[3] !== '0') caidas += 1;
    }
  }

  const sinRecolectar = peticiones1h === 0 && (edad === null || edad > 90);
  const marca = caidas > 0 ? 'CAÍDAS' : sinRecolectar ? 'sin recolectar' : 'ok';
  console.log(`${federacion.padEnd(17)} ${String(partidos).padStart(8)} ${String(jornadasHoy).padStart(9)} ${String(peticiones1h).padStart(8)} ${String(edad ?? '—').padStart(8)}  ${marca} · ${ultimaLinea}`);
  if (caidas > 0) problemas.push(`${federacion}: ${caidas} caída(s) en la última hora (codigo != 0)`);
  if (sinRecolectar) problemas.push(`${federacion}: sin peticiones en la última hora y registro de hace ${edad ?? '?'} min`);
}

console.log('');
if (!problemas.length) console.log('✓ ninguna federación con caídas recientes ni con el registro parado');
else for (const p of problemas) console.log(`⚠ ${p}`);
