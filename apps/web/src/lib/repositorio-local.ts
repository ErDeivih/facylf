import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { unstable_noStore as noStore } from 'next/cache';
import type { Partido } from '@facylf/dominio';
import { parseaClasificacionHtml, type ClasificacionOficialHtml } from '@facylf/ingesta';
// Ventana de temporadas: la web enseña lo mismo que se recoge (2023-24 en adelante).
import { TEMPORADA_MINIMA, filtroVentana } from './temporadas';
import { estaExcluida } from './federaciones-excluidas';

export const FEDERACION_POR_DEFECTO = 'castilla-leon';

/**
 * TODAS las federaciones que el programa conoce, estén o no en esta web.
 *
 * Se deja completa a propósito, y la lista que se OFRECE se deriva de ella un poco más abajo. Reconocer un
 * código y ofrecerlo en un listado son cosas distintas: si una federación desapareciera de aquí,
 * `federacionDesde` caería a la federación por defecto y **una URL de esa federación enseñaría los datos de
 * otra** — que es exactamente el fallo que ya pasó con Cataluña y Baleares (ver el comentario de más abajo).
 */
const TODAS_LAS_FEDERACIONES = [
  { codigo: 'castilla-leon', nombre: 'Castilla y León', territorio: 'Castilla y León', carpeta: 'descargas-federacion' },
  { codigo: 'galicia', nombre: 'Galicia', territorio: 'Galicia', carpeta: 'descargas-galicia' },
  { codigo: 'asturias', nombre: 'Asturias', territorio: 'Asturias', carpeta: 'descargas-asturias' },
  { codigo: 'cantabria', nombre: 'Cantabria', territorio: 'Cantabria', carpeta: 'descargas-cantabria' },
  { codigo: 'aragon', nombre: 'Aragón', territorio: 'Aragón', carpeta: 'descargas-aragon' },
  { codigo: 'rioja', nombre: 'La Rioja', territorio: 'La Rioja', carpeta: 'descargas-rioja' },
  { codigo: 'extremadura', nombre: 'Extremadura', territorio: 'Extremadura', carpeta: 'descargas-extremadura' },
  { codigo: 'navarra', nombre: 'Navarra', territorio: 'Navarra', carpeta: 'descargas-navarra' },
  { codigo: 'euskadi', nombre: 'Euskadi', territorio: 'Euskadi', carpeta: 'descargas-euskadi' },
  { codigo: 'castilla-la-mancha', nombre: 'Castilla-La Mancha', territorio: 'Castilla-La Mancha', carpeta: 'descargas-castilla-la-mancha' },
  { codigo: 'andalucia', nombre: 'Andalucía', territorio: 'Andalucía', carpeta: 'descargas-andalucia' },
  { codigo: 'murcia', nombre: 'Región de Murcia', territorio: 'Región de Murcia', carpeta: 'descargas-murcia' },
  { codigo: 'canarias', nombre: 'Canarias', territorio: 'Canarias', carpeta: 'descargas-canarias' },
  { codigo: 'ceuta', nombre: 'Ceuta', territorio: 'Ceuta', carpeta: 'descargas-ceuta' },
  { codigo: 'madrid', nombre: 'Comunidad de Madrid', territorio: 'Comunidad de Madrid', carpeta: 'descargas-madrid' },
  { codigo: 'valencia', nombre: 'Comunidad Valenciana', territorio: 'Comunidad Valenciana', carpeta: 'descargas-valencia' },
  // Cataluña y Baleares se recolectan desde el 12/09/2026 (adaptador propio de la FCF y PNFG de la
  // FFIB) pero NO estaban en esta lista: como `federacionDesde` cae a la federación por defecto
  // cuando el código no se reconoce, sus páginas se servían contra la base de Castilla y León y
  // devolvían 404. Sin esta entrada, todo lo recolectado allí no habría llegado nunca a la web.
  { codigo: 'cataluna', nombre: 'Cataluña', territorio: 'Cataluña', carpeta: 'descargas-cataluna' },
  { codigo: 'baleares', nombre: 'Baleares', territorio: 'Illes Balears', carpeta: 'descargas-baleares' },
] as const;

/**
 * Las que esta web OFRECE: lista, selectores, encabezado y búsqueda.
 *
 * Aquí sí se quitan las excluidas (`FACYLF_EXCLUIR`, ver `lib/federaciones-excluidas.ts`). Desde el 24/09/2026
 * Valencia, Madrid y Cataluña se recogen en el PC de trabajo: lo que este servidor tiene de ellas es una foto
 * congelada que a partir de ahora se queda atrás, así que no se ofrecen hasta que su trabajo se una al canónico.
 */
export const FEDERACIONES_LOCALES = TODAS_LAS_FEDERACIONES.filter((f) => !estaExcluida(f.codigo));
export type FederacionCodigo = typeof TODAS_LAS_FEDERACIONES[number]['codigo'];

const raizProyecto = resolve(process.cwd(), '..', '..');
const conexiones = new Map<FederacionCodigo, DatabaseSync>();
const versionesPublicacion = new Map<FederacionCodigo, { version: number; comprobadaEn: number }>();

/**
 * ¿Es un código de federación que conocemos?
 *
 * Se comprueba contra TODAS, no contra las ofrecidas: una federación excluida sigue siendo un código válido, y
 * si aquí no lo fuera, `federacionDesde` la sustituiría por la federación por defecto y sus páginas enseñarían
 * datos de otra sin avisar. Que no se ofrezca en un listado no significa que su código no exista.
 */
export function esFederacionCodigo(valor: string): valor is FederacionCodigo {
  return TODAS_LAS_FEDERACIONES.some((f) => f.codigo === valor);
}

export function federacionDesde(valor: string | null | undefined): FederacionCodigo {
  return valor && esFederacionCodigo(valor) ? valor : FEDERACION_POR_DEFECTO;
}

export function datosFederacion(codigo: string) {
  return TODAS_LAS_FEDERACIONES.find((f) => f.codigo === codigo) ??
    TODAS_LAS_FEDERACIONES.find((f) => f.codigo === FEDERACION_POR_DEFECTO)!;
}

function rutaBaseDe(federacion: FederacionCodigo): string {
  if (federacion === FEDERACION_POR_DEFECTO && process.env.FACYLF_DB) return process.env.FACYLF_DB;
  return join(raizProyecto, datosFederacion(federacion).carpeta, 'recolector-local', 'cola-v2.sqlite');
}

function db(federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): DatabaseSync | null {
  // El worker escribe en estas bases mientras la web esta abierta. Evitamos que
  // Next conserve una instantanea para que una competicion aparezca en cuanto
  // pasa a estar completamente procesada.
  noStore();
  const existente = conexiones.get(federacion);
  if (existente) {
    preparaPublicables(existente, federacion);
    return existente;
  }
  const ruta = rutaBaseDe(federacion);
  if (!existsSync(ruta)) return null;
  const nueva = new DatabaseSync(ruta, { readOnly: true });
  conexiones.set(federacion, nueva);
  preparaPublicables(nueva, federacion);
  return nueva;
}

/** Una competicion se publica como una unidad: no se filtran grupos sueltos. Esto
 * evita mezclar datos parciales con estadisticas terminadas mientras el worker
 * sigue recorriendo otros grupos de la misma competicion. */
function grupoProcesado(alias: string, exigeActas: boolean): string {
  const tiposPendientes = exigeActas
    ? "'indice_jornadas','calendario','clasificacion','jornada','acta'"
    : "'indice_jornadas','calendario','clasificacion','jornada'";
  const actasCompletas = exigeActas ? `and not exists(select 1 from actas ap where ap.temporada=${alias}.temporada
      and ap.competicion=${alias}.competicion and ap.grupo=${alias}.codigo
      -- 'ausente_web' es una acta que la fuente NO publica (el recolector lo comprueba tres veces
      -- repartidas en días antes de marcarla así): exigirla dejaría su grupo sin publicar para
      -- siempre. Es el mismo criterio que ya se usa con los grupos que la fuente retiró.
      -- 'sin_datos' es una ficha que la federación SÍ publica pero vacía: se ha descargado entera y
      -- sus tablas de alineaciones y cuerpo técnico están en blanco (comprobado en el HTML archivado
      -- de la Copa del Rey de Euskadi, 14/09/2026). Exigirla bloquearía para siempre las
      -- eliminatorias, así que se cuenta como resuelta; su HTML queda archivado y se recupera sola
      -- si un parser mejor llega a leerla.
      and ap.estado not in ('hecha','ausente_web','sin_datos'))` : '';
  return `coalesce(${alias}.jornadas,0)>0
    and (select count(*) from jornadas jp where jp.temporada=${alias}.temporada
      and jp.competicion=${alias}.competicion and jp.grupo=${alias}.codigo
      and jp.archivo is not null)>=${alias}.jornadas
    and exists(select 1 from trabajos tc where tc.temporada=${alias}.temporada
      and tc.competicion=${alias}.competicion and tc.grupo=${alias}.codigo
      and tc.tipo='calendario' and tc.estado='hecho')
    and exists(select 1 from trabajos tcl where tcl.temporada=${alias}.temporada
      and tcl.competicion=${alias}.competicion and tcl.grupo=${alias}.codigo
      and tcl.tipo='clasificacion' and tcl.estado='hecho')
    and not exists(select 1 from trabajos tp where tp.temporada=${alias}.temporada
      and tp.competicion=${alias}.competicion and tp.grupo=${alias}.codigo
      and tp.tipo in (${tiposPendientes})
      and tp.estado not in ('hecho','cancelado'))
    ${actasCompletas}`;
}

function preparaPublicables(base: DatabaseSync, federacion: FederacionCodigo): void {
  const filaVersion = base.prepare('pragma data_version').get() as { data_version?: number } | undefined;
  const version = Number(filaVersion?.data_version ?? 0);
  const anterior = versionesPublicacion.get(federacion);
  // Los workers escriben cada pocos segundos, de modo que data_version casi siempre cambia. La
  // publicación de una competición sólo puede cambiar al completar una unidad entera; revisar la
  // tabla temporal una vez por minuto mantiene los datos frescos sin recalcularla en cada clic.
  if (anterior && (anterior.version === version || Date.now() - anterior.comprobadaEn < 60_000)) return;
  // Madrid publica calendario, resultados, campos, árbitros y clasificación en su API pública,
  // pero las fichas individuales de acta quedan fuera del alcance del adaptador. Su unidad de
  // publicación se considera completa al terminar todos esos datos realmente disponibles.
  const condicionGrupo = grupoProcesado('gx', federacion !== 'madrid');
  base.exec(`create temp table if not exists web_competiciones_publicables (
    temporada text not null, competicion text not null, primary key (temporada,competicion)
  ); delete from temp.web_competiciones_publicables;
  insert into temp.web_competiciones_publicables (temporada,competicion)
    select c.temporada,c.codigo from competiciones c
    where c.grupos_comprobados_en is not null
      and exists(select 1 from grupos g0 where g0.temporada=c.temporada and g0.competicion=c.codigo
        and g0.estado<>'ausente_web')
      -- Los grupos que la fuente ya no publica (estado 'ausente_web') no pueden exigirse: no hay
      -- nada que recolectar en ellos. Sin este filtro, un grupo retirado o una eliminatoria
      -- cancelada dejaban la competicion entera invisible para siempre. El visor ya los excluia al
      -- contar grupos; aqui faltaba la misma exclusion.
      and not exists(select 1 from grupos gx where gx.temporada=c.temporada
        and gx.competicion=c.codigo and gx.estado<>'ausente_web' and not (${condicionGrupo}));`);
  versionesPublicacion.set(federacion, { version, comprobadaEn: Date.now() });
}

function competicionPublicable(alias: string): string {
  // Una sola puerta para todo lo que se enseña: competición publicada Y dentro de la ventana de
  // temporadas que se está recogiendo. Así ninguna consulta de la web puede saltarse el suelo.
  return `exists(select 1 from temp.web_competiciones_publicables wp
    where wp.temporada=${alias}.temporada and wp.competicion=${alias}.competicion)
    and ${filtroVentana(alias)}`;
}

function tieneTabla(base: DatabaseSync | null, nombre: string): boolean {
  return Boolean(base?.prepare("select 1 from sqlite_master where type='table' and name=?").get(nombre));
}

function conFederacion(valor: string, federacion: FederacionCodigo): string {
  return federacion === FEDERACION_POR_DEFECTO ? valor : `${federacion}--${valor}`;
}

function separaFederacion(valor: string): { federacion: FederacionCodigo; valor: string } {
  const indice = valor.indexOf('--');
  if (indice > 0) {
    const candidata = valor.slice(0, indice);
    if (esFederacionCodigo(candidata)) return { federacion: candidata, valor: valor.slice(indice + 2) };
  }
  return { federacion: FEDERACION_POR_DEFECTO, valor };
}

export const slugGrupo = (temporada: string, competicion: string, grupo: string,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) =>
  conFederacion(`t${temporada}-c${competicion}-g${grupo}`, federacion);
/**
 * Un código de equipo sólo se considera válido dentro de su contexto federativo.
 * El slug largo conserva la competición y el grupo exactos
 * para no mezclar, por ejemplo, el Juvenil A y el Alevín de un mismo club.
 * Se mantiene el slug corto como compatibilidad con enlaces antiguos.
 */
export const slugEquipo = (temporada: string, codigo: string, competicion?: string, grupo?: string,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) => conFederacion(competicion && grupo
    ? `t${temporada}-c${competicion}-g${grupo}-e${codigo}`
    : `t${temporada}-e${codigo}`, federacion);

/** Los codigos externos se conservan siempre dentro de su contexto. Aunque hoy no
 * haya colisiones de actas, el enlace no presupone que vayan a ser globales para
 * siempre. */
export const slugActa = (temporada: string, competicion: string, grupo: string,
  jornada: number, codigo: string, federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) =>
  conFederacion(`t${temporada}-c${competicion}-g${grupo}-j${jornada}-a${codigo}`, federacion);

/** La ficha de club agrupa equipos por nombre federativo conservador. El código que
 * inicia el enlace sólo sirve como semilla y no se trata como identidad global. */
export const slugClub = (temporada: string, codigo: string,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) =>
  conFederacion(`t${temporada}-e${codigo}`, federacion);

export const slugJugador = (codigo: string,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) => conFederacion(codigo, federacion);

function clavesGrupo(slug: string) {
  const m = /^t([^-]+)-c([^-]+)-g(.+)$/.exec(slug);
  return m ? { temporada: m[1]!, competicion: m[2]!, grupo: m[3]! } : null;
}

function clavesEquipo(slug: string) {
  const completa = /^t([^-]+)-c([^-]+)-g([^-]+)-e(.+)$/.exec(slug);
  if (completa) return {
    temporada: completa[1]!, competicion: completa[2]!, grupo: completa[3]!, codigo: completa[4]!,
  };
  const m = /^t([^-]+)-e(.+)$/.exec(slug);
  return m ? { temporada: m[1]!, competicion: null, grupo: null, codigo: m[2]! } : null;
}

function clavesActa(slug: string) {
  const completa = /^t([^-]+)-c([^-]+)-g([^-]+)-j(\d+)-a(.+)$/.exec(slug);
  return completa ? {
    temporada: completa[1]!, competicion: completa[2]!, grupo: completa[3]!,
    jornada: Number(completa[4]), codigo: completa[5]!,
  } : null;
}

export type AmbitoLocal = 'Nacional' | 'Regional' | 'Provincial' | 'Ascenso' | 'Otra';
export type ModalidadLocal = 'Fútbol' | 'Fútbol sala';
export type GeneroLocal = 'Masculina' | 'Femenina';

const sinAcentos = (valor: string) => valor.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const PROVINCIAS = [
  ['Ávila', 'avila'], ['Burgos', 'burgos'], ['León', 'leon'], ['Palencia', 'palencia'],
  ['Salamanca', 'salamanca'], ['Segovia', 'segovia'], ['Soria', 'soria'],
  ['Valladolid', 'valladolid'], ['Zamora', 'zamora'], ['El Bierzo', 'bierzo'],
] as const;

const ZONAS_OTRAS: Partial<Record<FederacionCodigo, ReadonlyArray<readonly [string, string]>>> = {
  galicia: [['A Coruña', 'coruna'], ['Ferrol', 'ferrol'], ['Lugo', 'lugo'], ['Ourense', 'ourense'],
    ['Pontevedra', 'pontevedra'], ['Santiago', 'santiago'], ['Vigo', 'vigo'], ['A Costa', 'costa']],
  asturias: [['Oviedo', 'oviedo'], ['Gijón', 'gijon'], ['Avilés', 'aviles'],
    ['Oriente', 'oriente'], ['Occidente', 'occidente']],
  aragon: [['Zaragoza', 'zaragoza'], ['Huesca', 'huesca'], ['Teruel', 'teruel']],
  extremadura: [['Badajoz', 'badajoz'], ['Cáceres', 'caceres']],
  navarra: [['Navarra', 'navarra'], ['Ribera', 'ribera']],
  euskadi: [['Álava', 'alava'], ['Araba', 'araba'], ['Bizkaia', 'bizkaia'],
    ['Gipuzkoa', 'gipuzkoa'], ['Guipúzcoa', 'guipuzcoa']],
  'castilla-la-mancha': [['Albacete', 'albacete'], ['Ciudad Real', 'ciudad real'],
    ['Cuenca', 'cuenca'], ['Guadalajara', 'guadalajara'], ['Toledo', 'toledo']],
  andalucia: [['Almería', 'almeria'], ['Cádiz', 'cadiz'], ['Córdoba', 'cordoba'],
    ['Granada', 'granada'], ['Huelva', 'huelva'], ['Jaén', 'jaen'],
    ['Málaga', 'malaga'], ['Sevilla', 'sevilla']],
  murcia: [['Murcia', 'murcia'], ['Cartagena', 'cartagena']],
  canarias: [['Gran Canaria', 'gran canaria'], ['Tenerife', 'tenerife'],
    ['Lanzarote', 'lanzarote'], ['Fuerteventura', 'fuerteventura'], ['La Palma', 'la palma'],
    ['La Gomera', 'la gomera'], ['El Hierro', 'el hierro']],
  ceuta: [['Ceuta', 'ceuta']],
  // La FFCV nombra sus grupos por provincia con la forma valenciana de la toponimia, así que se
  // aceptan las dos escrituras (Castelló/Castellón, Alacant/Alicante).
  valencia: [['Castellón', 'castello'], ['Castellón', 'castellon'], ['Valencia', 'valencia'],
    ['Alicante', 'alacant'], ['Alicante', 'alicante']],
  madrid: [['Madrid', 'madrid'], ['Alcalá', 'alcala'], ['Alcorcón', 'alcorcon'],
    ['Fuenlabrada', 'fuenlabrada'], ['Getafe', 'getafe'], ['Leganés', 'leganes'],
    ['Móstoles', 'mostoles']],
};

function categoriaDe(nombre: string): string {
  const n = sinAcentos(nombre);
  if (/prebenjamin|prebenxamin|pprebenxamin|debutante|zagal[ií]n|iniciacion|chupetin|biberon/.test(n)) return 'Prebenjamín';
  if (/benjamin|benxamin/.test(n)) return 'Benjamín';
  if (/alevin/.test(n)) return 'Alevín';
  if (/infantil/.test(n)) return 'Infantil';
  if (/cadete/.test(n)) return 'Cadete';
  if (/juvenil|xuvenil|liga nacional/.test(n)) return 'Juvenil';
  // "FFCV", "Lliga Comunitat" y "Lliga Preferent" son la forma valenciana de nombrar lo que en
  // otras territoriales se llama Primera Regional o Preferente: categoría de aficionados.
  if (/aficionado|senior|preferente|primera division|segunda division|tercera federacion|tercera division|futgal|asturfut|andaluza|autonomica|territorial|ffcv|lliga comunitat|lliga preferent|valenta/.test(n)) return 'Aficionados';
  if (/veteran/.test(n)) return 'Veteranos';
  return 'Otra';
}

function ambitoDe(nombre: string): AmbitoLocal {
  const n = sinAcentos(nombre);
  if (/ascenso|play.?off|promocion/.test(n)) return 'Ascenso';
  if (/primera federacion|segunda federacion|tercera federacion|tercera division|liga nacional|division de honor juvenil/.test(n)) return 'Nacional';
  if (/provincial/.test(n)) return 'Provincial';
  if (/comunitat|ffcv|lliga|valenta|regional|autonom|territorial|futgal|rffpa|asturfut|extremen|andaluz|mancheg|navarr|vasc|murcian|canari/.test(n)) return 'Regional';
  return 'Otra';
}

function provinciasDe(grupo: string, federacion: FederacionCodigo): string[] {
  const n = sinAcentos(grupo);
  const zonas = federacion === FEDERACION_POR_DEFECTO ? PROVINCIAS : (ZONAS_OTRAS[federacion] ?? []);
  return zonas.filter(([, clave]) => n.includes(clave)).map(([nombre]) => nombre);
}

function clasificaGrupo(nombre: string, grupo: string,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) {
  const completo = `${nombre} ${grupo}`;
  const provincias = provinciasDe(grupo, federacion);
  const ambito = ambitoDe(nombre);
  return {
    categoria: categoriaDe(nombre),
    ambito: ambito === 'Otra' && provincias.length ? 'Provincial' as const : ambito,
    provincias,
    modalidad: /futbol[-\s]+sala|futsal|\bf\.?s\.?\b/i.test(sinAcentos(completo)) ? 'Fútbol sala' as const : 'Fútbol' as const,
    // "Valenta" es el nombre que usa la FFCV para el fútbol femenino; "femeni" es su forma catalana.
    genero: /femenin|emakume|valenta|femeni/i.test(sinAcentos(completo)) ? 'Femenina' as const : 'Masculina' as const,
  };
}

export interface ResumenLocal {
  temporadas: number; competiciones: number; grupos: number; jornadas: number;
  partidos: number; resultados: number; actas: number; actasProcesadas: number;
  progresoGrupos: number; salamanca: number; jornadasEsperadas: number;
  calendariosListos: number; clasificacionesListas: number; gruposCompletos: number;
  actasCorrectas: number; actasRevisar: number;
}

export function resumenLocal(federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): ResumenLocal {
  const base = db(federacion);
  if (!base) return { temporadas: 0, competiciones: 0, grupos: 0, jornadas: 0, partidos: 0,
    resultados: 0, actas: 0, actasProcesadas: 0, progresoGrupos: 0, salamanca: 0,
    jornadasEsperadas: 0, calendariosListos: 0, clasificacionesListas: 0,
    gruposCompletos: 0, actasCorrectas: 0, actasRevisar: 0 };
  const uno = (sql: string) => Number((base.prepare(sql).get() as { n?: number } | undefined)?.n ?? 0);
  // Los recuentos de cabecera también respetan la ventana: son los números que el visitante usa para
  // hacerse una idea de lo que hay, y no pueden contar temporadas que ya no se recogen.
  const ventana = `temporada in (select codigo from temporadas where etiqueta >= '${TEMPORADA_MINIMA}')`;
  return {
    temporadas: uno(`select count(*) n from temporadas where etiqueta >= '${TEMPORADA_MINIMA}'`),
    competiciones: uno(`select count(*) n from competiciones where ${ventana}`),
    grupos: uno(`select count(*) n from grupos where ${ventana}`),
    // `jornadas` contiene también el índice previsto de cada grupo. Para una cifra rotulada como
    // "descargadas" sólo cuentan las páginas que tienen archivo; de otro modo la portada podía
    // mostrar 100 % nada más descubrir el calendario.
    jornadas: uno(`select count(*) n from jornadas where archivo is not null and ${ventana}`),
    partidos: tieneTabla(base, 'partidos') ? uno(`select count(*) n from partidos where ${ventana}`) : 0,
    resultados: tieneTabla(base, 'partidos') ? uno(`select count(*) n from partidos where goles_local is not null and ${ventana}`) : 0,
    actas: uno(`select count(*) n from actas where ${ventana}`),
    actasProcesadas: uno(`select count(*) n from actas where estado='hecha' and ${ventana}`),
    progresoGrupos: uno(`select count(*) n from competiciones where grupos_comprobados_en is not null and ${ventana}`),
    salamanca: uno(`select count(*) n from grupos where lower(nombre) like '%salamanca%' and ${ventana}`),
    jornadasEsperadas: uno(`select sum(coalesce(jornadas,0)) n from grupos where ${ventana}`),
    calendariosListos: uno(`select count(*) n from trabajos where tipo='calendario' and estado='hecho' and ${ventana}`),
    clasificacionesListas: uno(`select count(*) n from trabajos where tipo='clasificacion' and estado='hecho' and ${ventana}`),
    gruposCompletos: uno(`select count(*) n from grupos g where ${competicionPublicable('g')}`),
    actasCorrectas: uno(`select count(*) n from actas where estado='hecha' and calidad='correcta' and ${ventana}`),
    actasRevisar: uno(`select count(*) n from actas where estado='hecha' and calidad='revisar' and ${ventana}`),
  };
}

export interface EstadoFederacionLocal extends ResumenLocal {
  codigo: FederacionCodigo; nombre: string; territorio: string;
  trabajos: number; hechos: number; pendientes: number; gruposDescubiertos: number;
  gruposPorDescubrir: number; fase: string; avanceDescubrimiento: number;
}

/** Estado homogéneo de todas las bases. Sirve también cuando una federación sólo
 * ha empezado a descubrir el catálogo y todavía no contiene partidos. */
export function resumenFederacionesLocal(): EstadoFederacionLocal[] {
  return FEDERACIONES_LOCALES.map((federacion) => {
    const base = db(federacion.codigo);
    const resumen = resumenLocal(federacion.codigo);
    const n = (sql: string, ...parametros: Array<string | number>) => base
      ? Number((base.prepare(sql).get(...parametros) as { n?: number } | undefined)?.n ?? 0) : 0;
    const trabajos = n('select count(*) n from trabajos');
    const hechos = n("select count(*) n from trabajos where estado='hecho'");
    const pendientes = n("select count(*) n from trabajos where estado in ('pendiente','en_curso','bloqueado')");
    const gruposDescubiertos = n("select count(*) n from trabajos where tipo='grupos' and estado='hecho'");
    const gruposPorDescubrir = n("select count(*) n from trabajos where tipo='grupos' and estado in ('pendiente','en_curso','bloqueado')");
    const totalDescubrimiento = gruposDescubiertos + gruposPorDescubrir;
    const fase = gruposPorDescubrir > 0 ? 'Descubriendo competiciones y grupos'
      : resumen.jornadas === 0 ? 'Preparando calendarios y jornadas'
        : pendientes > 0 ? 'Incorporando jornadas y actas' : 'Catálogo recorrido';
    return { ...resumen, codigo: federacion.codigo, nombre: federacion.nombre,
      territorio: federacion.territorio, trabajos, hechos, pendientes,
      gruposDescubiertos, gruposPorDescubrir, fase,
      avanceDescubrimiento: totalDescubrimiento
        ? Math.round(gruposDescubiertos / totalDescubrimiento * 100) : 0 };
  });
}

export interface GrupoLocal {
  slug: string; federacion: FederacionCodigo; temporadaCodigo: string; temporada: string; competicionCodigo: string;
  grupoCodigo: string; nombre: string; grupo: string; jornadas: number;
  partidos: number; resultados: number; equipos: number; salamanca: boolean;
  categoria: string; ambito: AmbitoLocal; provincias: string[];
  modalidad: ModalidadLocal; genero: GeneroLocal;
}

export function listarGruposLocal(limite = 5000, desplazamiento = 0, consulta = '',
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): GrupoLocal[] {
  const base = db(federacion);
  if (!base) return [];
  const conPartidos = tieneTabla(base, 'partidos');
  const sql = `with resumen as (
      select temporada,competicion,grupo,count(*) partidos,
        sum(case when goles_local is not null then 1 else 0 end) resultados
      from partidos group by temporada,competicion,grupo
    ), participantes as (
      select temporada,competicion,grupo,equipo_local_codigo codigo from partidos where equipo_local_codigo is not null
      union
      select temporada,competicion,grupo,equipo_visitante_codigo codigo from partidos where equipo_visitante_codigo is not null
    ), conteo_equipos as (
      select temporada,competicion,grupo,count(*) equipos from participantes group by temporada,competicion,grupo
    ) select g.temporada temporadaCodigo,t.etiqueta temporada,
    g.competicion competicionCodigo,g.codigo grupoCodigo,c.nombre,g.nombre grupo,
    coalesce(g.jornadas,0) jornadas,
    ${conPartidos ? 'coalesce(r.partidos,0)' : '0'} partidos,
    ${conPartidos ? 'coalesce(r.resultados,0)' : '0'} resultados,
    ${conPartidos ? 'coalesce(ce.equipos,0)' : '0'} equipos
    from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
    join temporadas t on t.codigo=g.temporada
    ${conPartidos ? 'left join resumen r on r.temporada=g.temporada and r.competicion=g.competicion and r.grupo=g.codigo left join conteo_equipos ce on ce.temporada=g.temporada and ce.competicion=g.competicion and ce.grupo=g.codigo' : ''}
    where (${competicionPublicable('g')})
      and (?='' or lower(c.nombre||' '||g.nombre||' '||t.etiqueta) like '%'||lower(?)||'%')
    order by case when lower(g.nombre) like '%salamanca%' then 0 else 1 end,
      cast(g.temporada as integer) desc,c.nombre,g.nombre limit ? offset ?`;
  return (base.prepare(sql).all(consulta, consulta, limite, desplazamiento) as unknown as Array<
    Omit<GrupoLocal, 'slug' | 'federacion' | 'salamanca' | 'categoria' | 'ambito' | 'provincias' | 'modalidad' | 'genero'>>).map((r) => ({
      ...r, ...clasificaGrupo(r.nombre, r.grupo, federacion),
      federacion, slug: slugGrupo(r.temporadaCodigo, r.competicionCodigo, r.grupoCodigo, federacion),
      salamanca: sinAcentos(r.grupo).includes('salamanca'),
    }));
}

export interface FiltrosGruposLocal {
  consulta?: string; temporada?: string; categoria?: string; ambito?: string;
  provincia?: string; modalidad?: string; genero?: string; conDatos?: boolean;
  federacion?: FederacionCodigo;
}

export interface FacetasGruposLocal {
  temporadas: Array<{ codigo: string; etiqueta: string }>;
  categorias: string[]; ambitos: string[]; provincias: string[];
  modalidades: string[]; generos: string[];
}

/** Aplica todos los filtros a la vez. Las facetas siempre describen el catálogo completo. */
export function explorarGruposLocal(filtros: FiltrosGruposLocal = {}) {
  const federacion = filtros.federacion ?? FEDERACION_POR_DEFECTO;
  const todos = listarGruposLocal(10000, 0, '', federacion);
  const q = sinAcentos(filtros.consulta?.trim() ?? '');
  const codigosRecientes = new Set([...new Set(todos.map((g) => g.temporadaCodigo))]
    .sort((a, b) => Number(b) - Number(a)).slice(0, 5));
  const lista = todos.filter((g) =>
    (!q || sinAcentos(`${g.nombre} ${g.grupo} ${g.temporada}`).includes(q)) &&
    (!filtros.temporada || (filtros.temporada === 'ultimas-5'
      ? codigosRecientes.has(g.temporadaCodigo) : g.temporadaCodigo === filtros.temporada)) &&
    (!filtros.categoria || g.categoria === filtros.categoria) &&
    (!filtros.ambito || (filtros.ambito === 'Importantes'
      ? ['Nacional', 'Regional', 'Ascenso'].includes(g.ambito) : g.ambito === filtros.ambito)) &&
    (!filtros.provincia || g.provincias.includes(filtros.provincia)) &&
    (!filtros.modalidad || g.modalidad === filtros.modalidad) &&
    (!filtros.genero || g.genero === filtros.genero) &&
    (!filtros.conDatos || g.partidos > 0));
  const unicos = (valores: string[]) => [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'));
  const temporadas = [...new Map(todos.map((g) => [g.temporadaCodigo, {
    codigo: g.temporadaCodigo, etiqueta: g.temporada,
  }])).values()].sort((a, b) => Number(b.codigo) - Number(a.codigo));
  return {
    lista,
    facetas: {
      temporadas,
      categorias: unicos(todos.map((g) => g.categoria)),
      ambitos: ['Importantes', 'Nacional', 'Regional', 'Provincial', 'Ascenso', 'Otra']
        .filter((x) => x === 'Importantes' || todos.some((g) => g.ambito === x)),
      provincias: unicos(todos.flatMap((g) => g.provincias)),
      modalidades: ['Fútbol', 'Fútbol sala'].filter((x) => todos.some((g) => g.modalidad === x)),
      generos: ['Masculina', 'Femenina'].filter((x) => todos.some((g) => g.genero === x)),
    } satisfies FacetasGruposLocal,
  };
}

export interface PartidoLocal extends Partido {
  orden: number; codActa: string | null; codLocal: string | null; codVisitante: string | null;
  arbitro: string | null; campoCodigo: string | null; actaLista: boolean;
}

export interface CoberturaCompeticionLocal {
  jornadasEsperadas: number; jornadasGuardadas: number;
  actasLocalizadas: number; actasProcesadas: number;
  calendarioListo: boolean; clasificacionLista: boolean;
  trabajosPendientes: number; porcentaje: number; completa: boolean;
  actasDisponibles: boolean;
}

export interface JugadorCompeticionLocal {
  codigo: string | null; nombre: string; equipo: string; equipoCodigo: string | null;
  convocatorias: number; partidos: number; titularidades: number; goles: number; tarjetas: number;
  minutosEstimados: number;
}

export interface TramoGolesLocal { tramo: string; goles: number }

export interface CompeticionLocal extends GrupoLocal {
  partidosLista: PartidoLocal[];
  cobertura: CoberturaCompeticionLocal;
  clasificacionOficial: ClasificacionOficialHtml[];
  jugadores: JugadorCompeticionLocal[];
  golesPorTramo: TramoGolesLocal[];
  esMenores: boolean;
}

const normalizaClave = (valor: string) => valor.toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

/** Sólo elimina marcadores de filial escritos entre comillas al final. No se quitan
 * palabras como Juvenil o Femenino ni se hace similitud difusa: una unión dudosa
 * debe revisarse antes de convertirse en identidad de club. */
const claveClub = (valor: string) => normalizaClave(valor
  .replace(/\s*["“”']\s*[a-z0-9]+\s*["“”']\s*$/i, '').trim());

function duracionEstimada(nombreCompeticion: string): number {
  if (/prebenjam[ií]n|benjam[ií]n/i.test(nombreCompeticion)) return 50;
  if (/alev[ií]n/i.test(nombreCompeticion)) return 60;
  if (/infantil/i.test(nombreCompeticion)) return 70;
  if (/cadete/i.test(nombreCompeticion)) return 80;
  return 90;
}

function tramoGol(minuto: number | null): string {
  if (minuto == null) return 'Sin minuto';
  if (minuto <= 15) return '0–15';
  if (minuto <= 30) return '16–30';
  if (minuto <= 45) return '31–45';
  if (minuto <= 60) return '46–60';
  if (minuto <= 75) return '61–75';
  return '76–90+';
}

export function competicionLocal(slug: string): CompeticionLocal | null {
  const contexto = separaFederacion(slug);
  const claves = clavesGrupo(contexto.valor);
  const base = db(contexto.federacion);
  if (!claves || !base) return null;
  // Consulta sólo el grupo solicitado. Antes se calculaban los contadores de
  // miles de grupos para después quedarse con uno, lo que hacía que una ficha
  // tardase varios segundos en abrirse.
  const grupoFila = base.prepare(`select g.temporada temporadaCodigo,t.etiqueta temporada,
    g.competicion competicionCodigo,g.codigo grupoCodigo,c.nombre,g.nombre grupo,
    coalesce(g.jornadas,0) jornadas,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo) partidos,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo and p.goles_local is not null) resultados,
    (select count(*) from (select equipo_local_codigo codigo from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo
      union select equipo_visitante_codigo from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo)) equipos
    from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
    join temporadas t on t.codigo=g.temporada
    where g.temporada=? and g.competicion=? and g.codigo=?
      and (${competicionPublicable('g')})`)
    .get(claves.temporada, claves.competicion, claves.grupo) as unknown as Omit<GrupoLocal,
      'slug' | 'federacion' | 'salamanca' | 'categoria' | 'ambito' | 'provincias' | 'modalidad' | 'genero'> | undefined;
  if (!grupoFila) return null;
  const grupo: GrupoLocal = { ...grupoFila, ...clasificaGrupo(grupoFila.nombre, grupoFila.grupo, contexto.federacion),
    federacion: contexto.federacion, slug, salamanca: sinAcentos(grupoFila.grupo).includes('salamanca') };
  const filasCrudas = tieneTabla(base, 'partidos') ? base.prepare(`select jornada,orden,codigo_acta codActa,
    equipo_local_codigo codLocal,equipo_visitante_codigo codVisitante,local,visitante,
    goles_local golesLocal,goles_visitante golesVisitante,fecha,hora,campo,campo_codigo campoCodigo,arbitro,
    exists(select 1 from actas a where a.codigo=partidos.codigo_acta and a.temporada=partidos.temporada
      and a.competicion=partidos.competicion and a.grupo=partidos.grupo and a.estado='hecha') actaLista
    from partidos where temporada=? and competicion=? and grupo=? order by jornada,orden`)
    .all(claves.temporada, claves.competicion, claves.grupo) as unknown as PartidoLocal[] : [];
  const filas = filasCrudas.map((p) => ({ ...p }));
  const numero = (sql: string, ...parametros: Array<string | number>) => Number(
    (base.prepare(sql).get(...parametros) as { n?: number } | undefined)?.n ?? 0);
  const parametros = [claves.temporada, claves.competicion, claves.grupo] as const;
  const jornadasGuardadas = numero(`select count(*) n from jornadas where temporada=? and competicion=?
    and grupo=? and archivo is not null`, ...parametros);
  const actasLocalizadas = numero('select count(*) n from actas where temporada=? and competicion=? and grupo=?', ...parametros);
  // Actas resueltas: analizadas, confirmadas como no publicadas por la fuente o publicadas sin datos.
  // Contar sólo las 'hecha' dejaría a un grupo eternamente «incompleto» por una ficha que la web no
  // sirve o que sirve vacía (las eliminatorias de Euskadi, por ejemplo).
  const actasProcesadas = numero(`select count(*) n from actas where temporada=? and competicion=?
    and grupo=? and estado in ('hecha','ausente_web','sin_datos')`, ...parametros);
  // Madrid no publicaba actas cuando se escribió esto; desde el 12/09/2026 sí las descarga (52.611
  // fichas encoladas), así que la disponibilidad se decide con los datos y no con el nombre de la
  // federación: si el grupo tiene actas registradas, cuentan en su cobertura.
  const actasDisponibles = contexto.federacion !== 'madrid' || actasLocalizadas > 0;
  const trabajosPendientes = numero(`select count(*) n from trabajos where temporada=? and competicion=?
    and grupo=? and tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and estado not in ('hecho','cancelado')`, ...parametros);
  const calendarioListo = numero(`select count(*) n from trabajos where temporada=? and competicion=?
    and grupo=? and tipo='calendario' and estado='hecho'`, ...parametros) > 0;
  const clasificacionLista = numero(`select count(*) n from trabajos where temporada=? and competicion=?
    and grupo=? and tipo='clasificacion' and estado='hecho'`, ...parametros) > 0;
  const jornadasEsperadas = grupo.jornadas;
  const paginasTotales = Math.max(1, jornadasEsperadas + (actasDisponibles ? actasLocalizadas : 0) + 2);
  const paginasListas = Math.min(jornadasEsperadas, jornadasGuardadas) +
    (actasDisponibles ? actasProcesadas : 0) +
    Number(calendarioListo) + Number(clasificacionLista);
  const completa = jornadasEsperadas > 0 && jornadasGuardadas >= jornadasEsperadas &&
    (!actasDisponibles || actasProcesadas >= actasLocalizadas) && calendarioListo &&
    clasificacionLista && trabajosPendientes === 0;
  const cobertura: CoberturaCompeticionLocal = {
    jornadasEsperadas, jornadasGuardadas, actasLocalizadas, actasProcesadas,
    calendarioListo, clasificacionLista, trabajosPendientes,
    porcentaje: completa ? 100 : Math.min(99, Math.round(paginasListas / paginasTotales * 100)),
    completa, actasDisponibles,
  };

  // El worker ya conserva esta pagina. Leerla aqui no añade ninguna peticion y
  // permite respetar la posicion y los puntos oficiales cuando hay sanciones.
  const carpetaGrupo = join(dirname(rutaBaseDe(contexto.federacion)),
    `t${claves.temporada}-${grupo.temporada}`, `comp-${claves.competicion}`,
    `grupo-${claves.grupo}`);
  let clasificacionOficial: ClasificacionOficialHtml[] = [];
  if (clasificacionLista) {
    // Dos formas de guardar la misma tabla oficial según la plataforma de origen: /pnfg/ devuelve
    // HTML y se interpreta con su parser; iSquad (Valencia) devuelve JSON y se guarda ya
    // normalizado con esos mismos campos. Se prefiere el JSON cuando existe.
    const rutaJson = join(carpetaGrupo, 'clasificacion.json');
    const rutaHtml = join(carpetaGrupo, 'clasificacion.html');
    // Los ficheros archivados se guardan comprimidos cuando pasan de 8 KB (el HTML de las
    // federaciones pnfg pesa 24-202 KB por acta y el disco es el recurso que antes se agota). Se
    // busca el fichero normal y, si no está, su versión `.gz`: así lo ya guardado sigue leyéndose.
    const lee = (ruta: string): Buffer | null => {
      if (existsSync(ruta)) return readFileSync(ruta);
      if (existsSync(`${ruta}.gz`)) { try { return gunzipSync(readFileSync(`${ruta}.gz`)); } catch { return null; } }
      return null;
    };
    try {
      const json = lee(rutaJson);
      if (json) {
        const filas = JSON.parse(json.toString('utf8'));
        if (Array.isArray(filas)) clasificacionOficial = filas as ClasificacionOficialHtml[];
      } else {
        const html = lee(rutaHtml);
        if (html) clasificacionOficial = parseaClasificacionHtml(html.toString('utf8'));
      }
    } catch { clasificacionOficial = []; }
  }

  const esMenores = /juvenil|cadete|infantil|alev[ií]n|benjam[ií]n|prebenjam[ií]n|sub[- ]?\d+/i.test(grupo.nombre);
  const jugadores: JugadorCompeticionLocal[] = [];
  const golesPorTramo = new Map<string, number>();
  if (tieneTabla(base, 'eventos_acta')) {
    const eventos = base.prepare(`select acta,tipo,subtipo,minuto,lado,jugador_codigo codigo,nombre
      from eventos_acta where temporada=? and competicion=? and grupo=?`).all(...parametros) as unknown as Array<{
        acta: string; tipo: string; subtipo: string | null; minuto: number | null; lado: string | null;
        codigo: string | null; nombre: string | null;
      }>;
    for (const evento of eventos.filter((e) => e.tipo === 'gol')) {
      const tramo = tramoGol(evento.minuto);
      golesPorTramo.set(tramo, (golesPorTramo.get(tramo) ?? 0) + 1);
    }
    if (tieneTabla(base, 'participaciones')) {
      const participaciones = base.prepare(`select p.acta,p.lado,p.condicion,p.jugador_codigo codigo,
        p.nombre,p.dorsal,case when p.lado='local' then m.local else m.visitante end equipo,
        case when p.lado='local' then m.equipo_local_codigo else m.equipo_visitante_codigo end equipoCodigo
        from participaciones p left join partidos m on m.temporada=p.temporada
          and m.competicion=p.competicion and m.grupo=p.grupo and m.jornada=p.jornada
          and m.codigo_acta=p.acta
        where p.temporada=? and p.competicion=? and p.grupo=?`).all(...parametros) as unknown as Array<{
          acta: string; lado: string; condicion: string; codigo: string | null;
          nombre: string; dorsal: number | null; equipo: string | null; equipoCodigo: string | null;
        }>;
      const duracion = duracionEstimada(grupo.nombre);
      const acumulado = new Map<string, JugadorCompeticionLocal>();
      const eventosPorPersona = new Map<string, typeof eventos>();
      for (const evento of eventos) {
        const clavesEvento = [evento.codigo ? `c:${evento.codigo}` : null,
          evento.nombre ? `n:${normalizaClave(evento.nombre)}` : null].filter(Boolean) as string[];
        for (const claveEvento of clavesEvento) {
          const clave = `${evento.acta}|${claveEvento}`;
          const lista = eventosPorPersona.get(clave) ?? [];
          lista.push(evento);
          eventosPorPersona.set(clave, lista);
        }
      }
      for (const p of participaciones) {
        const equipo = p.equipo ?? (p.lado === 'local' ? 'Local' : 'Visitante');
        const clavePersona = p.codigo ? `c:${p.codigo}` : `n:${normalizaClave(p.nombre)}`;
        const clave = `${clavePersona}:e:${p.equipoCodigo ?? normalizaClave(equipo)}`;
        const actual = acumulado.get(clave) ?? { codigo: p.codigo, nombre: p.nombre, equipo,
          equipoCodigo: p.equipoCodigo, convocatorias: 0, partidos: 0, titularidades: 0, goles: 0,
          tarjetas: 0, minutosEstimados: 0 };
        const clavesPersona = [p.codigo ? `c:${p.codigo}` : null, `n:${normalizaClave(p.nombre)}`]
          .filter(Boolean) as string[];
        const relacionados = [...new Set(clavesPersona.flatMap((clavePersona) =>
          eventosPorPersona.get(`${p.acta}|${clavePersona}`) ?? []))];
        const entra = relacionados.find((e) => e.tipo === 'entra')?.minuto ?? null;
        const sale = relacionados.find((e) => e.tipo === 'sale')?.minuto ?? null;
        const goles = relacionados.filter((e) => e.tipo === 'gol' && e.subtipo !== 'propia-puerta');
        const jugado = p.condicion === 'titulares' || entra != null || goles.length > 0;
        const inicio = p.condicion === 'titulares' ? 0 : entra;
        actual.convocatorias += 1;
        if (jugado) actual.partidos += 1;
        if (p.condicion === 'titulares') actual.titularidades += 1;
        if (jugado && inicio != null) actual.minutosEstimados += Math.max(0, (sale ?? duracion) - inicio);
        actual.goles += goles.length;
        actual.tarjetas += relacionados.filter((e) => ['amarilla', 'roja', 'doble-amarilla'].includes(e.tipo)).length;
        acumulado.set(clave, actual);
      }
      jugadores.push(...[...acumulado.values()].sort((a, b) => b.goles - a.goles || b.minutosEstimados - a.minutosEstimados));
    }
  }
  const ordenTramos = ['0–15', '16–30', '31–45', '46–60', '61–75', '76–90+', 'Sin minuto'];
  return { ...grupo, partidosLista: filas, cobertura, clasificacionOficial, jugadores,
    golesPorTramo: ordenTramos.map((tramo) => ({ tramo, goles: golesPorTramo.get(tramo) ?? 0 })), esMenores };
}

export interface EquipoLocal {
  slug: string; federacion: FederacionCodigo; temporadaCodigo: string; temporada: string; codigo: string; nombre: string;
  competicionCodigo: string; grupoCodigo: string; competicion: string; grupo: string; grupoSlug: string;
  categoria: string; provincias: string[]; partidos: number; jugados: number;
  golesFavor: number; golesContra: number;
}

export function listarEquiposLocal(limite = 5000, desplazamiento = 0, consulta = '',
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): EquipoLocal[] {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'partidos')) return [];
  const filas = base.prepare(`with apariciones as (
      select temporada,competicion,grupo,equipo_local_codigo codigo,local nombre,
        1 partidos,case when goles_local is not null then 1 else 0 end jugados,
        coalesce(goles_local,0) gf,coalesce(goles_visitante,0) gc from partidos where equipo_local_codigo is not null
      union all
      select temporada,competicion,grupo,equipo_visitante_codigo codigo,visitante nombre,
        1 partidos,case when goles_local is not null then 1 else 0 end jugados,
        coalesce(goles_visitante,0) gf,coalesce(goles_local,0) gc from partidos where equipo_visitante_codigo is not null
    ) select a.temporada temporadaCodigo,t.etiqueta temporada,a.competicion competicionCodigo,
      a.grupo grupoCodigo,c.nombre competicion,g.nombre grupo,a.codigo,max(a.nombre) nombre,
      sum(a.partidos) partidos,sum(a.jugados) jugados,sum(a.gf) golesFavor,sum(a.gc) golesContra
    from apariciones a join temporadas t on t.codigo=a.temporada
    join competiciones c on c.temporada=a.temporada and c.codigo=a.competicion
    join grupos g on g.temporada=a.temporada and g.competicion=a.competicion and g.codigo=a.grupo
    where (${competicionPublicable('g')})
      and (?='' or lower(a.nombre||' '||c.nombre||' '||g.nombre||' '||t.etiqueta) like '%'||lower(?)||'%')
    group by a.temporada,a.competicion,a.grupo,a.codigo,t.etiqueta,c.nombre,g.nombre
    order by cast(a.temporada as integer) desc,max(a.nombre),c.nombre,g.nombre limit ? offset ?`)
    .all(consulta, consulta, limite, desplazamiento) as unknown as Array<Omit<EquipoLocal,
      'slug' | 'federacion' | 'grupoSlug' | 'categoria' | 'provincias'>>;
  return filas.map((r) => ({ ...r, ...clasificaGrupo(r.competicion, r.grupo, federacion),
    federacion,
    slug: slugEquipo(r.temporadaCodigo, r.codigo, r.competicionCodigo, r.grupoCodigo, federacion),
    grupoSlug: slugGrupo(r.temporadaCodigo, r.competicionCodigo, r.grupoCodigo, federacion),
  }));
}

export interface JugadorEquipoLocal {
  codigo: string | null; nombre: string; convocatorias: number; partidos: number;
  titularidades: number; minutosEstimados: number; goles: number; tarjetas: number;
}

export function equipoLocal(slug: string): (EquipoLocal & {
  partidosLista: PartidoLocal[]; otrosContextos: EquipoLocal[];
  plantilla: JugadorEquipoLocal[]; esMenores: boolean;
}) | null {
  const contexto = separaFederacion(slug);
  const claves = clavesEquipo(contexto.valor);
  const base = db(contexto.federacion);
  if (!claves || !base) return null;
  const candidatos = listarEquiposLocal(10000, 0, '', contexto.federacion).filter((e) =>
    e.temporadaCodigo === claves.temporada && e.codigo === claves.codigo &&
    (!claves.competicion || e.competicionCodigo === claves.competicion) &&
    (!claves.grupo || e.grupoCodigo === claves.grupo));
  const equipo = candidatos[0];
  if (!equipo) return null;
  const partidosCrudos = tieneTabla(base, 'partidos') ? base.prepare(`select jornada,orden,codigo_acta codActa,
    equipo_local_codigo codLocal,equipo_visitante_codigo codVisitante,local,visitante,
    goles_local golesLocal,goles_visitante golesVisitante,fecha,hora,campo,campo_codigo campoCodigo,arbitro,
    exists(select 1 from actas a where a.codigo=partidos.codigo_acta and a.temporada=partidos.temporada
      and a.competicion=partidos.competicion and a.grupo=partidos.grupo and a.estado='hecha') actaLista
    from partidos where temporada=? and competicion=? and grupo=?
      and (equipo_local_codigo=? or equipo_visitante_codigo=?)
    order by jornada,orden`).all(equipo.temporadaCodigo, equipo.competicionCodigo,
      equipo.grupoCodigo, equipo.codigo, equipo.codigo) as unknown as PartidoLocal[] : [];
  const partidosLista = partidosCrudos.map((p) => ({ ...p }));
  const plantillaAcumulada = new Map<string, JugadorEquipoLocal>();
  if (tieneTabla(base, 'participaciones')) {
    const participaciones = base.prepare(`select p.acta,p.jugador_codigo codigo,p.nombre,p.condicion
      from participaciones p join partidos m on m.temporada=p.temporada and m.competicion=p.competicion
        and m.grupo=p.grupo and m.jornada=p.jornada and m.codigo_acta=p.acta
      where p.temporada=? and p.competicion=? and p.grupo=? and
        ((p.lado='local' and m.equipo_local_codigo=?) or
         (p.lado='visitante' and m.equipo_visitante_codigo=?))`)
      .all(equipo.temporadaCodigo, equipo.competicionCodigo, equipo.grupoCodigo,
        equipo.codigo, equipo.codigo) as unknown as Array<{
          acta: string; codigo: string | null; nombre: string; condicion: string;
        }>;
    const eventos = tieneTabla(base, 'eventos_acta') ? base.prepare(`select ev.acta,ev.tipo,ev.subtipo,ev.minuto,ev.jugador_codigo codigo,ev.nombre
      from eventos_acta ev join partidos m on m.temporada=ev.temporada and m.competicion=ev.competicion
        and m.grupo=ev.grupo and m.jornada=ev.jornada and m.codigo_acta=ev.acta
      where ev.temporada=? and ev.competicion=? and ev.grupo=? and
        ((ev.lado='local' and m.equipo_local_codigo=?) or
         (ev.lado='visitante' and m.equipo_visitante_codigo=?))`)
      .all(equipo.temporadaCodigo, equipo.competicionCodigo, equipo.grupoCodigo,
        equipo.codigo, equipo.codigo) as unknown as Array<{
          acta: string; tipo: string; subtipo: string | null; minuto: number | null;
          codigo: string | null; nombre: string | null;
        }> : [];
    const eventosPersona = new Map<string, typeof eventos>();
    for (const evento of eventos) {
      const personas = [evento.codigo ? `c:${evento.codigo}` : null,
        evento.nombre ? `n:${normalizaClave(evento.nombre)}` : null].filter(Boolean) as string[];
      for (const persona of personas) {
        const key = `${evento.acta}|${persona}`;
        eventosPersona.set(key, [...(eventosPersona.get(key) ?? []), evento]);
      }
    }
    const actasPersona = new Map<string, Set<string>>();
    for (const p of participaciones) {
      const persona = p.codigo ? `c:${p.codigo}` : `n:${normalizaClave(p.nombre)}`;
      const actas = actasPersona.get(persona) ?? new Set<string>();
      if (actas.has(p.acta)) continue;
      actas.add(p.acta); actasPersona.set(persona, actas);
      const clavesEvento = [p.codigo ? `c:${p.codigo}` : null, `n:${normalizaClave(p.nombre)}`]
        .filter(Boolean) as string[];
      const relacionados = [...new Set(clavesEvento.flatMap((claveEvento) =>
        eventosPersona.get(`${p.acta}|${claveEvento}`) ?? []))];
      const actual = plantillaAcumulada.get(persona) ?? { codigo: p.codigo, nombre: p.nombre,
        convocatorias: 0, partidos: 0, titularidades: 0, minutosEstimados: 0, goles: 0, tarjetas: 0 };
      const entrada = relacionados.filter((x) => x.tipo === 'entra' && x.minuto != null)
        .map((x) => x.minuto!).sort((a, b) => a - b)[0] ?? null;
      const salida = relacionados.filter((x) => x.tipo === 'sale' && x.minuto != null)
        .map((x) => x.minuto!).sort((a, b) => a - b)[0] ?? null;
      const goles = relacionados.filter((x) => x.tipo === 'gol' && x.subtipo !== 'propia-puerta');
      const jugado = p.condicion === 'titulares' || entrada != null || goles.length > 0;
      actual.convocatorias++;
      if (jugado) actual.partidos++;
      if (p.condicion === 'titulares') actual.titularidades++;
      const inicio = p.condicion === 'titulares' ? 0 : entrada;
      if (jugado && inicio != null) actual.minutosEstimados += Math.max(0,
        (salida ?? duracionEstimada(equipo.competicion)) - inicio);
      actual.goles += goles.length;
      actual.tarjetas += relacionados.filter((x) => ['amarilla', 'roja', 'doble-amarilla'].includes(x.tipo)).length;
      plantillaAcumulada.set(persona, actual);
    }
  }
  const otrosContextos = listarEquiposLocal(10000, 0, '', contexto.federacion).filter((e) =>
    normalizaClave(e.nombre) === normalizaClave(equipo.nombre) && e.slug !== equipo.slug);
  const plantilla = [...plantillaAcumulada.values()].sort((a, b) =>
    b.partidos - a.partidos || b.titularidades - a.titularidades || a.nombre.localeCompare(b.nombre, 'es'));
  const esMenores = ['Juvenil', 'Cadete', 'Infantil', 'Alevín', 'Benjamín', 'Prebenjamín'].includes(equipo.categoria);
  return { ...equipo, partidosLista, otrosContextos, plantilla, esMenores };
}

export interface ClubLocal {
  slug: string; federacion: FederacionCodigo; temporadaCodigo: string; temporada: string; codigo: string; nombre: string;
  equipos: EquipoLocal[]; historico: EquipoLocal[];
  campos: Array<{ codigo: string | null; nombre: string; partidos: number; comoLocal: number }>;
  partidos: number; jugados: number; golesFavor: number; golesContra: number;
}

/** Ficha federativa del club en una temporada. Los códigos siguen perteneciendo a
 * cada equipo; la agrupación de club usa el nombre exacto salvo sufijos de filial
 * inequívocos entre comillas. */
export function clubLocal(slug: string): ClubLocal | null {
  const contexto = separaFederacion(slug);
  const claves = clavesEquipo(contexto.valor);
  const base = db(contexto.federacion);
  if (!claves || claves.competicion || claves.grupo || !base) return null;
  const temporada = base.prepare('select etiqueta from temporadas where codigo=?')
    .get(claves.temporada) as { etiqueta?: string } | undefined;
  const fila = base.prepare('select nombre from equipos where temporada=? and codigo=?')
    .get(claves.temporada, claves.codigo) as { nombre?: string } | undefined;
  const todos = listarEquiposLocal(20000, 0, '', contexto.federacion);
  const nombreSemilla = fila?.nombre ?? todos.find((e) =>
    e.temporadaCodigo === claves.temporada && e.codigo === claves.codigo)?.nombre;
  if (!nombreSemilla || !temporada?.etiqueta) return null;
  const identidad = claveClub(nombreSemilla);
  const equipos = todos.filter((e) => e.temporadaCodigo === claves.temporada && claveClub(e.nombre) === identidad);
  // La semilla puede existir ya en la tabla de equipos aunque su competicion
  // siga en curso. En ese caso tampoco se publica una ficha de club parcial.
  if (!equipos.length) return null;
  const nombre = [...new Set(equipos.map((e) => e.nombre))]
    .sort((a, b) => a.length - b.length || a.localeCompare(b, 'es'))[0] ?? nombreSemilla;
  const historico = todos.filter((e) => e.temporadaCodigo !== claves.temporada && claveClub(e.nombre) === identidad);
  const codigos = [...new Set(equipos.map((e) => e.codigo))];
  const marcadores = codigos.map(() => '?').join(',') || '?';
  const parametrosCampos = codigos.length ? [claves.temporada, ...codigos, ...codigos]
    : [claves.temporada, claves.codigo, claves.codigo];
  const campos = base.prepare(`select p.campo_codigo codigo,p.campo nombre,count(*) partidos,
    sum(case when p.equipo_local_codigo in (${marcadores}) then 1 else 0 end) comoLocal
    from partidos p join grupos g on g.temporada=p.temporada
      and g.competicion=p.competicion and g.codigo=p.grupo
    where p.temporada=? and p.campo is not null and (${competicionPublicable('g')}) and
      (p.equipo_local_codigo in (${marcadores}) or p.equipo_visitante_codigo in (${marcadores}))
    group by p.campo_codigo,p.campo order by comoLocal desc,partidos desc,p.campo`).all(
      ...codigos, ...parametrosCampos) as unknown as Array<{
        codigo: string | null; nombre: string; partidos: number; comoLocal: number;
      }>;
  return {
    slug, federacion: contexto.federacion, temporadaCodigo: claves.temporada, temporada: temporada.etiqueta,
    codigo: claves.codigo, nombre, equipos, historico, campos,
    partidos: equipos.reduce((n, e) => n + e.partidos, 0),
    jugados: equipos.reduce((n, e) => n + e.jugados, 0),
    golesFavor: equipos.reduce((n, e) => n + e.golesFavor, 0),
    golesContra: equipos.reduce((n, e) => n + e.golesContra, 0),
  };
}

export interface JugadorLocal {
  codigo: string; federacion: FederacionCodigo; nombre: string; convocatorias: number; partidos: number;
  titularidades: number; temporadas: number; goles: number; golesPenalti: number;
  golesPropia: number; amarillas: number; doblesAmarillas: number; rojas: number;
  tarjetas: number;
}

export interface ActuacionJugadorLocal {
  temporadaCodigo: string; temporada: string; competicionCodigo: string; competicion: string;
  grupoCodigo: string; grupo: string; grupoSlug: string; categoria: string;
  jornada: number; acta: string; actaSlug: string; equipo: string | null;
  equipoCodigo: string | null; equipoSlug: string | null; rival: string | null;
  lado: string; condicion: string; dorsal: number | null; jugado: boolean;
  minutoEntrada: number | null; minutoSalida: number | null; minutosEstimados: number;
  goles: number; golesPenalti: number; golesPropia: number; amarillas: number;
  doblesAmarillas: number; rojas: number; resultado: 'G' | 'E' | 'P' | null;
}

export interface ContextoJugadorLocal {
  clave: string; temporadaCodigo: string; temporada: string; competicion: string;
  grupo: string; grupoSlug: string; categoria: string; equipo: string;
  equipoCodigo: string | null; equipoSlug: string | null; convocatorias: number;
  partidos: number; titularidades: number; suplenciasJugadas: number;
  minutosEstimados: number; goles: number; golesPenalti: number; golesPropia: number;
  amarillas: number; doblesAmarillas: number; rojas: number;
}

export interface TemporadaJugadorLocal {
  temporadaCodigo: string; temporada: string; equipos: number; convocatorias: number;
  partidos: number; titularidades: number; minutosEstimados: number; goles: number;
  golesPenalti: number; golesPropia: number; amarillas: number; doblesAmarillas: number;
  rojas: number;
}

export interface PerfilJugadorLocal extends JugadorLocal {
  alias: string[]; contextos: ContextoJugadorLocal[];
  porTemporada: TemporadaJugadorLocal[]; actuaciones: ActuacionJugadorLocal[];
}

/** El listado incluye base y adultos porque esta aplicación se ejecuta en local. Un
 * suplente convocado no cuenta como partido jugado salvo que exista una entrada (o un
 * gol que demuestre que participó). */
export function listarJugadoresLocal(limite = 5000, consulta = '',
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): JugadorLocal[] {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'participaciones')) return [];
  const eventos = tieneTabla(base, 'eventos_acta');
  const filas = base.prepare(`with apariciones as (
      select p.temporada,p.competicion,p.grupo,p.jornada,p.acta,p.jugador_codigo,max(p.nombre) nombre,
        max(case when p.condicion='titulares' then 1 else 0 end) titular
      from participaciones p join grupos g on g.temporada=p.temporada
        and g.competicion=p.competicion and g.codigo=p.grupo
      where p.jugador_codigo is not null and (${competicionPublicable('g')})
        and (?='' or lower(p.nombre) like '%'||lower(?)||'%')
      group by p.temporada,p.competicion,p.grupo,p.jornada,p.acta,p.jugador_codigo
    )${eventos ? `, participacion_confirmada as (
      select distinct ev.temporada,ev.competicion,ev.grupo,ev.jornada,ev.acta,ev.jugador_codigo
      from eventos_acta ev join grupos g on g.temporada=ev.temporada
        and g.competicion=ev.competicion and g.codigo=ev.grupo
      where ev.jugador_codigo is not null and ev.tipo in ('entra','gol')
        and (${competicionPublicable('g')})
    ), resumen_eventos as (
      select ev.jugador_codigo,
        sum(case when ev.tipo='gol' and coalesce(ev.subtipo,'normal')<>'propia-puerta' then 1 else 0 end) goles,
        sum(case when ev.tipo='gol' and ev.subtipo='penalti' then 1 else 0 end) golesPenalti,
        sum(case when ev.tipo='gol' and ev.subtipo='propia-puerta' then 1 else 0 end) golesPropia,
        sum(case when ev.tipo='amarilla' then 1 else 0 end) amarillas,
        sum(case when ev.tipo='doble-amarilla' then 1 else 0 end) doblesAmarillas,
        sum(case when ev.tipo='roja' then 1 else 0 end) rojas,
        sum(case when ev.tipo in ('amarilla','doble-amarilla','roja') then 1 else 0 end) tarjetas
      from eventos_acta ev join grupos g on g.temporada=ev.temporada
        and g.competicion=ev.competicion and g.codigo=ev.grupo
      where ev.jugador_codigo is not null and (${competicionPublicable('g')})
      group by ev.jugador_codigo
    )` : ''}
    select a.jugador_codigo codigo,max(a.nombre) nombre,count(*) convocatorias,
    sum(case when a.titular=1${eventos ? ' or pc.jugador_codigo is not null' : ''} then 1 else 0 end) partidos,
    sum(a.titular) titularidades,count(distinct a.temporada) temporadas,
    ${eventos ? 'coalesce(re.goles,0)' : '0'} goles,
    ${eventos ? 'coalesce(re.golesPenalti,0)' : '0'} golesPenalti,
    ${eventos ? 'coalesce(re.golesPropia,0)' : '0'} golesPropia,
    ${eventos ? 'coalesce(re.amarillas,0)' : '0'} amarillas,
    ${eventos ? 'coalesce(re.doblesAmarillas,0)' : '0'} doblesAmarillas,
    ${eventos ? 'coalesce(re.rojas,0)' : '0'} rojas,
    ${eventos ? 'coalesce(re.tarjetas,0)' : '0'} tarjetas
    from apariciones a
    ${eventos ? `left join participacion_confirmada pc on pc.temporada=a.temporada
      and pc.competicion=a.competicion and pc.grupo=a.grupo and pc.jornada=a.jornada
      and pc.acta=a.acta and pc.jugador_codigo=a.jugador_codigo
      left join resumen_eventos re on re.jugador_codigo=a.jugador_codigo` : ''}
    group by a.jugador_codigo${eventos ? ',re.goles,re.golesPenalti,re.golesPropia,re.amarillas,re.doblesAmarillas,re.rojas,re.tarjetas' : ''}
    order by partidos desc,convocatorias desc,nombre limit ?`).all(consulta, consulta, limite) as unknown as
      Array<Omit<JugadorLocal, 'federacion'>>;
  return filas.map((fila) => ({ ...fila, federacion }));
}

/** Compatibilidad con llamadas antiguas: la web local ya no oculta las categorías de base. */
export const listarJugadoresAdultos = listarJugadoresLocal;

export function jugadorLocal(codigo: string): PerfilJugadorLocal | null {
  const contexto = separaFederacion(codigo);
  const codigoExterno = contexto.valor;
  const base = db(contexto.federacion);
  if (!base || !tieneTabla(base, 'participaciones')) return null;
  const participaciones = base.prepare(`select p.temporada temporadaCodigo,t.etiqueta temporada,
    p.competicion competicionCodigo,p.grupo grupoCodigo,c.nombre competicion,g.nombre grupo,
    p.jornada,p.acta,p.lado,p.condicion,p.dorsal,p.nombre,
    case when p.lado='local' then m.local else m.visitante end equipo,
    case when p.lado='local' then m.equipo_local_codigo else m.equipo_visitante_codigo end equipoCodigo,
    case when p.lado='local' then m.visitante else m.local end rival,
    m.goles_local golesLocal,m.goles_visitante golesVisitante
    from participaciones p join temporadas t on t.codigo=p.temporada
    join competiciones c on c.temporada=p.temporada and c.codigo=p.competicion
    join grupos g on g.temporada=p.temporada and g.competicion=p.competicion and g.codigo=p.grupo
    left join partidos m on m.temporada=p.temporada and m.competicion=p.competicion
      and m.grupo=p.grupo and m.jornada=p.jornada and m.codigo_acta=p.acta
    where p.jugador_codigo=? and (${competicionPublicable('g')})
    order by cast(p.temporada as integer) desc,p.jornada desc`)
    .all(codigoExterno) as unknown as Array<{
      temporadaCodigo: string; temporada: string; competicionCodigo: string; grupoCodigo: string;
      competicion: string; grupo: string; jornada: number; acta: string; lado: string;
      condicion: string; dorsal: number | null; nombre: string; equipo: string | null;
      equipoCodigo: string | null; rival: string | null; golesLocal: number | null;
      golesVisitante: number | null;
    }>;
  if (!participaciones.length) return null;
  const eventos = tieneTabla(base, 'eventos_acta') ? base.prepare(`select ev.temporada,ev.competicion,ev.grupo,
    ev.jornada,ev.acta,ev.tipo,ev.subtipo,ev.minuto from eventos_acta ev
    join grupos g on g.temporada=ev.temporada and g.competicion=ev.competicion and g.codigo=ev.grupo
    where ev.jugador_codigo=? and (${competicionPublicable('g')}) order by ev.minuto,ev.orden`)
    .all(codigoExterno) as unknown as Array<{ temporada: string; competicion: string; grupo: string;
      jornada: number; acta: string; tipo: string; subtipo: string | null; minuto: number | null }> : [];
  const eventosPorActa = new Map<string, typeof eventos>();
  for (const evento of eventos) {
    const clave = `${evento.temporada}|${evento.competicion}|${evento.grupo}|${evento.jornada}|${evento.acta}`;
    eventosPorActa.set(clave, [...(eventosPorActa.get(clave) ?? []), evento]);
  }
  const alias = [...new Set(participaciones.map((p) => p.nombre).filter(Boolean))]
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
  const actuaciones: ActuacionJugadorLocal[] = [];
  const vistas = new Set<string>();
  for (const p of participaciones) {
    const claveActuacion = `${p.temporadaCodigo}|${p.competicionCodigo}|${p.grupoCodigo}|${p.jornada}|${p.acta}`;
    if (vistas.has(claveActuacion)) continue;
    vistas.add(claveActuacion);
    const ev = eventosPorActa.get(claveActuacion) ?? [];
    const entradas = ev.filter((e) => e.tipo === 'entra' && e.minuto != null).map((e) => e.minuto!);
    const salidas = ev.filter((e) => e.tipo === 'sale' && e.minuto != null).map((e) => e.minuto!);
    const minutoEntrada = entradas.length ? Math.min(...entradas) : null;
    const minutoSalida = salidas.length ? Math.min(...salidas) : null;
    const goles = ev.filter((e) => e.tipo === 'gol' && e.subtipo !== 'propia-puerta');
    const jugado = p.condicion === 'titulares' || minutoEntrada != null || goles.length > 0;
    const inicio = p.condicion === 'titulares' ? 0 : minutoEntrada;
    const duracion = duracionEstimada(p.competicion);
    const minutosEstimados = jugado && inicio != null
      ? Math.max(0, (minutoSalida ?? duracion) - inicio) : 0;
    let resultado: 'G' | 'E' | 'P' | null = null;
    if (p.golesLocal != null && p.golesVisitante != null) {
      if (p.golesLocal === p.golesVisitante) resultado = 'E';
      else resultado = (p.lado === 'local' ? p.golesLocal > p.golesVisitante
        : p.golesVisitante > p.golesLocal) ? 'G' : 'P';
    }
    const clasificacion = clasificaGrupo(p.competicion, p.grupo, contexto.federacion);
    actuaciones.push({ ...p, categoria: clasificacion.categoria, jugado, minutoEntrada,
      minutoSalida, minutosEstimados, resultado,
      grupoSlug: slugGrupo(p.temporadaCodigo, p.competicionCodigo, p.grupoCodigo, contexto.federacion),
      actaSlug: slugActa(p.temporadaCodigo, p.competicionCodigo, p.grupoCodigo, p.jornada, p.acta, contexto.federacion),
      equipoSlug: p.equipoCodigo ? slugEquipo(p.temporadaCodigo, p.equipoCodigo,
        p.competicionCodigo, p.grupoCodigo, contexto.federacion) : null,
      goles: goles.length, golesPenalti: goles.filter((e) => e.subtipo === 'penalti').length,
      golesPropia: ev.filter((e) => e.tipo === 'gol' && e.subtipo === 'propia-puerta').length,
      amarillas: ev.filter((e) => e.tipo === 'amarilla').length,
      doblesAmarillas: ev.filter((e) => e.tipo === 'doble-amarilla').length,
      rojas: ev.filter((e) => e.tipo === 'roja').length,
    });
  }
  const contextosMap = new Map<string, ContextoJugadorLocal>();
  for (const a of actuaciones) {
    const clave = `${a.temporadaCodigo}|${a.competicionCodigo}|${a.grupoCodigo}|${a.equipoCodigo ?? a.equipo}`;
    const actual = contextosMap.get(clave) ?? {
      clave, temporadaCodigo: a.temporadaCodigo, temporada: a.temporada,
      competicion: a.competicion, grupo: a.grupo, grupoSlug: a.grupoSlug,
      categoria: a.categoria, equipo: a.equipo ?? 'Equipo no enlazado',
      equipoCodigo: a.equipoCodigo, equipoSlug: a.equipoSlug, convocatorias: 0,
      partidos: 0, titularidades: 0, suplenciasJugadas: 0, minutosEstimados: 0,
      goles: 0, golesPenalti: 0, golesPropia: 0, amarillas: 0, doblesAmarillas: 0, rojas: 0,
    };
    actual.convocatorias++;
    if (a.jugado) actual.partidos++;
    if (a.condicion === 'titulares') actual.titularidades++;
    else if (a.jugado) actual.suplenciasJugadas++;
    actual.minutosEstimados += a.minutosEstimados;
    actual.goles += a.goles; actual.golesPenalti += a.golesPenalti; actual.golesPropia += a.golesPropia;
    actual.amarillas += a.amarillas; actual.doblesAmarillas += a.doblesAmarillas; actual.rojas += a.rojas;
    contextosMap.set(clave, actual);
  }
  const contextos = [...contextosMap.values()].sort((a, b) =>
    Number(b.temporadaCodigo) - Number(a.temporadaCodigo) || b.partidos - a.partidos);
  const temporadasMap = new Map<string, TemporadaJugadorLocal>();
  for (const c of contextos) {
    const actual = temporadasMap.get(c.temporadaCodigo) ?? {
      temporadaCodigo: c.temporadaCodigo, temporada: c.temporada, equipos: 0,
      convocatorias: 0, partidos: 0, titularidades: 0, minutosEstimados: 0,
      goles: 0, golesPenalti: 0, golesPropia: 0, amarillas: 0, doblesAmarillas: 0, rojas: 0,
    };
    actual.equipos++;
    actual.convocatorias += c.convocatorias; actual.partidos += c.partidos;
    actual.titularidades += c.titularidades; actual.minutosEstimados += c.minutosEstimados;
    actual.goles += c.goles; actual.golesPenalti += c.golesPenalti;
    actual.golesPropia += c.golesPropia; actual.amarillas += c.amarillas;
    actual.doblesAmarillas += c.doblesAmarillas; actual.rojas += c.rojas;
    temporadasMap.set(c.temporadaCodigo, actual);
  }
  const porTemporada = [...temporadasMap.values()].sort((a, b) => Number(b.temporadaCodigo) - Number(a.temporadaCodigo));
  const total = porTemporada.reduce((r, x) => ({
    convocatorias: r.convocatorias + x.convocatorias, partidos: r.partidos + x.partidos,
    titularidades: r.titularidades + x.titularidades, goles: r.goles + x.goles,
    golesPenalti: r.golesPenalti + x.golesPenalti, golesPropia: r.golesPropia + x.golesPropia,
    amarillas: r.amarillas + x.amarillas, doblesAmarillas: r.doblesAmarillas + x.doblesAmarillas,
    rojas: r.rojas + x.rojas,
  }), { convocatorias: 0, partidos: 0, titularidades: 0, goles: 0, golesPenalti: 0,
    golesPropia: 0, amarillas: 0, doblesAmarillas: 0, rojas: 0 });
  return { codigo: codigoExterno, federacion: contexto.federacion,
    nombre: alias[0] ?? participaciones[0]!.nombre, alias,
    temporadas: porTemporada.length, tarjetas: total.amarillas + total.doblesAmarillas + total.rojas,
    ...total, contextos, porTemporada, actuaciones };
}

export const jugadorAdulto = jugadorLocal;

export function facetasPartidos(federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'partidos')) return { arbitros: [], campos: [] };
  const arbitros = base.prepare(`select p.arbitro nombre,count(*) partidos from partidos p
    join grupos g on g.temporada=p.temporada and g.competicion=p.competicion and g.codigo=p.grupo
    where p.arbitro is not null and (${competicionPublicable('g')})
    group by p.arbitro order by partidos desc,nombre limit 250`).all() as unknown as Array<{ nombre: string; partidos: number }>;
  const campos = base.prepare(`select p.campo nombre,count(*) partidos from partidos p
    join grupos g on g.temporada=p.temporada and g.competicion=p.competicion and g.codigo=p.grupo
    where p.campo is not null and (${competicionPublicable('g')})
    group by p.campo order by partidos desc,nombre limit 250`).all() as unknown as Array<{ nombre: string; partidos: number }>;
  return { arbitros, campos };
}

export function listarTecnicosAdultos(limite = 1000,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO) {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'tecnicos_acta')) return [] as Array<{ nombre: string; rol: string; partidos: number; temporadas: number }>;
  return base.prepare(`select ta.nombre,ta.rol,count(distinct ta.acta) partidos,
    count(distinct ta.temporada) temporadas from tecnicos_acta ta
    join grupos g on g.temporada=ta.temporada and g.competicion=ta.competicion and g.codigo=ta.grupo
    where ta.menores=0 and (${competicionPublicable('g')})
    group by ta.nombre,ta.rol order by partidos desc,ta.nombre limit ?`)
    .all(limite) as unknown as Array<{ nombre: string; rol: string; partidos: number; temporadas: number }>;
}

export interface EquipoDestacado {
  slug: string; nombre: string; temporada: string; partidos: number;
  competicion: string; grupo: string; golesFavor: number; golesContra: number; puntos: number;
}

export interface EstadisticasLocales {
  equipos: EquipoDestacado[];
  goleadores: JugadorLocal[];
  habituales: JugadorLocal[];
  arbitros: Array<{ nombre: string; partidos: number }>;
  campos: Array<{ nombre: string; partidos: number }>;
}

/** Clasificaciones rápidas para la portada estadística. Se recalculan sobre lo ya estructurado. */
export function estadisticasLocales(federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): EstadisticasLocales {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'partidos')) return { equipos: [], goleadores: [], habituales: [], arbitros: [], campos: [] };
  const filas = base.prepare(`with apariciones as (
    select p.temporada,p.competicion,p.grupo,p.equipo_local_codigo codigo,p.local nombre,
      count(*) partidos,sum(p.goles_local) gf,sum(p.goles_visitante) gc,
      sum(case when p.goles_local>p.goles_visitante then 3 when p.goles_local=p.goles_visitante then 1 else 0 end) puntos
    from partidos p join grupos g on g.temporada=p.temporada
      and g.competicion=p.competicion and g.codigo=p.grupo
    where p.goles_local is not null and p.equipo_local_codigo is not null
      and (${competicionPublicable('g')})
    group by p.temporada,p.competicion,p.grupo,p.equipo_local_codigo,p.local
    union all
    select p.temporada,p.competicion,p.grupo,p.equipo_visitante_codigo codigo,p.visitante nombre,
      count(*) partidos,sum(p.goles_visitante) gf,sum(p.goles_local) gc,
      sum(case when p.goles_visitante>p.goles_local then 3 when p.goles_visitante=p.goles_local then 1 else 0 end) puntos
    from partidos p join grupos g on g.temporada=p.temporada
      and g.competicion=p.competicion and g.codigo=p.grupo
    where p.goles_local is not null and p.equipo_visitante_codigo is not null
      and (${competicionPublicable('g')})
    group by p.temporada,p.competicion,p.grupo,p.equipo_visitante_codigo,p.visitante
  ) select a.temporada,t.etiqueta temporadaEtiqueta,a.competicion competicionCodigo,
    a.grupo grupoCodigo,c.nombre competicion,g.nombre grupo,a.codigo,max(a.nombre) nombre,
    sum(a.partidos) partidos,sum(a.gf) golesFavor,sum(a.gc) golesContra,sum(a.puntos) puntos
    from apariciones a join temporadas t on t.codigo=a.temporada
    join competiciones c on c.temporada=a.temporada and c.codigo=a.competicion
    join grupos g on g.temporada=a.temporada and g.competicion=a.competicion and g.codigo=a.grupo
    group by a.temporada,a.competicion,a.grupo,a.codigo,t.etiqueta,c.nombre,g.nombre having sum(a.partidos)>=2
    order by sum(a.puntos) desc,sum(a.gf) desc limit 12`).all() as unknown as Array<{
      temporada: string; temporadaEtiqueta: string; competicionCodigo: string; grupoCodigo: string;
      competicion: string; grupo: string; codigo: string; nombre: string;
      partidos: number; golesFavor: number; golesContra: number; puntos: number;
    }>;
  const jugadores = listarJugadoresAdultos(1000, '', federacion);
  const facetas = facetasPartidos(federacion);
  return {
    equipos: filas.map((e) => ({ ...e, temporada: e.temporadaEtiqueta,
      slug: slugEquipo(e.temporada, e.codigo, e.competicionCodigo, e.grupoCodigo, federacion) })),
    goleadores: [...jugadores].filter((j) => j.goles > 0)
      .sort((a, b) => b.goles - a.goles || b.partidos - a.partidos).slice(0, 12),
    habituales: [...jugadores].sort((a, b) => b.partidos - a.partidos).slice(0, 12),
    arbitros: facetas.arbitros.slice(0, 12),
    campos: facetas.campos.slice(0, 12),
  };
}

export interface PartidoListado extends PartidoLocal {
  federacion: FederacionCodigo; temporadaCodigo: string; competicionCodigo: string; grupoCodigo: string;
  temporada: string; competicion: string; grupo: string; grupoSlug: string;
}

export function listarPartidosLocal(limite = 300,
  federacion: FederacionCodigo = FEDERACION_POR_DEFECTO): PartidoListado[] {
  const base = db(federacion);
  if (!base || !tieneTabla(base, 'partidos')) return [];
  const filas = base.prepare(`select p.temporada temporadaCodigo,t.etiqueta temporada,
    c.nombre competicion,g.nombre grupo,p.competicion competicionCodigo,p.grupo grupoCodigo,
    p.jornada,p.orden,p.codigo_acta codActa,p.equipo_local_codigo codLocal,
    p.equipo_visitante_codigo codVisitante,p.local,p.visitante,p.goles_local golesLocal,
    p.goles_visitante golesVisitante,p.fecha,p.hora,p.campo,p.campo_codigo campoCodigo,p.arbitro,
    exists(select 1 from actas a where a.codigo=p.codigo_acta and a.temporada=p.temporada
      and a.competicion=p.competicion and a.grupo=p.grupo and a.estado='hecha') actaLista
    from partidos p join temporadas t on t.codigo=p.temporada
    join competiciones c on c.temporada=p.temporada and c.codigo=p.competicion
    join grupos g on g.temporada=p.temporada and g.competicion=p.competicion and g.codigo=p.grupo
    where (${competicionPublicable('g')})
    order by case when lower(g.nombre) like '%salamanca%' then 0 else 1 end,
      cast(p.temporada as integer) desc,p.fecha desc,p.jornada desc limit ?`).all(limite) as unknown as
    Array<PartidoListado & { temporadaCodigo: string; competicionCodigo: string; grupoCodigo: string }>;
  return filas.map((p) => ({ ...p, federacion,
    grupoSlug: slugGrupo(p.temporadaCodigo, p.competicionCodigo, p.grupoCodigo, federacion) }));
}

/** Mismo nombre de competición y grupo a través de las temporadas, sin unir sus datos. */
export function variantesGrupoLocal(grupo: GrupoLocal): GrupoLocal[] {
  return listarGruposLocal(10000, 0, '', grupo.federacion).filter((g) => g.slug !== grupo.slug &&
    normalizaClave(g.nombre) === normalizaClave(grupo.nombre) &&
    normalizaClave(g.grupo) === normalizaClave(grupo.grupo));
}

export interface ParticipanteActaLocal {
  lado: string; condicion: string; orden: number; codigo: string | null;
  nombre: string; dorsal: number | null; portero: boolean;
}

export interface EventoActaLocal {
  orden: number; tipo: string; subtipo: string | null; minuto: number | null;
  minutoBase: number | null; minutoAnadido: number | null; lado: string | null;
  ladoBeneficiado: string | null; sujetoTipo: string | null;
  codigo: string | null; nombre: string | null;
}

export interface TecnicoActaLocal { lado: string; rol: string; nombre: string }

export interface ActaLocal {
  codigo: string; federacion: FederacionCodigo; temporadaCodigo: string; temporada: string;
  competicionCodigo: string; competicion: string; grupoCodigo: string; grupo: string;
  grupoSlug: string; jornada: number; menores: boolean; calidad: string | null;
  incidencias: string[]; partido: PartidoLocal | null;
  participantes: ParticipanteActaLocal[]; eventos: EventoActaLocal[]; tecnicos: TecnicoActaLocal[];
}

export function actaLocal(identificador: string): ActaLocal | null {
  const contexto = separaFederacion(identificador);
  const base = db(contexto.federacion);
  if (!base || !tieneTabla(base, 'actas')) return null;
  const claves = clavesActa(contexto.valor);
  const seleccion = `select a.codigo,a.temporada temporadaCodigo,t.etiqueta temporada,
    a.competicion competicionCodigo,c.nombre competicion,a.grupo grupoCodigo,g.nombre grupo,
    a.jornada,a.menores,a.calidad,a.incidencias
    from actas a join temporadas t on t.codigo=a.temporada
    join competiciones c on c.temporada=a.temporada and c.codigo=a.competicion
    join grupos g on g.temporada=a.temporada and g.competicion=a.competicion and g.codigo=a.grupo`;
  const cabecera = (claves
    ? base.prepare(`${seleccion} where a.temporada=? and a.competicion=? and a.grupo=?
        and a.jornada=? and a.codigo=? and a.estado='hecha'
        and (${competicionPublicable('g')}) limit 1`)
      .get(claves.temporada, claves.competicion, claves.grupo, claves.jornada, claves.codigo)
    : base.prepare(`${seleccion} where a.codigo=? and a.estado='hecha'
        and (${competicionPublicable('g')})
        order by cast(a.temporada as integer) desc limit 1`).get(contexto.valor)) as unknown as Omit<ActaLocal,
      'federacion' | 'grupoSlug' | 'partido' | 'participantes' | 'eventos' | 'tecnicos' | 'incidencias' | 'menores'> & {
        incidencias: string | null; menores: number;
      } | undefined;
  if (!cabecera) return null;
  const parametros = [cabecera.temporadaCodigo, cabecera.competicionCodigo, cabecera.grupoCodigo,
    cabecera.jornada, cabecera.codigo] as const;
  const partido = base.prepare(`select jornada,orden,codigo_acta codActa,equipo_local_codigo codLocal,
    equipo_visitante_codigo codVisitante,local,visitante,goles_local golesLocal,
    goles_visitante golesVisitante,fecha,hora,campo,campo_codigo campoCodigo,arbitro,1 actaLista
    from partidos where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=? limit 1`)
    .get(...parametros) as unknown as PartidoLocal | undefined;
  const participantes = tieneTabla(base, 'participaciones') ? base.prepare(`select lado,condicion,orden,
    jugador_codigo codigo,nombre,dorsal,portero from participaciones
    where temporada=? and competicion=? and grupo=? and jornada=? and acta=? order by lado,condicion,orden`)
    .all(...parametros) as unknown as Array<Omit<ParticipanteActaLocal, 'portero'> & { portero: number }> : [];
  const eventos = tieneTabla(base, 'eventos_acta') ? base.prepare(`select orden,tipo,subtipo,minuto,
    minuto_base minutoBase,minuto_anadido minutoAnadido,lado,lado_beneficiado ladoBeneficiado,
    sujeto_tipo sujetoTipo,jugador_codigo codigo,nombre from eventos_acta
    where temporada=? and competicion=? and grupo=? and jornada=? and acta=? order by minuto,orden`)
    .all(...parametros) as unknown as EventoActaLocal[] : [];
  const tecnicos = tieneTabla(base, 'tecnicos_acta') ? base.prepare(`select lado,rol,nombre from tecnicos_acta
    where temporada=? and competicion=? and grupo=? and jornada=? and acta=? order by lado,rol,nombre`)
    .all(...parametros) as unknown as TecnicoActaLocal[] : [];
  let incidencias: string[] = [];
  try {
    const leidas = JSON.parse(cabecera.incidencias ?? '[]') as unknown;
    incidencias = Array.isArray(leidas) ? leidas.map(String) : [];
  } catch { incidencias = []; }
  return { ...cabecera, federacion: contexto.federacion,
    menores: Boolean(cabecera.menores), incidencias,
    grupoSlug: slugGrupo(cabecera.temporadaCodigo, cabecera.competicionCodigo, cabecera.grupoCodigo, contexto.federacion),
    partido: partido ?? null,
    participantes: participantes.map((p) => ({ ...p, portero: Boolean(p.portero) })),
    eventos, tecnicos };
}

export const rutaDatosLocal = rutaBaseDe(FEDERACION_POR_DEFECTO);
