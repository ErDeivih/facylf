#!/usr/bin/env node
/*
 * FUSIONA LAS INSCRIPCIONES PARTIDAS DE UN MISMO EQUIPO.
 *
 * El daño. Al reparar el calendario de 23 grupos de Cataluña desde sus actas, cada partido quedó enlazado a un
 * equipo-temporada NUEVO creado a partir del nombre que escribe el acta («ARO, C.E.»), mientras el calendario
 * —que sí publica código— ya tenía el suyo («ARO, C.E. A», código 5081, compartido con 10 inscripciones y sus
 * otras competiciones). Medido el 25/09/2026: **261 inscripciones** con 0 partidos y su gemela con los partidos.
 * La historia del equipo queda partida en dos, y una consulta por el código federativo responde 0 partidos.
 *
 * La causa está arreglada en el resolutor (`resolucion/inscripcion.ts`, paso 3.b): un nombre al que sólo le
 * falta el sufijo de equipo resuelve al único equipo del grupo que lo lleva. Esto arregla lo YA escrito.
 *
 * Qué hace, por pareja (mala → buena): repunta las referencias
 *
 *   core.match.home_team_entry_id · core.match.away_team_entry_id · core.appearance.team_entry_id ·
 *   core.match_event.team_entry_id · core.match_staff.team_entry_id · core.standing_snapshot.team_entry_id ·
 *   source.external_ref.canonical_id (la referencia contextual `ctx:…`) · core.team_alias (los literales se
 *   mudan a la buena: es la procedencia del nombre, no se pierde)
 *
 * y después retira la inscripción mala y su equipo-temporada si se queda sin ninguna inscripción, sin alias y
 * sin nada más que lo cite. Los equipos-temporada de las analíticas son resúmenes derivados: se cuentan y, si
 * tienen filas, la pareja se SALTA y se dice, porque no se toca un derivado a mano.
 *
 * Uso:
 *   node scripts/fusiona-inscripciones-partidas.mjs              · plan: dice qué haría y cuántas filas mueve
 *   node scripts/fusiona-inscripciones-partidas.mjs --aplicar    · lo hace, en transacción por pareja, con diario
 *   node scripts/fusiona-inscripciones-partidas.mjs --federacion cataluna
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// `pg` vive en el paquete canónico, no en la raíz: desde `scripts/` hay que resolverlo por su package.json.
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { Client } = requerir('pg');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'fusiones-inscripciones.json');
const DIARIO = join(RAIZ, 'pruebas', 'reconstruccion', 'fusiones-inscripciones.jsonl');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const aplicar = argumentos.includes('--aplicar');
const federacionPedida = arg('federacion');

function urlDe(variable) {
  const texto = readFileSync(join(RAIZ, '.env'), 'utf8');
  const m = new RegExp(`^${variable}=(.*)$`, 'm').exec(texto);
  if (!m) throw new Error(`Falta ${variable} en .env`);
  return m[1].trim().replace(/^"|"$/g, '');
}

/**
 * Columnas que apuntan a una inscripción. `analiticas` son resúmenes derivados: si tienen filas para la
 * inscripción mala, la pareja se salta en vez de mover un derivado a mano.
 */
const REFERENCIAS = [
  { tabla: 'core.match', columna: 'home_team_entry_id', derivada: false },
  { tabla: 'core.match', columna: 'away_team_entry_id', derivada: false },
  { tabla: 'core.appearance', columna: 'team_entry_id', derivada: false },
  { tabla: 'core.match_event', columna: 'team_entry_id', derivada: false },
  { tabla: 'core.match_staff', columna: 'team_entry_id', derivada: false },
  { tabla: 'core.standing_snapshot', columna: 'team_entry_id', derivada: false },
  { tabla: 'analytics.team_edition_summary', columna: 'team_entry_id', derivada: true },
  { tabla: 'analytics.player_team_season_summary', columna: 'team_entry_id', derivada: true },
];

/**
 * Las parejas: una inscripción SIN código cuya única diferencia con otra CON código del mismo grupo es el
 * sufijo de equipo (`A`–`D`). La normalización es la del canónico (`core.normaliza_nombre`), no una copia.
 * Sólo se acepta si el candidato con código es ÚNICO en el grupo: con `A` y `B` no se elige.
 *
 * Ojo con exigir que la inscripción mala NO acabe en letra: «CASSA, U.D.» termina en «d» y esa «d» es la
 * abreviatura de «Unión Deportiva». Exigirlo escondía cuatro parejas reales del grupo 55458432.
 */
const SQL_PAREJAS = `
with candidatas as (
  select te.id, te.phase_group_id, te.team_season_id, te.nombre_en_fuente, te.codigo_externo,
         te.metodo_resolucion, te.referencia_contextual,
         core.normaliza_nombre(te.nombre_en_fuente) as norm,
         (select count(*) from core.team_entry o where o.team_season_id = te.team_season_id) as inscripciones,
         (select count(*) from core.match m where m.home_team_entry_id = te.id or m.away_team_entry_id = te.id) as partidos
    from core.team_entry te
), parejas as (
  select mala.id as mala, buena.id as buena, mala.phase_group_id,
         mala.team_season_id as equipo_malo, buena.team_season_id as equipo_bueno,
         mala.nombre_en_fuente as nombre_malo, buena.nombre_en_fuente as nombre_bueno,
         mala.norm as norm_mala, buena.codigo_externo as codigo_bueno,
         mala.inscripciones as inscripciones_malas, mala.partidos as partidos_malos,
         count(*) over (partition by mala.id) as candidatas
    from candidatas mala
    join candidatas buena
      on buena.phase_group_id = mala.phase_group_id
     and buena.codigo_externo is not null
     and buena.norm ~ ' [a-d]$'
     and regexp_replace(buena.norm, ' [a-d]$', '') = mala.norm
   where mala.codigo_externo is null
)
select p.*, pg.nombre as grupo, pg.codigo_externo as grupo_externo, e.nombre_publicado as competicion,
       s.etiqueta as temporada, f.nombre as federacion
  from parejas p
  join core.phase_group pg on pg.id = p.phase_group_id
  join core.competition_edition e on e.id = pg.competition_edition_id
  join core.season s on s.id = e.season_id
  join core.federation f on f.id = e.federation_id
 where ($1::text is null or f.codigo = $1)
 order by f.nombre, s.etiqueta, pg.codigo_externo, p.nombre_malo`;

async function main() {
  const lector = new Client({ connectionString: urlDe('DATABASE_URL_LECTOR') });
  await lector.connect();
  const { rows } = await lector.query(SQL_PAREJAS, [federacionPedida]);
  const parejas = [];
  for (const fila of rows) {
    const movidas = {};
    let derivadas = 0;
    for (const ref of REFERENCIAS) {
      const { rows: n } = await lector.query(
        `select count(*)::int n from ${ref.tabla} where ${ref.columna} = $1`, [Number(fila.mala)]);
      movidas[ref.tabla] = (movidas[ref.tabla] ?? 0) + n[0].n;
      if (ref.derivada) derivadas += n[0].n;
    }
    const { rows: alias } = await lector.query(
      'select count(*)::int n from core.team_alias where team_season_id = $1', [Number(fila.equipo_malo)]);
    /*
     * Y el riesgo que hay que descartar ANTES de tocar nada: si la inscripción mala y la buena se han
     * enfrentado entre sí en algún partido, repuntar dejaría un partido con el mismo equipo en los dos
     * lados. Eso no se arregla solo y no se toca: la pareja se salta y se dice.
     */
    const { rows: seEnfrentan } = await lector.query(
      `select count(*)::int n from core.match
        where (home_team_entry_id = $1 and away_team_entry_id = $2)
           or (home_team_entry_id = $2 and away_team_entry_id = $1)`, [Number(fila.mala), Number(fila.buena)]);
    /*
     * Las referencias externas (`source.external_ref`, donde vive el token contextual `ctx:…`) NO se pueden
     * contar en el plan: el rol de lectura no ve el esquema `source`, y esa prohibición es del diseño. Se
     * repuntan al aplicar, con el rol de escritura, y el diario anota cuántas fueron.
     */
    parejas.push({
      federacion: fila.federacion, temporada: fila.temporada, competicion: fila.competicion,
      grupo: fila.grupo_externo, fase: Number(fila.phase_group_id),
      mala: { id: Number(fila.mala), nombre: fila.nombre_malo, equipoTemporada: Number(fila.equipo_malo), inscripciones: Number(fila.inscripciones_malas) },
      buena: { id: Number(fila.buena), nombre: fila.nombre_bueno, codigo: fila.codigo_bueno, equipoTemporada: Number(fila.equipo_bueno) },
      candidatas: Number(fila.candidatas), partidos: Number(fila.partidos_malos),
      movidas, alias: alias[0].n, derivadas, seEnfrentan: seEnfrentan[0].n,
      /*
       * Aplicable si el candidato con código es único, si los dos equipos no se han enfrentado entre sí y si
       * ninguna fila derivada (analíticas) apunta a la inscripción mala. Que el equipo-temporada malo tenga
       * MÁS de una inscripción no lo descalifica: el equipo-temporada se comparte entre competiciones, y cada
       * grupo tiene su propia pareja que se fusiona por su cuenta.
       */
      aplicable: Number(fila.candidatas) === 1 && derivadas === 0 && seEnfrentan[0].n === 0,
    });
  }
  await lector.end();

  const aplicables = parejas.filter((p) => p.aplicable);
  const saltadas = parejas.filter((p) => !p.aplicable);
  const resumen = {
    cuando: new Date().toISOString(),
    parejas: parejas.length,
    aplicables: aplicables.length,
    saltadas: saltadas.length,
    filasAMover: aplicables.reduce((n, p) => n + Object.values(p.movidas).reduce((a, b) => a + b, 0), 0),
    partidosAMover: aplicables.reduce((n, p) => n + p.movidas['core.match'], 0),
    grupos: new Set(aplicables.map((p) => p.fase)).size,
  };
  writeFileSync(SALIDA, `${JSON.stringify({ resumen, parejas }, null, 1)}\n`, 'utf8');

  console.log(`${aplicar ? 'FUSIÓN' : 'PLAN DE FUSIÓN'} · inscripciones partidas del mismo equipo`);
  console.log(`  ${parejas.length} pareja(s) · ${aplicables.length} aplicable(s) · ${saltadas.length} saltada(s)`);
  console.log(`  ${resumen.partidosAMover} partido(s) y ${resumen.filasAMover} fila(s) en total · ${resumen.grupos} grupo(s)`);
  for (const p of aplicables.slice(0, 12)) {
    console.log(`    · ${p.grupo} (${p.temporada}): «${p.mala.nombre}» → «${p.buena.nombre}» (código ${p.buena.codigo}) · `
      + `${p.movidas['core.match']} partidos · ${p.movidas['core.appearance']} apariciones · ${p.alias} alias`);
  }
  if (aplicables.length > 12) console.log(`    … y ${aplicables.length - 12} más (todas en el JSON)`);
  for (const p of saltadas.slice(0, 6)) {
    console.log(`    ⚠ saltada ${p.grupo} «${p.mala.nombre}»: candidatas=${p.candidatas} `
      + `filas derivadas=${p.derivadas} partidos entre las dos=${p.seEnfrentan}`);
  }

  if (!aplicar) {
    console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
    console.log('  (plan: no se ha escrito nada; añade --aplicar para hacerlo)');
    return;
  }

  const escritor = new Client({ connectionString: urlDe('DATABASE_URL_PUBLICADOR') });
  await escritor.connect();
  let hechas = 0;
  for (const p of aplicables) {
    const movidas = {};
    await escritor.query('begin');
    try {
      const { rows: antes } = await escritor.query(
        `select te.*, ts.club_id, ts.season_id, ts.nombre as nombre_temporada, ts.categoria, ts.genero
           from core.team_entry te join core.team_season ts on ts.id = te.team_season_id where te.id = $1`, [p.mala.id]);
      for (const ref of REFERENCIAS) {
        const r = await escritor.query(`update ${ref.tabla} set ${ref.columna} = $1 where ${ref.columna} = $2`, [p.buena.id, p.mala.id]);
        if (r.rowCount > 0) movidas[ref.tabla] = (movidas[ref.tabla] ?? 0) + r.rowCount;
      }
      // La referencia contextual (`ctx:…`) apunta a la inscripción mala: se repunta para no dejar evidencia
      // huérfana. Se acota a `entity_type = 'equipo'` porque `canonical_id` es genérico: sin el filtro se
      // repuntarían referencias de personas o partidos que casualmente tengan el mismo número.
      const refs = await escritor.query(
        `update source.external_ref set canonical_id = $1 where entity_type = 'equipo' and canonical_id = $2`,
        [p.buena.id, p.mala.id]);
      if (refs.rowCount > 0) movidas['source.external_ref'] = refs.rowCount;
      // Los alias se MUDAN, no se borran: son las formas en que la fuente nombra a este equipo.
      const alias = await escritor.query(
        `insert into core.team_alias(team_season_id, federation_id, literal, visto_desde, visto_hasta)
         select $1, federation_id, literal, visto_desde, visto_hasta from core.team_alias where team_season_id = $2
         on conflict do nothing`, [p.buena.equipoTemporada, p.mala.equipoTemporada]);
      if (alias.rowCount > 0) movidas['core.team_alias'] = alias.rowCount;
      await escritor.query('delete from core.team_alias where team_season_id = $1', [p.mala.equipoTemporada]);
      await escritor.query('delete from core.team_entry where id = $1', [p.mala.id]);
      /*
       * El equipo-temporada malo sólo se retira si se queda vacío: sin inscripciones, sin alias y sin nada
       * más que lo cite. Si algo lo usa, se queda —un equipo-temporada huérfano es ruido, pero borrar algo
       * que otro usa rompe el canónico—.
       */
      const { rows: usos } = await escritor.query(
        `select (select count(*) from core.team_entry where team_season_id = $1) entradas,
                (select count(*) from core.team_alias where team_season_id = $1) alias`, [p.mala.equipoTemporada]);
      let equipoTemporadaRetirado = false;
      if (Number(usos[0].entradas) === 0 && Number(usos[0].alias) === 0) {
        const borrado = await escritor.query('delete from core.team_season where id = $1', [p.mala.equipoTemporada]);
        equipoTemporadaRetirado = borrado.rowCount > 0;
      }
      await escritor.query('commit');
      appendFileSync(DIARIO, `${JSON.stringify({
        cuando: new Date().toISOString(), fase: p.fase, grupo: p.grupo, federacion: p.federacion, temporada: p.temporada,
        fusion: { de: p.mala, a: p.buena }, movidas: { ...movidas, 'core.team_alias': movidas['core.team_alias'] ?? 0 },
        equipoTemporadaRetirado, equipoTemporadaMalo: antes[0] ?? null,
      })}\n`, 'utf8');
      hechas += 1;
    } catch (error) {
      await escritor.query('rollback');
      console.error(`  ✗ ${p.grupo} «${p.mala.nombre}»: no se pudo fusionar (${error.message})`);
    }
  }
  await escritor.end();
  console.log(`\n  ${hechas} de ${aplicables.length} pareja(s) fusionadas · diario en ${DIARIO.replace(`${RAIZ}\\`, '')}`);
  console.log('  para comprobarlo:  node scripts/mide-identidades-partidas.mjs');
}

await main();
if (!existsSync(DIARIO)) console.log('');
