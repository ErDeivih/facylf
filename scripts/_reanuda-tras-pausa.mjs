/*
 * Anula la PAUSA PREVENTIVA de una federación, dejando constancia de lo que había y de por qué se quita.
 *
 * Para qué: la pausa preventiva es una marca de la cola que aparta toda la federación hasta una hora
 * (seis, en el peor caso) cuando encadena fallos seguidos. Si el motivo de esos fallos era NUESTRO —el
 * navegador de la sesión se cayó, o alguien mató su chromedriver por error—, la fuente no tiene nada que
 * perdonar y esperar la pausa entera es tiempo perdido con miles de trabajos disponibles en la cola.
 *
 * Se hace lo MISMO que hace el propio recolector cuando la pausa vence sola (`pausaGlobalActiva` deja los
 * dos metadatos vacíos) y además se escribe un evento `pausa_anulada` en la cola, con el valor anterior y
 * la nota, para que quede rastro de quién la quitó y por qué. Es reversible: el JSON de evidencias guarda
 * el valor anterior y basta con volver a escribirlo.
 *
 * NO toca nada canónico, ni procesos, ni otras federaciones.
 *
 * Uso: node scripts/_reanuda-tras-pausa.mjs <federacion> [<federacion>...] [--nota "texto"]
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const iNota = argumentos.indexOf('--nota');
const nota = iNota >= 0 ? argumentos[iNota + 1] : 'sin nota';
const federaciones = argumentos.filter((a, i) => !a.startsWith('--') && i !== iNota + 1);
if (!federaciones.length) {
  console.error('Uso: node scripts/_reanuda-tras-pausa.mjs <federacion> [...] [--nota "texto"]');
  process.exitCode = 1;
} else {
  const rutaEvidencia = join(raiz, 'pruebas', 'reconstruccion', 'reanudacion-tras-pausa.json');
  const evidencias = existsSync(rutaEvidencia) ? JSON.parse(readFileSync(rutaEvidencia, 'utf8')) : [];
  const ahora = new Date().toISOString();

  for (const federacion of federaciones) {
    const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) { console.log(`  ${federacion}: no hay cola`); continue; }
    const db = new DatabaseSync(ruta);
    const lee = (clave) => db.prepare('select valor from metadatos where clave=?').get(clave)?.valor ?? '';
    const antes = { hasta: lee('pausa_global_hasta'), motivo: lee('pausa_global_motivo') };
    const activa = antes.hasta && new Date(antes.hasta).getTime() > Date.now();

    db.prepare(`insert into metadatos(clave,valor) values('pausa_global_hasta','')
      on conflict(clave) do update set valor=''`).run();
    db.prepare(`insert into metadatos(clave,valor) values('pausa_global_motivo','')
      on conflict(clave) do update set valor=''`).run();
    db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
      .run(ahora, 'aviso', 'pausa_anulada',
        `pausa quitada a mano (${nota}); estaba hasta ${antes.hasta || '(no había)'} por: ${antes.motivo || '(sin motivo)'}`);
    db.close();

    const fila = { federacion, cuando: ahora, nota, pausaAnterior: antes, estabaActiva: Boolean(activa) };
    evidencias.push(fila);
    console.log(`  ${federacion}: pausa ${activa ? 'ANULADA' : 'ya vencida'} · estaba hasta ${antes.hasta || '(nada)'}`);
  }

  mkdirSync(join(raiz, 'pruebas', 'reconstruccion'), { recursive: true });
  writeFileSync(rutaEvidencia, `${JSON.stringify(evidencias, null, 2)}\n`);
  console.log(`  evidencia: ${rutaEvidencia}`);
}
