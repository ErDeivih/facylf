/* Diagnóstico de salud de todas las colas: errores recientes, pausas, y coherencia entre lo que se
 * descarga y lo que se guarda. Sirve para las tres preguntas a la vez: qué pasa en una federación
 * concreta, por qué una descarga jornadas sin partidos, y si algún otro worker tiene un problema
 * que no se había visto. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const HACE_24H = new Date(Date.now() - 24 * 3600_000).toISOString();
const ahora = new Date().toISOString();
const solo = process.argv[2] ?? null;

function nombreDe(dir) {
  return dir === 'descargas-federacion' ? 'castilla-leon' : dir.replace(/^descargas-/, '');
}

for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  if (dir === 'descargas-federacion-sondeo') continue;
  const nombre = nombreDe(dir);
  if (solo && nombre !== solo) continue;
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try { db = new DatabaseSync(ruta, { readOnly: true }); } catch { continue; }
  const todos = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  const uno = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch { return null; }; };

  console.log(`\n${'='.repeat(78)}\n${nombre.toUpperCase()}   (${dir})`);

  // --- pausa y último trabajo ---
  const meta = Object.fromEntries(todos('select clave, valor from metadatos').map((m) => [m.clave, m.valor]));
  const pausa = meta.pausa_global_hasta && meta.pausa_global_hasta > ahora
    ? `PAUSA hasta ${meta.pausa_global_hasta} · ${meta.pausa_global_motivo}` : 'sin pausa';
  console.log(`pausa: ${pausa}`);
  const ult = uno('select iniciada_en, resultado, detalle from peticiones order by id desc limit 1');
  console.log(`última petición: ${ult ? `${ult.iniciada_en} · ${ult.resultado} · ${String(ult.detalle).slice(0, 60)}` : '—'}`);

  // --- errores de las últimas 24 h, agrupados ---
  const errores = todos(`select resultado, detalle, count(*) n from peticiones
    where iniciada_en > ? and resultado in ('error','bloqueo','sin_publicar')
    group by resultado, substr(detalle,1,60) order by n desc limit 8`, HACE_24H);
  console.log(`errores/bloqueos en 24 h: ${errores.length ? '' : 'ninguno'}`);
  for (const e of errores) console.log(`   [${e.resultado}] ×${e.n}  ${String(e.detalle).slice(0, 90)}`);

  // --- secuencia de las últimas 14 peticiones (para ver un patrón de fallos seguidos) ---
  const ultimas = todos(`select iniciada_en, resultado, detalle from peticiones order by id desc limit 14`);
  console.log('secuencia (de la más reciente a la más antigua):');
  for (const p of ultimas) {
    console.log(`   ${p.iniciada_en.slice(11, 19)} ${String(p.resultado).padEnd(14)} ${String(p.detalle ?? '').slice(0, 56)}`);
  }

  // --- coherencia entre descargas y datos ---
  const jor = uno('select count(*) total, sum(archivo is not null) conArchivo from jornadas');
  const par = uno('select count(*) n from partidos');
  const parConResultado = uno('select count(*) n from partidos where goles_local is not null');
  const act = uno("select count(*) total, sum(estado='hecha') hechas from actas");
  const grupoJor = uno('select count(*) n from grupos where jornadas is not null');
  console.log(`jornadas: ${jor?.total} (con archivo ${jor?.conArchivo}) · partidos: ${par?.n} (con resultado ${parConResultado?.n})`);
  console.log(`actas: ${act?.total} (analizadas ${act?.hechas}) · grupos con índice leído: ${grupoJor?.n}`);

  // Señal de alarma: jornadas guardadas de las que no sale ningún partido.
  if ((jor?.conArchivo ?? 0) >= 50 && (par?.n ?? 0) === 0) {
    console.log('   >>> ALARMA: hay jornadas guardadas y CERO partidos.');
  }
  // Señal de alarma: partidos sin enlace a acta.
  if ((par?.n ?? 0) > 50) {
    const sinActa = uno('select count(*) n from partidos where codigo_acta is null');
    if ((sinActa?.n ?? 0) / par.n > 0.5) {
      console.log(`   >>> ALARMA: ${sinActa.n} de ${par.n} partidos sin código de acta.`);
    }
  }
  if ((jor?.conArchivo ?? 0) >= 50 && (grupoJor?.n ?? 0) === 0) {
    console.log('   >>> ALARMA: jornadas guardadas pero ningún grupo con jornadas registradas.');
  }

  // --- trabajos ---
  const est = todos('select estado, count(*) n from trabajos group by estado order by n desc');
  console.log('trabajos: ' + est.map((e) => `${e.estado}=${e.n}`).join(' '));
  const bloqueados = todos("select tipo, ultimo_error, count(*) n from trabajos where estado='bloqueado' group by tipo, ultimo_error limit 6");
  for (const b of bloqueados) console.log(`   bloqueado [${b.tipo}] ×${b.n}: ${String(b.ultimo_error).slice(0, 80)}`);
  const cancelados = todos("select tipo, ultimo_error, count(*) n from trabajos where estado='cancelado' group by tipo, substr(ultimo_error,1,40) order by n desc limit 6");
  for (const c of cancelados) console.log(`   descartado [${c.tipo}] ×${c.n}: ${String(c.ultimo_error ?? '').slice(0, 70)}`);

  db.close();
}
console.log(`\n(${new Date().toLocaleString('es-ES')})`);
