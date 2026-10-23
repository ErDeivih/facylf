/*
 * ── LAS CONSULTAS DEL BUSCADOR DE INFORMES ──────────────────────────────────────────────────────────────
 *
 * Aquí están TODAS las consultas que necesita la página de pedir informes, juntas y explicadas, para que el
 * sistema sea reproducible sin IA. No inventa nada: lee el canónico por el rol de sólo lectura
 * (`DATABASE_URL_LECTOR`) y devuelve lo que hay.
 *
 * Las cuatro preguntas que contesta:
 *
 *   1. `catalogoDeFiltros()`  · qué temporadas, categorías y federaciones se pueden elegir (salen de la base,
 *      no de una lista escrita a mano que se quede vieja).
 *   2. `buscarEquipos()`      · qué inscripciones casan con el texto y los filtros. Una **inscripción es un
 *      equipo en una competición y temporada concretas** (`core.team_entry`), que es justo lo que el informe
 *      necesita: pasar el club no sirve, porque un club tiene decenas de equipos.
 *   3. `contextoDeEquipo()`   · todo lo que el generador necesita para ese equipo: su club, su categoría, su
 *      temporada, la inscripción **anterior** comparable y las categorías superiores del club. Es la misma
 *      lógica que ya usa `scripts/informes-dashboard.mjs`, extraída aquí para no duplicarla.
 *   4. `estadoDeCobertura()`  · ***la parte que decide si una temporada terminada entra en el informe***:
 *      `visibility_state = 'completa'` significa que están todas las jornadas, todos los resultados y todas
 *      las actas. Cualquier otro estado significa que falta algo, y con lo que falta los números mienten (una
 *      competición con 7 partidos de 26 se leería como una temporada con su balance). El generador ya filtra
 *      por eso; esto lo dice ANTES de generar, para que el usuario sepa qué va a salir.
 *
 * Normalización: el texto se pasa por `core.normaliza_nombre` (quita tildes, minúsculas, puntos→espacios)
 * porque las columnas `nombre_norm` y `nombre_en_fuente_norm` están rellenadas con esa misma función. Sin
 * eso, «Atlético» no encontraría «atletico» y «C.D. Navega» no encontraría nada.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { coberturaSql, temporadaActual, elegible, slugInforme } from './informes-politica.mjs';
import {mismoEquipoHistorico} from './equipo-identidad.mjs';
import {federacionPedida,codigosParaSql,federacionesReales,provinciaPublicada} from './informes-federaciones.mjs';

const requerir = createRequire(resolve('packages/canonico/package.json'));
/*
 * El certificado de cobertura es del GRUPO, no de la edición. `competition_edition.visibility_state` se
 * reescribe al importar cualquier grupo y puede describir otro grupo distinto
 * (docs/informes/REVISION-HISTORIAL-ALBA-2026-09-27.md), así que no sirve para contar qué entra en un
 * informe. Esta es la misma condición que aplica el generador (`coberturaSql`).
 */
const GRUPO_CERTIFICADO = (pg) => `exists(select 1 from ops.coverage_checkpoint cc_cert
  where cc_cert.phase_group_id=${pg}.id and cc_cert.visibility_state='completa' and cc_cert.completitud_historica)`;
const { Client } = requerir('pg');

/** Abre una conexión de sólo lectura. Quien llama debe cerrarla (`await c.end()`). */
export async function abreCanonico(connectionString) {
  const c = new Client({ connectionString, statement_timeout: 120000, application_name: 'informes-buscador' });
  await c.connect();
  return c;
}

/** Tilde, mayúscula y punto fuera, con la MISMA función que usó el importador al rellenar las columnas. */
export async function normaliza(c, texto) {
  const r = await c.query('select core.normaliza_nombre($1) as n', [String(texto ?? '')]);
  return r.rows[0].n;
}

/** 1. Los valores que pueden tomar los filtros, sacados de la propia base. */
export async function catalogoDeFiltros(c, { federacion = '' } = {}) {
  federacion = federacionPedida(federacion);
  const codigos = codigosParaSql(federacion);
  const temporadas = await c.query(`select s.etiqueta,
      count(distinct ce.id) as ediciones,
      count(distinct ce.id) filter (where ${GRUPO_CERTIFICADO('pg')}) as completas
    from core.season s
    join core.competition_edition ce on ce.season_id = s.id
    join core.phase_group pg on pg.competition_edition_id=ce.id
    join core.federation f on f.id=ce.federation_id
    where f.codigo = any($1::text[]) and s.etiqueta >= '2021-22' and s.etiqueta <= '${temporadaActual()}' and ${coberturaSql('ce')}
    group by s.etiqueta, s.orden having count(distinct ce.id) > 0
    order by s.orden desc`, [codigos]);
  const categorias = await c.query(`select ce.categoria, count(*) as ediciones
    from core.competition_edition ce join core.season s on s.id=ce.season_id join core.phase_group pg on pg.competition_edition_id=ce.id join core.federation f on f.id=ce.federation_id where ce.categoria is not null and f.codigo = any($1::text[])
    and s.etiqueta >= '2021-22' and s.etiqueta <= '${temporadaActual()}' and ${coberturaSql('ce')}
    group by 1 order by 2 desc`, [codigos]);
  const facetas=await c.query(`select distinct s.etiqueta as temporada, ce.categoria, ce.ambito,
      ce.modalidad, ce.genero, coalesce(ce.provincia,'') as provincia,
      ce.nombre_publicado as competicion, pg.nombre as grupo
    from core.competition_edition ce
    join core.federation f on f.id=ce.federation_id
    join core.season s on s.id=ce.season_id
    join core.phase_group pg on pg.competition_edition_id=ce.id
    where f.codigo = any($1::text[]) and s.etiqueta >= '2021-22'
      and s.etiqueta <= '${temporadaActual()}' and ${coberturaSql('ce')}
    order by temporada desc, categoria, ambito, provincia, competicion, grupo`, [codigos]);
  // Qué federaciones pueden dar hoy algún informe: las reales que tienen al menos un grupo consultable.
  const conDatos = await c.query(`select distinct f.codigo from core.federation f
    join core.competition_edition ce on ce.federation_id=f.id join core.season s on s.id=ce.season_id
    join core.phase_group pg on pg.competition_edition_id=ce.id
    where f.codigo = any($1::text[]) and s.etiqueta between '2021-22' and '${temporadaActual()}' and ${coberturaSql('ce')}`,
    [codigosParaSql('todas')]);
  const disponibles = new Set(conDatos.rows.map((x) => x.codigo));
  return {
    temporadaVigente:temporadaActual(),
    temporadas: temporadas.rows.map((t) => ({ etiqueta: t.etiqueta, ediciones: Number(t.ediciones), completas: Number(t.completas) })),
    categorias: categorias.rows.map((x) => ({ categoria: x.categoria, ediciones: Number(x.ediciones) })),
    federacion,
    federaciones: federacionesReales().map((x) => ({ codigo: x.codigo, nombre: x.nombre, disponible: disponibles.has(x.codigo) })),
    facetas:facetas.rows.map(x=>({...x,provincia:x.provincia||provinciaPublicada(x.grupo)})),
  };
}

/**
 * 2. Busca inscripciones. Devuelve, por cada una, lo que hace falta para decidir y para generar:
 * el estado de cobertura (¿entrará en el informe?), cuántos partidos tiene, cuántos con resultado y
 * cuántos jugadores aparecen en sus actas.
 *
 * `soloConDatos` deja fuera las inscripciones de competiciones que no tienen ni un partido: en un servidor con
 * 247.000 inscripciones, la mitad no aporta nada y sólo llena la pantalla.
 */
export async function buscarEquipos(c, { texto = '', temporada = temporadaActual(), categoria = '', federacion = 'castilla-leon', ambito = '', modalidad = '', genero = '', provincia = '', competicion = '', grupo = '', soloConDatos = true, limite = 60, offset = 0 } = {}) {
  temporada=temporada||temporadaActual();
  limite = Number.isFinite(Number(limite)) ? Math.max(1, Math.min(100, Math.trunc(Number(limite)))) : 60;
  offset = Number.isFinite(Number(offset)) ? Math.max(0, Math.min(10000, Math.trunc(Number(offset)))) : 0;
  federacion = federacionPedida(federacion);
  const patron = texto.trim() ? `%${(await normaliza(c, texto)).replace(/\s+/g, '%')}%` : null;
  const r = await c.query(`
    select te.id as inscripcion,
           cl.nombre_canonico as club,
           coalesce(nullif(te.nombre_en_fuente, ''), ts.nombre) as equipo,
           ts.categoria as categoria_equipo,
           ce.categoria, ce.nombre_publicado as competicion, (select visibility_state from ops.coverage_checkpoint where phase_group_id=pg.id) visibility_state,
           pg.nombre as grupo, pg.jornadas_previstas,
           s.etiqueta as temporada, s.orden,
           f.codigo as federacion,
           (select count(*) from core.match m where m.phase_group_id = pg.id) as partidos_grupo,
           (select count(*) from core.match m where m.phase_group_id = pg.id and m.goles_local is not null) as con_resultado,
           (select count(distinct a.person_id) from core.appearance a where a.team_entry_id = te.id) as jugadores
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id
      join core.federation f on f.id = ce.federation_id
     where ($1::text is null or cl.nombre_norm like $1 or te.nombre_en_fuente_norm like $1 or ts.nombre_norm like $1)
       and ($2::text = 'todas' or s.etiqueta = $2)
       and ($3::text = '' or ce.categoria = $3)
       and f.codigo = any($13::text[])
       and ($4::text = '' or ce.ambito = $4)
       and ($7::text = '' or ce.modalidad = $7)
       and ($8::text = '' or ce.genero = $8)
       and ($9::text = '' or ce.provincia = $9 or core.normaliza_nombre(pg.nombre) like '%' || core.normaliza_nombre($9) || '%')
       and ($10::text = '' or ce.nombre_publicado = $10)
       and ($11::text = '' or pg.nombre = $11)
       and s.etiqueta >= '2021-22' and s.etiqueta <= '${temporadaActual()}'
       and ${coberturaSql('ce')}
       and ($5::boolean is false or exists (select 1 from core.match m2 where m2.phase_group_id = pg.id))
     /*
      * El orden pone primero los equipos de los que se sabe algo. Sin texto en el buscador —o con un texto muy
      * común— se listan decenas de inscripciones, y las que no tienen ni una aparición no dan ningún informe
      * útil: salen detrás.
      */
     order by s.orden desc, jugadores desc, ce.categoria, cl.nombre_canonico, te.id
     limit $6 offset $12`, [patron, temporada, categoria, ambito, soloConDatos, limite, modalidad, genero, provincia, competicion, grupo, offset, codigosParaSql(federacion)]);
  return r.rows.map((x) => ({
    ...x,
    inscripcion: Number(x.inscripcion),
    jugadores: Number(x.jugadores),
    partidos_grupo: Number(x.partidos_grupo),
    con_resultado: Number(x.con_resultado),
    // Lo que decide si la temporada entra en el informe, dicho en una palabra.
    cobertura: x.temporada === temporadaActual() ? {nivel:'en-curso', texto:'Temporada actual', detalle:`${x.con_resultado} resultados disponibles; no incluye partidos futuros. La cobertura de actas puede ser parcial.`} : describeCobertura(x.visibility_state, Number(x.con_resultado), Number(x.partidos_grupo), x.jornadas_previstas),
  }));
}

/** Traduce el estado de la competición a algo que se pueda leer y decidir. */
export function describeCobertura(estado, conResultado, partidos, jornadasPrevistas) {
  if (estado === 'completa') {
    return { nivel: 'completa', texto: 'Grupo cerrado', detalle: 'Calendario y resultados completos; se han procesado las actas que ofrece la fuente. La cobertura de jugadores se detalla en el informe.' };
  }
  if (estado === 'verificada_hasta_jornada') {
    return { nivel: 'parcial', texto: 'Histórico pendiente de completar', detalle: 'No entra en el historial hasta que esté completo' };
  }
  if (estado === 'parcial_privada') {
    return { nivel: 'parcial', texto: 'Parcial', detalle: `${conResultado} de ${partidos} partidos: sus números no entran en el informe` };
  }
  return { nivel: 'oculta', texto: 'Cobertura sin verificar', detalle: 'No permite afirmar que la fuente no publique datos' };
}

/**
 * 3. Todo lo que el generador necesita de un equipo. Es la MISMA lógica de `informes-dashboard.mjs`,
 * extraída para no tener dos versiones que se separen:
 *   · la inscripción anterior comparable: mismo club, categoría y sección A/B/C, preferentemente con el
 *     mismo código de equipo de la federación; la división y el formato de comillas pueden cambiar;
 *   · las categorías superiores del club (para saber quién ha jugado por encima de su categoría).
 */
export async function contextoDeEquipo(c, inscripcion) {
  const { rows: [ctx] } = await c.query(`
    select te.id, te.codigo_externo, coalesce(nullif(te.nombre_en_fuente, ''), ts.nombre) as equipo, ts.categoria as categoria_equipo,
           ce.categoria, ce.federation_id, ce.nombre_publicado as competicion, (select visibility_state from ops.coverage_checkpoint where phase_group_id=pg.id) visibility_state,
           s.id as temporada, s.etiqueta, ts.club_id, cl.nombre_canonico as club,
           f.codigo as federacion, pg.nombre as grupo, pg.jornadas_previstas, pg.codigo_externo as grupo_codigo
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id
      join core.federation f on f.id = ce.federation_id
     where te.id = $1`, [inscripcion]);
  if (!ctx) return null;

  const year = Number(ctx.etiqueta.slice(0, 4));
  const anteriorEtiqueta = `${year - 1}-${String(year).slice(-2)}`;

  // La sección A/B/C del club se mantiene aunque cambien la división o las comillas del nombre publicado.
  const { rows: anteriores } = await c.query(`
    select te.id, te.codigo_externo, coalesce(nullif(te.nombre_en_fuente,''),ts.nombre) as equipo,
           ts.club_id, ce.categoria, s.id as temporada, s.etiqueta, ce.nombre_publicado as competicion,
           ce.visibility_state, (select count(*) from core.match m where m.phase_group_id=pg.id) as partidos
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id
     where ts.club_id = $1 and ce.categoria = $2 and s.etiqueta = $3
       and exists(select 1 from ops.coverage_checkpoint where phase_group_id=pg.id and visibility_state='completa' and completitud_historica) and ce.federation_id = $4`,
    [ctx.club_id, ctx.categoria, anteriorEtiqueta, ctx.federation_id]);
  const mismaSeccion=anteriores.filter(x=>mismoEquipoHistorico({...ctx,club:ctx.club,equipo:ctx.equipo},
    {...x,club:ctx.club})).sort((a,b)=>
    Number(String(b.codigo_externo)===String(ctx.codigo_externo))-Number(String(a.codigo_externo)===String(ctx.codigo_externo))
    || Number(b.partidos)-Number(a.partidos) || Number(a.id)-Number(b.id));

  // Las categorías superiores del club, para el cruce «ha jugado por encima de su categoría».
  const categorias = ['prebenjamin', 'benjamin', 'alevin', 'infantil', 'cadete', 'juvenil', 'aficionados'];
  const normal = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rango = categorias.indexOf(normal(ctx.categoria));
  const { rows: mayores } = rango < 0 ? { rows: [] } : await c.query(`
    select te.id, coalesce(nullif(te.nombre_en_fuente, ''), ts.nombre) as equipo,
           ce.nombre_publicado as competicion, s.etiqueta
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id
     where ts.club_id = $1 and ce.categoria = any($2::text[]) and s.etiqueta >= '2021-22'`,
    [ctx.club_id, categorias.slice(rango + 1)]);

  return {
    inscripcion: Number(ctx.id),
    club: ctx.club,
    clubId: ctx.club_id,
    equipo: ctx.equipo,
    categoria: ctx.categoria,
    competicion: ctx.competicion,
    grupo: ctx.grupo,
    grupoCodigo: ctx.grupo_codigo,
    jornadasPrevistas: ctx.jornadas_previstas,
    temporada: ctx.etiqueta,
    temporadaId: ctx.temporada,
    federacion: ctx.federacion,
    elegible: elegible(ctx.etiqueta, ctx.visibility_state),
    cobertura: ctx.etiqueta === temporadaActual() ? {nivel:'en-curso',texto:'Temporada actual',detalle:'Resultados disponibles hasta la fecha; cobertura de actas posiblemente parcial'} : describeCobertura(ctx.visibility_state, 0, 0, ctx.jornadas_previstas),
    anterior: mismaSeccion[0] || { id: 0, aviso: `Sin inscripción comparable de ${anteriorEtiqueta} para esta sección del club` },
    mayores,
    // El slug que usan el visor y el PDF, con la misma regla que el generador que ya existe.
    slug: slugInforme(ctx.equipo, ctx.categoria, ctx.etiqueta, ctx.id),
  };
}

/**
 * 4. Qué se puede usar en un informe, temporada a temporada. Cuenta GRUPOS, porque es el grupo lo que
 * el generador certifica: un grupo entra si tiene su certificado completo (`ops.coverage_checkpoint`
 * con `completitud_historica`). Antes contaba ediciones por `competition_edition.visibility_state`,
 * el indicador que la revisión del Alba (27/09) documentó como no fiable.
 *
 * `sin_certificar` incluye los grupos sin fila de cobertura: que no se haya calculado no es lo mismo
 * que estar completo.
 */
export async function estadoDeCobertura(c, { federacion = '' } = {}) {
  const r = await c.query(`
    select s.etiqueta, s.orden,
           count(distinct ce.id) as ediciones,
           count(distinct pg.id) as grupos,
           count(distinct pg.id) filter (where cc.visibility_state = 'completa' and cc.completitud_historica) as certificados,
           count(distinct pg.id) filter (where cc.visibility_state = 'verificada_hasta_jornada') as en_curso,
           count(distinct pg.id) filter (where cc.phase_group_id is null
             or not (cc.visibility_state = 'completa' and cc.completitud_historica)) as sin_certificar
      from core.season s
      join core.competition_edition ce on ce.season_id = s.id
      join core.phase_group pg on pg.competition_edition_id = ce.id
      join core.federation f on f.id = ce.federation_id
      left join ops.coverage_checkpoint cc on cc.phase_group_id = pg.id
     where ($1::text = '' or f.codigo = $1)
     group by 1, 2 having count(distinct pg.id) > 0 order by s.orden desc`, [federacion]);
  return r.rows.map((x) => ({
    etiqueta: x.etiqueta, orden: x.orden,
    ediciones: Number(x.ediciones), grupos: Number(x.grupos), certificados: Number(x.certificados),
    en_curso: Number(x.en_curso), sin_certificar: Number(x.sin_certificar),
  }));
}
