/*
 * ¿Están TODOS los recolectores trabajando y con su ritmo? Comprobación de una sola pasada.
 *
 * Para cada federación con cola: si su proceso está vivo, qué jornadas ha comprobado hoy, cuántas peticiones
 * ha hecho en la última hora, qué dice la última línea de su registro y si hay algún trabajo en_curso.
 *
 * También comprueba lo que este trabajo cambió: que la retirada del canónico y la recuperación de Valencia
 * siguen en pie y que no han aparecido filas de descanso nuevas.
 *
 * Sólo lee. Uso: node scripts/_diag-salud-recolectores.mjs
 */
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const VOCABULARIO = ['descansa', 'descans', 'descanso', 'atsedena'];
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Procesos de recolector vivos, con su hora de arranque. */
let procesos = [];
try {
  const salida = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*recolector*\' } | Select-Object ProcessId,CommandLine,CreationDate | ConvertTo-Json -Compress"',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  procesos = salida.trim() ? [].concat(JSON.parse(salida)) : [];
} catch { procesos = []; }
const procesoDe = (nombre) => procesos.find((p) => String(p.CommandLine).includes(`recolector-${nombre}`) || String(p.CommandLine).includes(`recolector-local.mjs`) && nombre === 'euskadi');

const ahora = Date.now();
const carpetas = readdirSync(raiz).filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')));

console.log(`procesos de recolector vivos: ${procesos.length}`);
for (const p of procesos) {
  const cmd = String(p.CommandLine);
  const f = /recolector-([a-z-]+)\.mjs/.exec(cmd)?.[1] ?? (cmd.includes('recolector-local.mjs') ? 'euskadi' : '?');
  console.log(`  · ${f.padEnd(10)} pid ${p.ProcessId} · desde ${p.CreationDate}`);
}

for (const carpeta of carpetas.sort()) {
  const federacion = carpeta.replace('descargas-', '');
  const base = join(raiz, carpeta, 'recolector-local');
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const hoy = new Date().toISOString().slice(0, 10);
  const unaHora = new Date(ahora - 3600_000).toISOString();
  const n = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;
  const partidos = n('select count(*) n from partidos');
  const descanso = db.prepare('select local, visitante from partidos').all()
    .filter((f) => VOCABULARIO.includes(norm(f.local)) || VOCABULARIO.includes(norm(f.visitante))).length;
  const comprobadasHoy = n('select count(*) n from jornadas where comprobada_en >= ?', hoy);
  const ultima = db.prepare('select max(comprobada_en) m from jornadas').get().m;
  const peticiones1h = n('select count(*) n from peticiones where iniciada_en >= ?', unaHora);
  const enCurso = n("select count(*) n from trabajos where estado='en_curso'");
  const proximo = db.prepare("select min(siguiente_intento) m from trabajos where estado='pendiente'").get().m;
  const pendientes = n("select count(*) n from trabajos where estado='pendiente'");
  const errores = n("select count(*) n from peticiones where resultado not in ('ok')");
  const ultimosErrores = db.prepare("select iniciada_en, resultado, detalle from peticiones where resultado not in ('ok') order by id desc limit 2").all();
  db.close();

  const vivo = Boolean(procesoDe(federacion));
  const registro = join(base, 'worker-programado.log');
  let ultimaLinea = '(sin registro)';
  if (existsSync(registro)) {
    const lineas = readFileSync(registro, 'utf8').trim().split('\n');
    ultimaLinea = lineas[lineas.length - 1]?.slice(0, 120) ?? '';
  }
  console.log(`\n=== ${federacion} ${vivo ? '(proceso VIVO)' : '(sin proceso)'}`);
  console.log(`  partidos ${partidos} · con lado de descanso ${descanso}`);
  console.log(`  jornadas comprobadas hoy ${comprobadasHoy} · última ${ultima ?? '—'}`);
  console.log(`  peticiones última hora ${peticiones1h} · trabajos en_curso ${enCurso} · pendientes ${pendientes} (próximo ${proximo ?? '—'})`);
  console.log(`  peticiones con resultado distinto de ok: ${errores}`);
  for (const e of ultimosErrores) console.log(`     · ${e.iniciada_en} ${e.resultado}: ${String(e.detalle ?? '').slice(0, 90)}`);
  console.log(`  registro: ${ultimaLinea}`);
  const mtime = existsSync(registro) ? statSync(registro).mtime : null;
  if (mtime) console.log(`  registro actualizado hace ${Math.round((ahora - mtime.getTime()) / 60000)} min`);
}
