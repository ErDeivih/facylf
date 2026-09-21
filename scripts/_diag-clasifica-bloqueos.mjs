#!/usr/bin/env node
/**
 * Clasifica los grupos cuyo índice de jornadas no se ha podido descubrir:
 *   A) opción de relleno de la federación: el código del grupo es el de la competición
 *   B) nombre repetido dentro de la misma temporada y competición (uno con índice y otro sin él)
 *   C) sin jornadas publicadas de otro tipo (categoría base, copa, competición retirada)
 * Y dice si la temporada ya terminó (entonces no va a aparecer nunca) o está en curso.
 *
 * Uso: node scripts/_diag-clasifica-bloqueos.mjs <ruta-cola>   (o sin argumentos: todas)
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const rutas = process.argv[2]
  ? [process.argv[2]]
  : readdirSync('.').filter((d) => d.startsWith('descargas-')).map((d) => `${d}/recolector-local/cola-v2.sqlite`);

const hoy = new Date().toISOString().slice(0, 10);
let totales = { A: 0, B: 0, C: 0 };
for (const ruta of rutas) {
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select t.temporada, t.competicion, t.grupo, t.ultimo_error, g.nombre,
      g.jornadas, t.estado, t.siguiente_intento
    from trabajos t left join grupos g on g.temporada=t.temporada and g.competicion=t.competicion
      and g.codigo=t.grupo
    where t.tipo='indice_jornadas' and t.estado in ('pendiente','bloqueado')
      and t.ultimo_error is not null`).all();
  if (!filas.length) { db.close(); continue; }
  const clases = new Map();
  for (const f of filas) {
    let clase;
    if (f.grupo === f.competicion) clase = 'A código de grupo = código de competición';
    else {
      const gemelo = db.prepare(`select count(*) n from grupos where temporada=? and competicion=?
        and nombre=? and codigo<>? and jornadas > 0`).get(f.temporada, f.competicion, f.nombre, f.grupo).n;
      if (gemelo) clase = 'B nombre repetido con otro grupo que sí tiene índice';
      else {
        const ultima = db.prepare(`select max(fecha) f from jornadas where temporada=? and competicion=?`)
          .get(f.temporada, f.competicion)?.f ?? null;
        clase = `C sin jornadas publicadas (última fecha conocida de la competición: ${ultima ?? 'ninguna'})`;
      }
    }
    const clave = clase[0];
    totales[clave] += 1;
    const detalle = `${clase} · t${f.temporada} c${f.competicion} g${f.grupo} «${f.nombre ?? '?'}» · sig ${f.siguiente_intento ?? '-'}`;
    if (!clases.has(clase)) clases.set(clase, 0);
    clases.set(clase, clases.get(clase) + 1);
    if ((clases.get(clase) ?? 0) === 1) console.log(`  [${ruta.split('/')[0].replace('descargas-', '')}] ${detalle}`);
  }
  console.log(`${ruta.split('/')[0].replace('descargas-', '').padEnd(22)} ${filas.length} grupos sin índice`);
  for (const [clase, n] of [...clases.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)} · ${clase}`);
  }
  db.close();
}
console.log(`\nTOTALES: A (código repetido) ${totales.A} · B (nombre repetido) ${totales.B} · C (sin jornadas publicadas) ${totales.C}`);
console.log(`(hoy ${hoy})`);
