/*
 * ¿QUEDA ALGO RECOLECTADO DEL CIUDAD RODRIGO SIN IMPORTAR?
 *
 * La pregunta del encargo, aplicada a un club concreto: buscar en las 19 colas TODOS los grupos donde
 * aparece un equipo del Ciudad Rodrigo y comprobar, uno a uno, si están dentro del canónico. Es la única
 * forma de decir «el informe está completo» sin apoyarse en la memoria de nadie.
 *
 * Mide las dos cosas que pueden faltar:
 *   · grupos del club que están en la cola y NO en el canónico (importación pendiente);
 *   · grupos del club que están en el canónico y NO en la cola de este PC (datos que vinieron por otra vía).
 *
 * SÓLO LEE. Uso: node scripts/que-falta-de-un-club.mjs [texto] [--json]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');

const argumentos = process.argv.slice(2);
const patron = (argumentos.find((a) => !a.startsWith('--')) ?? 'CIUDAD RODRIGO').toUpperCase();

for (const linea of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
  const i = linea.indexOf('=');
  if (i > 0 && !process.env[linea.slice(0, i)]) process.env[linea.slice(0, i)] = linea.slice(i + 1).trim();
}

/* ── 1. Las colas: dónde aparece el club ────────────────────────────────────────────────────────────── */
const enLasColas = new Map();
for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const carpeta = entrada.name;
  if (carpeta === 'descargas-federacion-sondeo' || carpeta === 'descargas-prueba-10gb') continue;
  const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta) || existsSync(join(RAIZ, carpeta, '.PRUEBA'))) continue;
  const federacion = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const filas = db.prepare(`
      select p.temporada, t.etiqueta as etiqueta, p.competicion, p.grupo,
             count(*) as partidos,
             count(distinct p.codigo_acta) as actas_citadas,
             sum(exists (select 1 from actas a where a.temporada = p.temporada and a.competicion = p.competicion
                   and a.grupo = p.grupo and a.codigo = p.codigo_acta and a.estado = 'hecha')) as actas_hechas
        from partidos p
        join temporadas t on t.codigo = p.temporada
       where upper(p.local) like '%' || ? || '%' or upper(p.visitante) like '%' || ? || '%'
       group by p.temporada, t.etiqueta, p.competicion, p.grupo
       order by t.etiqueta desc`).all(patron, patron);
    for (const f of filas) {
      enLasColas.set(`${federacion}|${f.etiqueta}|${f.grupo}`, {
        federacion, temporada: f.etiqueta, competicion: f.competicion, grupo: f.grupo,
        partidos: Number(f.partidos), actasCitadas: Number(f.actas_citadas), actasHechas: Number(f.actas_hechas),
      });
    }
  } catch (error) {
    console.error(`  ${federacion}: no se pudo leer (${error.message})`);
  } finally { db.close(); }
}

/* ── 2. El canónico: dónde está el club ────────────────────────────────────────────────────────────── */
const cliente = new Client({ connectionString: process.env.DATABASE_URL_LECTOR, statement_timeout: 120_000 });
await cliente.connect();
const { rows: canonico } = await cliente.query(`
  select distinct f.codigo as federacion, s.etiqueta as temporada, pg.codigo_externo as grupo,
         te.nombre_en_fuente as equipo, count(m.id) as partidos
    from core.team_entry te
    join core.phase_group pg on pg.id = te.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    join core.federation f on f.id = ce.federation_id
    join core.season s on s.id = ce.season_id
    left join core.match m on m.phase_group_id = pg.id
       and (m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)
   where upper(te.nombre_en_fuente) like '%' || $1 || '%'
   group by 1, 2, 3, 4`, [patron]);
await cliente.end();

const enCanonico = new Map();
for (const r of canonico) {
  const clave = `${r.federacion}|${r.temporada}|${r.grupo}`;
  const actual = enCanonico.get(clave) ?? { federacion: r.federacion, temporada: r.temporada, grupo: r.grupo, equipos: new Set(), partidos: 0 };
  actual.equipos.add(r.equipo);
  actual.partidos = Math.max(actual.partidos, Number(r.partidos));
  enCanonico.set(clave, actual);
}

/* ── 3. La resta ───────────────────────────────────────────────────────────────────────────────────── */
const claves = new Set([...enLasColas.keys(), ...enCanonico.keys()]);
const filas = [...claves].map((clave) => {
  const cola = enLasColas.get(clave);
  const canon = enCanonico.get(clave);
  return {
    clave, federacion: cola?.federacion ?? canon.federacion,
    temporada: cola?.temporada ?? canon.temporada,
    grupo: cola?.grupo ?? canon.grupo,
    enCola: cola !== undefined, enCanonico: canon !== undefined,
    partidosCola: cola?.partidos ?? 0, partidosCanonico: canon?.partidos ?? 0,
    actasCitadas: cola?.actasCitadas ?? 0, actasHechas: cola?.actasHechas ?? 0,
  };
}).sort((a, b) => b.temporada.localeCompare(a.temporada, 'es') || b.partidosCola - a.partidosCola);

const faltan = filas.filter((f) => f.enCola && !f.enCanonico);
const soloCanonico = filas.filter((f) => !f.enCola && f.enCanonico);
const ambos = filas.filter((f) => f.enCola && f.enCanonico);

console.log(`grupos con algún equipo «${patron}»: ${filas.length}`);
console.log(`  en la cola y en el canónico:      ${ambos.length}`);
console.log(`  EN LA COLA Y SIN IMPORTAR:        ${faltan.length}`);
console.log(`  en el canónico y no en la cola:   ${soloCanonico.length}`);
console.log('');
for (const f of filas) {
  const marca = f.enCola && f.enCanonico ? 'ok  ' : (f.enCanonico ? 'can ' : 'FALTA');
  console.log(`  ${marca} ${f.temporada} ${f.federacion.padEnd(14)} g${String(f.grupo).padEnd(10)} `
    + `cola ${String(f.partidosCola).padStart(4)} partidos (${f.actasHechas}/${f.actasCitadas} actas hechas) · `
    + `canónico ${String(f.partidosCanonico).padStart(4)} partidos`);
}
