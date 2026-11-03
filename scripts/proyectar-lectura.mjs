#!/usr/bin/env node
/**
 * Proyecta el modelo de lectura (migración 0023): resúmenes de equipo y de jugador, carreras y búsqueda.
 *
 * Por qué existe: la web y los informes agregaban `core.appearance` y `core.match_event` en cada petición.
 * Con esto, una ficha de jugador o de equipo lee filas ya calculadas (milisegundos) y la búsqueda usa
 * `analytics.search_entity` con su índice de trigramas.
 *
 * Qué hace: coge los grupos de `analytics.proyeccion_pendiente` (los que han tenido un lote nuevo desde
 * su última proyección, o los que nunca se proyectaron) y, de uno en uno y cada uno en su transacción:
 *   1. `analytics.proyecta_grupo(id)`            → equipos y jugadores del grupo;
 *   2. `analytics.proyecta_busqueda_grupo(id)`   → clubes, equipos y la competición en la búsqueda;
 *   3. `analytics.proyecta_carreras(personas)`   → la carrera de cada persona afectada;
 *   4. `analytics.proyecta_busqueda_personas(…)` → esas personas en la búsqueda.
 *   5. (migración 0024) tramos y perfiles de esas personas.
 * Al final de la pasada, con 0026: evolución de cada equipo (A, B, C…) por temporadas y zonas aprendidas.
 * Al final de la pasada, con 0029: sanciones inferidas de cada EDICIÓN tocada (las fases encadenan la
 * sanción), la temporada de cada persona tocada con su desglose de minutos por equipo, y los árbitros.
 * Con 0030 cada fallo queda además en ops.evento_app (lo vigila scripts/vigilancia-plataforma.mjs).
 * Con 0032: ANTES de proyectar los grupos de una edición se mide qué registra esa edición (cambios, tarjetas,
 * minuto de gol…) una vez por pasada, porque proyecta_grupo v3 no calcula minutos donde no se apuntan los
 * cambios; y al final se detectan los casos raros de cada edición tocada (ops.caso_dato).
 * Al final de la pasada, con 0024: frecuencias de nombres, candidatos de identidad entre federaciones y
 * temporadas para las personas tocadas, y grupos de identidad (quién es la misma persona).
 * Si un grupo falla, se deshace SOLO ese grupo, se apunta y se sigue con el siguiente.
 *
 * No pide nada a ninguna web y no toca `core`: sólo escribe `analytics`. Escribe con el rol publicador.
 *
 * Regla del servidor (AGENTS.md): no se sobrecarga. Por eso va de grupo en grupo, con pausa entre
 * ellos, con un tope por pasada y con tiempo máximo por sentencia. La primera pasada completa se hace
 * por la noche y por federaciones (`--federacion`).
 *
 * Uso:
 *   node scripts/proyectar-lectura.mjs --estado
 *   node scripts/proyectar-lectura.mjs [--limite 200] [--pausa-ms 100] [--federacion castilla-leon]
 *   node scripts/proyectar-lectura.mjs --grupo 1234          (uno concreto, esté o no pendiente)
 *   node scripts/proyectar-lectura.mjs --identidad-todo       (recalcula la identidad de TODAS las personas,
 *                                                              por tandas; para la primera vez, de noche)
 *   node scripts/proyectar-lectura.mjs --temporadas-todo      (0029: rehace jugador_temporada, sanciones y
 *                                                              árbitros de TODO; una vez tras migrar, de noche)
 *   --sin-globales   no rehace al final evolución, zonas ni árbitros (pasadas cortas de cada 15 min)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile('.env'); } catch { /* el entorno puede venir de fuera */ }
const { Client } = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'canonico', 'package.json'))('pg');

const args = process.argv.slice(2);
const valor = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : porDefecto;
};
const soloEstado = args.includes('--estado');
const limite = Number(valor('--limite', 200));
const pausaMs = Number(valor('--pausa-ms', 100));
const federacion = valor('--federacion', null);
const grupoSuelto = valor('--grupo', null);
const identidadTodo = args.includes('--identidad-todo');
const temporadasTodo = args.includes('--temporadas-todo');
const sinGlobales = args.includes('--sin-globales');
const puntuaOjeo = args.includes('--puntua-ojeo');

const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();
if (!url) {
  console.error('✗ Falta DATABASE_URL_PUBLICADOR (está en .env).');
  process.exit(2);
}
if (/facylf_admin/.test(url)) {
  console.error('✗ DATABASE_URL_PUBLICADOR apunta a facylf_admin: la proyección no escribe como admin.');
  process.exit(2);
}

const cliente = new Client({ connectionString: url, application_name: 'proyectar-lectura' });
await cliente.connect();

const existe = await cliente.query(`select to_regclass('analytics.proyeccion_grupo') is not null as ok`);
if (!existe.rows[0].ok) {
  console.error('✗ Falta la migración 0023 (modelo de lectura). Antes: pnpm db:migrar');
  await cliente.end();
  process.exit(2);
}

// La Preferente (0051/0053, decisión D2): los grupos de una edición reemplazada por la de la federación no se proyectan
// nunca, y los de una edición sólo de LP, sólo con FACYLF_LP_PUBLICO=true. Así no entran en búsqueda, carreras ni ojeo.
const hay0051 = (await cliente.query(`select exists (select 1 from information_schema.columns where table_schema = 'core'
  and table_name = 'competition_edition' and column_name = 'reemplazada_por') as ok`)).rows[0].ok;
const LP_PUBLICO = /^(1|true|si|sí|on)$/i.test((process.env.FACYLF_LP_PUBLICO ?? '').trim());
const SQL_SIN_LP = !hay0051 ? '' : LP_PUBLICO ? ' and ce.reemplazada_por is null'
  : " and ce.reemplazada_por is null and ce.origen = 'federacion'";

const FILTRO = `
  from analytics.proyeccion_pendiente pp
  join core.phase_group pg on pg.id = pp.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.federation f on f.id = ce.federation_id
  join core.season s on s.id = ce.season_id
 where ($1::text is null or f.codigo = $1)${SQL_SIN_LP}`;

let detener = false;
process.on('SIGINT', () => {
  if (detener) process.exit(130);
  detener = true;
  console.log('\n· Ctrl+C: termino el grupo en curso y paro. Otra vez para cortar ya.');
});

const hayIdentidad = (await cliente.query(`select to_regclass('analytics.persona_perfil') is not null as ok`)).rows[0].ok;
const hay0029 = (await cliente.query(`select to_regclass('analytics.jugador_temporada') is not null as ok`)).rows[0].ok;
const hayEventos = (await cliente.query(`select to_regclass('ops.evento_app') is not null as ok`)).rows[0].ok;
const hay0032 = (await cliente.query(`select to_regclass('analytics.edicion_capacidad') is not null as ok`)).rows[0].ok;
const hay0036 = (await cliente.query(`select to_regclass('analytics.ojeo_jugador') is not null as ok`)).rows[0].ok;
const hayCache = (await cliente.query(`select to_regclass('ops.invalidacion') is not null as ok`)).rows[0].ok;
const hay0040 = (await cliente.query(`select to_regprocedure('ops.detecta_empates_sin_tanda(bigint)') is not null as ok`)).rows[0].ok;
const capacidadMedida = new Set();
/** 0032: mide la edición de un grupo (una vez por pasada). Va FUERA de la transacción del grupo. */
async function capacidadDeGrupo(grupoId) {
  if (!hay0032) return;
  const { rows: [g] } = await cliente.query('select competition_edition_id e from core.phase_group where id = $1', [grupoId]);
  if (!g || capacidadMedida.has(Number(g.e))) return;
  capacidadMedida.add(Number(g.e));
  await cliente.query('select analytics.recalcula_capacidad_edicion($1)', [g.e]);
}
/** 0032: casos raros de las ediciones tocadas y, si toca, los globales. */
async function casos(ediciones, globales) {
  if (!hay0032) return;
  const t = Date.now(); let abiertos = 0;
  for (const e of ediciones) {
    try {
      const { rows: [r] } = await cliente.query('select ops.detecta_casos($1) r', [e]); abiertos += Number(r.r.abiertos);
      if (hay0040) await cliente.query('select ops.detecta_empates_sin_tanda($1)', [e]);   // 0040: empates de copa sin tanda
    }
    catch (error) { console.error(`  ✗ casos de la edición ${e}: ${error.message}`); await anotaFallo('casos_fallidos', error.message, { edicion: e }); }
  }
  if (globales) await cliente.query('select ops.detecta_casos(null)').catch((e) => anotaFallo('casos_fallidos', e.message, { ambito: 'global' }));
  console.log(`Casos de datos (0032): ${ediciones.length} ediciones revisadas · ${abiertos} abiertos en ellas · ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

/** Deja constancia de un fallo en ops.evento_app (0030) sin romper la pasada si no se puede. */
async function anotaFallo(tipo, mensaje, detalle) {
  if (!hayEventos) return;
  await cliente.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ('error', 'proyector', $1, $2, $3)`,
    [tipo, String(mensaje).slice(0, 500), detalle]).catch(() => {});
}

/** 0029: sanciones por edición, temporadas por persona (tandas de 2000) y, si toca, árbitros. */
async function capa0029(ediciones, personas, globales) {
  if (!hay0029) return;
  const t = Date.now();
  let sanciones = 0;
  for (const e of ediciones) {
    if (detener) break;
    try {
      await cliente.query('begin');
      const { rows: [r] } = await cliente.query('select analytics.proyecta_sanciones_edicion($1) as n', [e]);
      const { rows: afectadas } = await cliente.query('select distinct person_id from analytics.sancion_inferida where competition_edition_id = $1', [e]);
      await cliente.query('commit');
      sanciones += Number(r.n);
      for (const a of afectadas) personas.add(Number(a.person_id));
    } catch (error) {
      await cliente.query('rollback').catch(() => {});
      console.error(`  ✗ sanciones de la edición ${e}: ${error.message}`);
      await anotaFallo('sanciones_fallidas', error.message, { edicion: e });
    }
  }
  const lista = [...personas];
  let filas = 0;
  for (let i = 0; i < lista.length && !detener; i += 2000) {
    try {
      const { rows: [r] } = await cliente.query('select analytics.proyecta_temporadas($1::bigint[]) as n', [lista.slice(i, i + 2000)]);
      filas += Number(r.n);
    } catch (error) {
      console.error(`  ✗ temporadas, tanda ${i}: ${error.message}`);
      await anotaFallo('temporadas_fallidas', error.message, { tanda: i });
    }
  }
  // 0036: base del ojeo de esas personas (sus grupos de identidad enteros). La puntuación por quinta, que
  // compara con toda España, se recalcula al final si la pasada es global, y cada hora con --puntua-ojeo.
  const temporadasOjeo = new Set();
  if (hay0036) {
    for (let i = 0; i < lista.length && !detener; i += 2000) {
      try {
        const tanda = lista.slice(i, i + 2000);
        await cliente.query('select analytics.proyecta_ojeo($1::bigint[])', [tanda]);
        const { rows } = await cliente.query('select distinct season_id from analytics.ojeo_jugador where person_id = any($1::bigint[])', [tanda]);
        rows.forEach((r) => temporadasOjeo.add(Number(r.season_id)));
      } catch (error) {
        console.error(`  ✗ ojeo, tanda ${i}: ${error.message}`);
        await anotaFallo('ojeo_fallido', error.message, { tanda: i });
      }
    }
    if (globales && temporadasOjeo.size) await cliente.query('select analytics.puntua_ojeo($1::smallint[])', [[...temporadasOjeo]]);
  }
  let arbitros = '–';
  if (globales) {
    const { rows: [r] } = await cliente.query('select analytics.recalcula_arbitros() as n');
    arbitros = r.n;
  }
  console.log(`Minutos y disciplina (0029): ${ediciones.length} ediciones · ${sanciones} sanciones inferidas · ${filas} temporadas de jugador · árbitros ${arbitros} · ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

/** Identidad (0024): frecuencias, candidatos y grupos para una lista de personas, por tandas. */
async function identidad(personas) {
  if (!hayIdentidad || personas.length === 0) return;
  const t = Date.now();
  await cliente.query('select analytics.recalcula_frecuencias()');
  let candidatos = 0;
  for (let i = 0; i < personas.length && !detener; i += 2000) {
    const tanda = personas.slice(i, i + 2000);
    await cliente.query('begin');
    try {
      const { rows: [r] } = await cliente.query('select analytics.genera_candidatos($1::bigint[]) as n', [tanda]);
      // Los grupos se recalculan desde las personas de la tanda y las que acaban de quedar enlazadas con ellas.
      const { rows: vecinos } = await cliente.query(
        `select distinct unnest(array[person_a, person_b]) as id from core.identity_candidate
          where person_a = any($1::bigint[]) or person_b = any($1::bigint[])`, [tanda]);
      await cliente.query('select analytics.recalcula_grupos($1::bigint[])', [[...new Set([...tanda, ...vecinos.map((v) => Number(v.id))])]]);
      await cliente.query('commit');
      candidatos += Number(r.n);
    } catch (error) {
      await cliente.query('rollback').catch(() => {});
      console.error(`  ✗ identidad, tanda ${i}: ${error.message}`);
    }
  }
  const { rows: [res] } = await cliente.query(
    `select count(*) filter (where estado = 'propuesto')::int as automaticos, count(*) filter (where estado = 'pendiente')::int as pendientes
       from core.identity_candidate where model_version in ('nombre-tiempo-edad-v1', 'codigo-familia-v1')`);
  console.log(`Identidad: ${personas.length} personas revisadas, ${candidatos} candidatos nuevos · en total ${res.automaticos} enlaces automáticos y ${res.pendientes} por confirmar · ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

if (identidadTodo) {
  if (!hayIdentidad) { console.error('✗ Falta la migración 0024.'); process.exit(2); }
  const { rows } = await cliente.query('select person_id from analytics.persona_perfil where clave_nombre is not null order by person_id');
  console.log(`Identidad de todas las personas con nombre completo: ${rows.length}…`);
  await identidad(rows.map((r) => Number(r.person_id)));
  await cliente.end();
  process.exit(0);
}

if (puntuaOjeo) {
  // Tarea horaria: percentiles y puntuación del ojeo de la temporada en curso (los nuevos jugadores de las
  // pasadas de 15 minutos aparecen en el buscador con su puntuación como mucho una hora después).
  if (!hay0036) { console.error('✗ Falta la migración 0036.'); process.exit(2); }
  await cliente.query(`set statement_timeout = '600s'`);
  const t = Date.now();
  const { rows: [r] } = await cliente.query(
    `select analytics.puntua_ojeo(array[(select id from core.season order by orden desc limit 1)]::smallint[]) as n`);
  console.log(`Ojeo puntuado: ${r.n} jugadores de la temporada en curso · ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await cliente.end();
  process.exit(0);
}

if (temporadasTodo) {
  if (!hay0029) { console.error('✗ Falta la migración 0029.'); process.exit(2); }
  await cliente.query(`set statement_timeout = '600s'`);
  const { rows: ed } = await cliente.query('select id from core.competition_edition order by id');
  const { rows: pe } = await cliente.query('select distinct person_id from analytics.player_team_season_summary order by 1');
  console.log(`Temporadas de todo: ${ed.length} ediciones, ${pe.length} personas…`);
  if (hay0032) { for (const e of ed) await cliente.query('select analytics.recalcula_capacidad_edicion($1)', [e.id]); console.log('Capacidad medida en todas las ediciones (0032). Ojo: si alguna cambió a «no registra cambios», sube analytics.version_metricas o reproyecta esa federación.'); }
  await capa0029(ed.map((r) => Number(r.id)), new Set(pe.map((r) => Number(r.person_id))), true);
  await casos(ed.map((r) => Number(r.id)), true);
  await cliente.end();
  process.exit(0);
}

if (soloEstado) {
  const { rows } = await cliente.query(
    `select f.codigo as federacion, count(*)::int as pendientes ${FILTRO} group by f.codigo order by 2 desc`,
    [federacion],
  );
  const { rows: [hechos] } = await cliente.query(
    `select count(*)::int as grupos, coalesce(sum(jugadores),0)::int as filas_jugador,
            round(avg(duracion_ms))::int as ms_medio, max(proyectado_en) as ultima
       from analytics.proyeccion_grupo`,
  );
  console.log(`Proyectados: ${hechos.grupos} grupos · ${hechos.filas_jugador} filas de jugador · ${hechos.ms_medio ?? '–'} ms de media · última ${hechos.ultima ?? 'nunca'}`);
  if (rows.length === 0) console.log('Pendientes: ninguno ✓');
  for (const r of rows) console.log(`  ${r.federacion.padEnd(24)} ${r.pendientes} pendientes`);
  await cliente.end();
  process.exit(0);
}


const grupos = grupoSuelto !== null
  ? [{ id: Number(grupoSuelto), federacion: '(suelto)', temporada: '' }]
  : (await cliente.query(
    `select pp.phase_group_id as id, f.codigo as federacion, s.etiqueta as temporada ${FILTRO}
      order by s.orden desc, pp.phase_group_id
      limit $2`,
    [federacion, limite],
  )).rows;

if (grupos.length === 0) {
  console.log('Nada pendiente ✓');
  await cliente.end();
  process.exit(0);
}

console.log(`Proyectando ${grupos.length} grupos${federacion ? ` de ${federacion}` : ''} (pausa ${pausaMs} ms)…`);
await cliente.query(`set statement_timeout = '120s'`);

const inicio = Date.now();
const fallos = [];
let hechos = 0;
let personasTotal = 0;
const tocadas = new Set();
const edicionesTocadas = new Set();

for (const g of grupos) {
  if (detener) break;
  const t = Date.now();
  try {
    await capacidadDeGrupo(g.id);
    await cliente.query('begin');
    const { rows: [{ r }] } = await cliente.query('select analytics.proyecta_grupo($1) as r', [g.id]);
    await cliente.query('select analytics.proyecta_busqueda_grupo($1)', [g.id]);
    if (hayIdentidad) await cliente.query('select analytics.proyecta_tramos_grupo($1)', [g.id]);
    const personas = (r.personas ?? []).map(Number);
    if (personas.length > 0) {
      await cliente.query('select analytics.proyecta_carreras($1::bigint[])', [personas]);
      await cliente.query('select analytics.proyecta_busqueda_personas($1::bigint[])', [personas]);
      if (hayIdentidad) await cliente.query('select analytics.proyecta_perfiles($1::bigint[])', [personas]);
    }
    for (const p of personas) tocadas.add(p);
    if (r.edicion) edicionesTocadas.add(Number(r.edicion));
    // 0036: páginas de la web que hay que refrescar (la web las consume y llama a revalidateTag)
    if (hayCache) await cliente.query('select ops.invalida_grupo($1, $2::bigint[])', [g.id, personas]);
    await cliente.query('commit');
    hechos += 1;
    personasTotal += personas.length;
    if (hechos % 25 === 0 || grupos.length <= 25) {
      console.log(`  ✓ ${g.federacion} ${g.temporada} grupo ${g.id}: ${r.equipos} equipos, ${r.jugadores} jugadores, ${Date.now() - t} ms  [${hechos}/${grupos.length}]`);
    }
  } catch (error) {
    await cliente.query('rollback').catch(() => {});
    fallos.push({ grupo: g.id, federacion: g.federacion, motivo: error.message });
    await anotaFallo('grupo_fallido', error.message, { grupo: g.id, federacion: g.federacion, temporada: g.temporada });
    console.error(`  ✗ grupo ${g.id} (${g.federacion} ${g.temporada}): ${error.message}`);
  }
  if (pausaMs > 0) await new Promise((ok) => setTimeout(ok, pausaMs));
}

// Los cálculos de cierre (identidad, evolución, zonas, sanciones, árbitros) recorren TODO el canónico, no
// un grupo: el tope de 120 s de la proyección por grupo no sirve aquí. Medido el 23/10/2026: la primera
// pasada de `recalcula_arbitros()` sobre 1,2 M de partidos se pasa de 120 s. Se les da el mismo margen que
// a las reparaciones (600 s) y si aun así no cabe, se ve en ops.evento_app y se trocea.
await cliente.query(`set statement_timeout = '600s'`);
await identidad([...tocadas]);
await capa0029([...edicionesTocadas], tocadas, hechos > 0 && !sinGlobales);
await casos([...edicionesTocadas], hechos > 0 && !sinGlobales);
// Evolución de cada línea de equipo y zonas de ascenso/descenso aprendidas (0026). Es un cálculo global y
// barato (una fila por inscripción): se rehace entero cuando la pasada ha tocado algún grupo.
if (hechos > 0 && !sinGlobales && (await cliente.query(`select to_regclass('analytics.linea_equipo_temporada') is not null as ok`)).rows[0].ok) {
  const t = Date.now();
  const { rows: [ev] } = await cliente.query('select analytics.recalcula_evolucion() as n');
  const { rows: [zo] } = await cliente.query('select analytics.recalcula_zonas() as n');
  console.log(`Evolución: ${ev.n} movimientos entre temporadas · ${zo.n} familias de competición con zonas aprendidas · ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
// 0047: recuentos del canónico para `/canonico`. Antes se contaban las tablas de hechos en cada visita
// (19,5 M de apariciones). Se actualizan sólo en las pasadas completas (no en las de cada 15 minutos con
// `--sin-globales`): contar cuesta ~50 s y el resumen no cambia de un cuarto de hora a otro.
if (!sinGlobales && (await cliente.query(`select to_regprocedure('ops.actualiza_recuento_canonico()') is not null as ok`)).rows[0].ok) {
  const t = Date.now();
  await cliente.query('select ops.actualiza_recuento_canonico()');
  console.log(`Recuentos del canónico actualizados · ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
// Aviso a la web para que refresque ya las páginas tocadas (si no responde, las recoge ella sola cada minuto).
if (hayCache && hechos > 0 && process.env.WEB_URL && process.env.REVALIDAR_SECRETO) {
  await fetch(new URL('/api/revalidar', process.env.WEB_URL), {
    method: 'POST', headers: { authorization: `Bearer ${process.env.REVALIDAR_SECRETO}` }, signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
console.log(`Hecho: ${hechos} grupos, ${personasTotal} personas recalculadas, ${fallos.length} fallos, ${segundos} s.`);
if (fallos.length > 0) {
  console.log('Fallos (el grupo queda pendiente y se reintenta en la próxima pasada):');
  for (const f of fallos) console.log(`  · ${f.grupo} ${f.federacion}: ${f.motivo}`);
}
await cliente.end();
process.exit(fallos.length > 0 ? 1 : 0);
