/**
 * Lectura de la cola SQLite de un recolector.
 *
 * Regla 1 del encargo: la SQLite se abre en SÃ“LO LECTURA y no se toca su WAL â€” los recolectores
 * siguen escribiendo mientras esto corre. AquÃ­ no hay una sola sentencia de escritura ni un `pragma`
 * que cambie el modo de diario: la conexiÃ³n es `readOnly` y todo lo demÃ¡s es `select`.
 */
import { codigoCanonicoDeFederacion } from '../resolucion/contexto.js';
import { DatabaseSync } from './sqlite.js';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, isAbsolute, join } from 'node:path';
import { equiposDeclaradosPorActa } from '../resolucion/equipos-acta.js';
import type { Procedencia } from '../resolucion/inscripcion.js';
import { produceInforme } from './vocabularios.js';
import { esPalabraDeDescanso } from '@facylf/ingesta';

/**
 * Maquetas cuyo vocabulario de descanso se comprueba. El nombre que hay en la cola es el literal que
 * publicó la fuente y no viene etiquetado con su maqueta, así que se prueba con todas las conocidas. Es
 * seguro porque la comparación es de palabra ENTERA y normalizada, y porque las cuatro comparten la misma
 * palabra medida (`descansa`); Euskadi añade `atsedena`.
 */
const MAQUETAS_CON_DESCANSO = ['pnfg-clasica', 'nova-widget', 'fcf', 'isquad'] as const;

/**
 * ¿Este literal es la palabra del descanso en alguna maqueta conocida?
 *
 * No es «contiene descanso»: es «ES descanso». `C.D. DESCANSO` no lo es, y un club con ese nombre no se
 * descarta. El vocabulario lo declara cada adaptador en `@facylf/ingesta`; aquí no se inventa ninguna lista.
 *
 * Se EXPORTA porque la tabla oficial archiva el mismo pseudo-equipo con su propio código («DESCANSA»,
 * `codequipo=5199186` en el grupo 5199185 de Aragón, medido el 26/09/2026) y el resolutor de la tabla oficial
 * tiene que reconocerlo con esta misma regla: si cada uno llevara su lista, un día una diría descanso y la otra
 * equipo, y se crearía la inscripción fantasma que `retirada.ts` ya tuvo que limpiar.
 */
export function esFilaDeDescanso(literal: string): boolean {
  return MAQUETAS_CON_DESCANSO.some((maqueta) => esPalabraDeDescanso(literal, maqueta));
}

/**
 * ¿Esta fila pone al MISMO equipo en los dos lados?
 *
 * No es un partido: un equipo no juega contra sí mismo. Y no es un caso de laboratorio — medido el 24/09/2026
 * hay **91 filas así en 20 grupos** de siete federaciones, todas con **dos códigos federativos distintos para
 * el mismo nombre** (el nombre publicado dos veces, con dos códigos, en la misma fila). El importador se niega
 * a elegir cuál va a cada lado —elegir sería inventar— y hasta ahora esa negativa **tumbaba el grupo entero**:
 * 14 de esos grupos son 219 partidos con resultado, bloqueados por 14 filas.
 *
 * La comparación es por nombre normalizado (mayúsculas, sin acentos, sin el marcador de estado que la fuente
 * pega al nombre) y también por código: dos filas del mismo equipo pueden venir con el nombre igual y los
 * códigos cambiados, o al revés.
 */
function esFilaImposible(local: string, visitante: string, codigoLocal?: string | null, codigoVisitante?: string | null): boolean {
  const limpia = (t: string) => String(t ?? '').replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const a = limpia(local);
  if (a !== '' && a === limpia(visitante)) return true;
  const ca = String(codigoLocal ?? '').trim();
  const cv = String(codigoVisitante ?? '').trim();
  return ca !== '' && ca === cv;
}

/**
 * Lee un fichero archivado, con o sin comprimir. Devuelve `null` si no estÃ¡: la ausencia de una
 * representaciÃ³n archivada no es un error, es que esa representaciÃ³n no existe para ese grupo.
 */
function leeArchivoDeTexto(ruta: string): string | null {
  for (const candidata of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(candidata)) continue;
    return /\.gz$/i.test(candidata)
      ? gunzipSync(readFileSync(candidata)).toString('utf8')
      : readFileSync(candidata, 'utf8');
  }
  return null;
}

export type FilaTemporada = { codigo: string; etiqueta: string; origen: string; comprobada_en: string | null };
export type FilaCompeticion = { temporada: string; codigo: string; nombre: string; origen: string; comprobada_en: string | null; grupos_comprobados_en: string | null };
export type FilaGrupo = { temporada: string; competicion: string; codigo: string; nombre: string; estado: string; jornadas: number | null; comprobado_en: string | null; jornadas_comprobadas_en: string | null };
export type FilaJornada = { temporada: string; competicion: string; grupo: string; numero: number; fecha: string | null; archivo: string | null; hash: string | null; comprobada_en: string | null };
export type FilaEquipo = { temporada: string; codigo: string; nombre: string; primera_jornada: number | null };
export type FilaPartido = {
  temporada: string; competicion: string; grupo: string; jornada: number; orden: number;
  codigo_acta: string | null; equipo_local_codigo: string | null; equipo_visitante_codigo: string | null;
  local: string; visitante: string; goles_local: number | null; goles_visitante: number | null;
  fecha: string | null; hora: string | null; campo: string | null; campo_codigo: string | null;
  arbitro: string | null; actualizado_en: string;
};
export type FilaActa = {
  codigo: string; temporada: string; competicion: string; grupo: string; jornada: number;
  menores: number; estado: string; archivo: string | null; hash: string | null;
  datos: string | null; comprobada_en: string | null; version_parser: number;
  calidad: string | null; incidencias: string | null;
};
export type FilaParticipacion = {
  temporada: string; competicion: string; grupo: string; jornada: number; acta: string;
  lado: string; condicion: string; orden: number; jugador_codigo: string | null; nombre: string;
  dorsal: number | null; portero: number; menores: number;
};
export type FilaEvento = {
  temporada: string; competicion: string; grupo: string; jornada: number; acta: string;
  orden: number; tipo: string; minuto: number | null; lado: string | null; jugador_codigo: string | null;
  nombre: string | null; menores: number; subtipo: string | null; minuto_base: number | null;
  minuto_anadido: number | null; sujeto_tipo: string | null; lado_beneficiado: string | null;
};
export type FilaTecnico = {
  temporada: string; competicion: string; grupo: string; jornada: number; acta: string;
  lado: string | null; rol: string; nombre: string; menores: number;
};
export type FilaPersona = { codigo: string; nombre: string; primera_acta: string | null; ultima_acta: string | null; actualizado_en: string };

/** Ãmbito de un grupo en la cola: la tupla completa, nunca una parte suelta. */
export type AmbitoGrupo = { temporada: string; competicion: string; grupo: string };

/** Carpetas cuyo nombre no coincide con el cÃ³digo de la federaciÃ³n (herencia del arranque del proyecto). */
const CARPETA_ESPECIAL: Record<string, string> = { 'castilla-leon': 'descargas-federacion' };

export class ColaOrigen {
  readonly ruta: string;
  private readonly db: DatabaseSync;

  constructor(ruta: string) {
    if (!existsSync(ruta)) throw new Error(`No existe la cola SQLite: ${ruta}`);
    this.ruta = ruta;
    /*
     * La cola está VIVA: el recolector de esa federación escribe en ella mientras se importa. Sin espera,
     * un bloqueo momentáneo mata la importación entera con «database is locked». Medido el 25/09/2026: el
     * importador masivo se cayó al arrancar por eso. Diez segundos de espera no cambian nada del
     * recolector —sólo cede el turno quien llega después— y evitan que una carga de horas se venga abajo.
     */
    this.db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  }

  static rutaDeFederacion(raiz: string, federacion: string): string {
    /*
     * Una cola distinta de la viva, sólo si se pide expresamente para ESA federación:
     * `FACYLF_COLA_CASTILLA_LEON=_traspaso\cyl-2026-27.sqlite`. Sirve para importar en el PC una temporada que
     * recoge el servidor (REPARTO-TEMPORADAS.md) a partir del paquete de `scripts/claude/extrae-temporada-cola.mjs`,
     * sin escribir nada en la cola viva del PC. El nombre lleva la federación para que una variable olvidada no
     * pueda desviar la importación de otra.
     */
    const forzada = process.env[`FACYLF_COLA_${federacion.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
    if (forzada) return isAbsolute(forzada) ? forzada : join(raiz, forzada);
    // El nombre puede venir con alias (`castilla-y-leon`, `federacion`): la carpeta y la cola son las de
    // Castilla y León. Sin esto, `--federacion castilla-y-leon` busca `descargas-castilla-y-leon` y no existe.
    const canonica = codigoCanonicoDeFederacion(federacion);
    const carpeta = CARPETA_ESPECIAL[canonica] ?? `descargas-${canonica}`;
    return join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
  }

  cierra(): void {
    this.db.close();
  }

  versionEsquema(): number {
    const fila = this.db.prepare("select valor from metadatos where clave = 'version_esquema'").get() as { valor?: string } | undefined;
    return Number(fila?.valor ?? 0);
  }

  temporadas(): FilaTemporada[] {
    return this.db.prepare('select codigo, etiqueta, origen, comprobada_en from temporadas order by cast(codigo as integer)').all() as unknown as FilaTemporada[];
  }

  temporadaPorCodigo(codigo: string): FilaTemporada | undefined {
    return this.db.prepare('select codigo, etiqueta, origen, comprobada_en from temporadas where codigo = ?').get(codigo) as unknown as FilaTemporada | undefined;
  }

  /** Temporada cuya etiqueta (2025-26) es la pedida â€” las etiquetas sÃ­ son comparables entre federaciones. */
  temporadaPorEtiqueta(etiqueta: string): FilaTemporada | undefined {
    return this.db.prepare('select codigo, etiqueta, origen, comprobada_en from temporadas where etiqueta = ?').get(etiqueta) as unknown as FilaTemporada | undefined;
  }

  competiciones(temporada?: string): FilaCompeticion[] {
    const sql = `select temporada, codigo, nombre, origen, comprobada_en, grupos_comprobados_en
      from competiciones ${temporada ? 'where temporada = ?' : ''} order by temporada, codigo`;
    const st = this.db.prepare(sql);
    return (temporada ? st.all(temporada) : st.all()) as unknown as FilaCompeticion[];
  }

  grupos(temporada: string, competicion?: string, grupo?: string): FilaGrupo[] {
    const condiciones = ['temporada = ?'];
    const parametros: Array<string> = [temporada];
    if (competicion) { condiciones.push('competicion = ?'); parametros.push(competicion); }
    if (grupo) { condiciones.push('codigo = ?'); parametros.push(grupo); }
    return this.db.prepare(`select temporada, competicion, codigo, nombre, estado, jornadas,
      comprobado_en, jornadas_comprobadas_en from grupos where ${condiciones.join(' and ')}
      order by competicion, codigo`).all(...parametros) as unknown as FilaGrupo[];
  }

  /** Grupos de una temporada que tienen algo que importar: alguna jornada o algÃºn partido. */
  gruposConDatos(temporada: string, grupo?: string): FilaGrupo[] {
    const parametros: Array<string> = [temporada];
    let filtro = '';
    if (grupo) { filtro = ' and g.codigo = ?'; parametros.push(grupo); }
    return this.db.prepare(`select g.temporada, g.competicion, g.codigo, g.nombre, g.estado, g.jornadas,
        g.comprobado_en, g.jornadas_comprobadas_en
      from grupos g
      where g.temporada = ?${filtro}
        and (exists (select 1 from jornadas j where j.temporada = g.temporada and j.competicion = g.competicion
              and j.grupo = g.codigo)
          or exists (select 1 from partidos p where p.temporada = g.temporada and p.competicion = g.competicion
              and p.grupo = g.codigo))
      order by g.competicion, g.codigo`).all(...parametros) as unknown as FilaGrupo[];
  }

  jornadas(ambito: AmbitoGrupo): FilaJornada[] {
    return this.db.prepare(`select temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en
      from jornadas where temporada = ? and competicion = ? and grupo = ? order by numero`)
      .all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as FilaJornada[];
  }

  equiposDeGrupo(ambito: AmbitoGrupo): FilaEquipo[] {
    const filas = this.db.prepare(`select distinct e.temporada, e.codigo, e.nombre, e.primera_jornada
      from equipos e
      where e.temporada = ?
        and (e.codigo in (select equipo_local_codigo from partidos where temporada = ? and competicion = ? and grupo = ?)
          or e.codigo in (select equipo_visitante_codigo from partidos where temporada = ? and competicion = ? and grupo = ?))
      order by e.nombre`).all(
      ambito.temporada, ambito.temporada, ambito.competicion, ambito.grupo,
      ambito.temporada, ambito.competicion, ambito.grupo,
    ) as unknown as FilaEquipo[];
    // El pseudo-equipo del descanso no es un equipo y no entra en el catálogo del grupo.
    return filas.filter((e) => !esFilaDeDescanso(e.nombre));
  }

  /**
   * TODAS las citas de equipo del Ã¡mbito, con o SIN cÃ³digo federativo.
   *
   * Es la pieza que faltaba: `equiposDeGrupo` filtra por `equipos.codigo`, asÃ­ que un equipo que la
   * fuente no publica con cÃ³digo no existÃ­a para el importador. Medido en Euskadi el 15/09/2026: 30.314
   * de 34.358 partidos no tienen cÃ³digo en ninguno de los dos lados, asÃ­ que casi todos sus equipos eran
   * invisibles y sus partidos quedaban sin equipos.
   *
   * Se reÃºne de las representaciones archivadas del MISMO Ã¡mbito â€”nunca se cruza un grupo con otro para
   * resolver un nombreâ€”:
   *
   * | procedencia | de dÃ³nde sale |
   * |---|---|
   * | `calendario` | `partidos.local` / `partidos.visitante`, con su cÃ³digo si la fila lo trae |
   * | `catalogo` | la tabla `equipos` de la temporada, para los cÃ³digos que juegan en el grupo |
   * | `acta` | la pareja que declara la cabecera del acta archivada |
   * | `clasificacion` | la clasificaciÃ³n archivada del grupo (`codequipo=<cÃ³digo>` con su nombre) |
   * | `jornada` | no aporta literales â€”la fila de `partidos` ES la jornada ya extraÃ­daâ€”, pero sitÃºa el |
   * |  | directorio del grupo, que es donde vive la clasificaciÃ³n archivada |
   *
   * Leer el HTML de la jornada desde aquÃ­ convertirÃ­a al importador en la fuente del calendario, que es
   * justo lo contrario del diseÃ±o: de eso se encarga `scripts/reconstruir-cola.mjs`, con su manifiesto y
   * su diario. Por eso `jornada` sÃ³lo aporta la ubicaciÃ³n.
   */
  citasDeEquipo(ambito: AmbitoGrupo): Array<{ literal: string; codigo: string | null; procedencia: Procedencia }> {
    const citas: Array<{ literal: string; codigo: string | null; procedencia: Procedencia }> = [];
    const vistos = new Set<string>();
    const anade = (literal: string | null | undefined, codigo: string | null, procedencia: Procedencia) => {
      const texto = String(literal ?? '').trim();
      if (!texto) return;
      const clave = `${procedencia}|${texto}|${codigo ?? ''}`;
      if (vistos.has(clave)) return;
      vistos.add(clave);
      citas.push({ literal: texto, codigo, procedencia });
    };

    for (const p of this.partidos(ambito)) {
      anade(p.local, p.equipo_local_codigo, 'calendario');
      anade(p.visitante, p.equipo_visitante_codigo, 'calendario');
    }
    for (const e of this.equiposDeGrupo(ambito)) anade(e.nombre, e.codigo, 'catalogo');

    // La pareja que declara el acta. Es la representaciÃ³n que trae el nombre LIMPIO, sin el marcador de
    // estado que la maqueta nova pega al del calendario: por eso aporta, y por eso vale como evidencia.
    for (const a of this.actas(ambito)) {
      const declarado = equiposDeclaradosPorActa(a.datos);
      if (!declarado) continue;
      anade(declarado.local, null, 'acta');
      anade(declarado.visitante, null, 'acta');
    }

    for (const par of this.clasificacionArchivada(ambito)) anade(par.nombre, par.codigo, 'clasificacion');
    return citas;
  }

  /**
   * Pares (nombre, cÃ³digo) de la clasificaciÃ³n ARCHIVADA del grupo, si estÃ¡.
   *
   * La clasificaciÃ³n es la segunda representaciÃ³n que publica el cÃ³digo de un equipo, y en la maqueta
   * nova es la Ãºnica que lo hace para los grupos cuyas filas de calendario no traen el enlace de
   * comparativa. Medido: 242 de los 866 grupos de Euskadi con partidos sin cÃ³digo tienen esos enlaces.
   *
   * El directorio se saca de `jornadas.archivo`, que es lo Ãºnico que dice dÃ³nde archivÃ³ el recolector
   * este grupo. Si no hay clasificaciÃ³n, se devuelve vacÃ­o: no es un error, es que esa representaciÃ³n no
   * existe para este grupo.
   */
  clasificacionArchivada(ambito: AmbitoGrupo): Array<{ nombre: string; codigo: string }> {
    const pares: Array<{ nombre: string; codigo: string }> = [];
    const vistos = new Set<string>();
    for (const j of this.jornadas(ambito)) {
      if (!j.archivo) continue;
      const html = leeArchivoDeTexto(join(dirname(j.archivo), 'clasificacion.html'));
      if (html === null || vistos.has(dirname(j.archivo))) continue;
      vistos.add(dirname(j.archivo));
      for (const m of html.matchAll(/<a[^>]+href="([^"]*codequipo=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const nombre = m[3]!.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (nombre) pares.push({ nombre, codigo: m[2]! });
      }
    }
    return pares;
  }

  /**
   * Los partidos del grupo. **Las filas de descanso NO son partidos y se descartan aquí.**
   *
   * Las ligas de número impar publican una fila por jornada para el equipo que descansa, y varias
   * federaciones la sirven como una fila de partido más, con un pseudo-equipo dado de alta («DESCANSA» en
   * PNFG, `Atsedena` en Euskadi). El recolector la filtra al escribir la jornada, pero **no todos los
   * adaptadores lo hacen**: medido el 24/09/2026, la cola de Cataluña las tenía dentro de `partidos`, y el
   * importador se encontraba un equipo que no podía resolver y **detenía el lote**: 48 grupos de Cataluña
   * rechazados por esto.
   *
   * Se filtra AQUÍ, en el origen, y no en el importador, por una razón concreta: los recuentos de
   * validación salen de esta misma capa, y si el importador descartara filas que el recuento de origen sí
   * cuenta, el contraste origen/destino fallaría y el lote se detendría por un descuadre inventado. El
   * origen tiene que decidir qué es un partido, y decidirlo una sola vez.
   *
   * La comparación es de palabra ENTERA y normalizada —`C.D. DESCANSO` no es un descanso— y usa el
   * vocabulario que cada maqueta ya declara en `@facylf/ingesta`. El nombre en la cola es el literal que
   * publicó la fuente, así que se prueba con todas las maquetas conocidas.
   */
  partidos(ambito: AmbitoGrupo): FilaPartido[] {
    const filas = this.db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
        equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante,
        fecha, hora, campo, campo_codigo, arbitro, actualizado_en
      from partidos where temporada = ? and competicion = ? and grupo = ?
      order by jornada, orden`).all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as FilaPartido[];
    return filas
      .filter((p) => !esFilaDeDescanso(p.local) && !esFilaDeDescanso(p.visitante))
      // Y una fila que pone al mismo equipo en los dos lados no es un partido: se descarta aquí, que es donde
      // se decide qué es un partido, y se cuenta aparte (`cuentaImposibles`) para poder decir cuántas son.
      .filter((p) => !esFilaImposible(p.local, p.visitante, p.equipo_local_codigo, p.equipo_visitante_codigo));
  }

  /**
   * Cuántas filas de `partidos` ponen al mismo equipo en los dos lados, y cuántas de ellas traen resultado o
   * acta. Se cuentan para DESCONTARLAS de los recuentos de origen —si no, la comparación origen/destino falla
   * por filas que el importador descarta a propósito— y para poder decirlo.
   */
  cuentaImposibles(ambito: AmbitoGrupo): { total: number; conResultado: number; conActa: number; conArbitro: number } {
    const filas = this.db.prepare(`select local, visitante, equipo_local_codigo, equipo_visitante_codigo,
        goles_local, codigo_acta, arbitro from partidos where temporada = ? and competicion = ? and grupo = ?`)
      .all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as Array<{
        local: string; visitante: string; equipo_local_codigo: string | null; equipo_visitante_codigo: string | null;
        goles_local: number | null; codigo_acta: string | null; arbitro: string | null;
      }>;
    const suyas = filas.filter((f) => !esFilaDeDescanso(f.local) && !esFilaDeDescanso(f.visitante)
      && esFilaImposible(f.local, f.visitante, f.equipo_local_codigo, f.equipo_visitante_codigo));
    return {
      total: suyas.length,
      conResultado: suyas.filter((f) => f.goles_local !== null).length,
      conActa: suyas.filter((f) => f.codigo_acta !== null).length,
      conArbitro: suyas.filter((f) => f.arbitro !== null && String(f.arbitro).trim() !== '').length,
    };
  }

  /**
   * Cuántas filas de `partidos` son en realidad filas de descanso, y cuántas de ellas traen resultado o
   * árbitro. Se cuenta para poder DESCONTARLAS de los recuentos de origen y para poder DECIRLO.
   */
  cuentaDescansos(ambito: AmbitoGrupo): { total: number; conResultado: number; conArbitro: number } {
    const filas = this.db.prepare(`select local, visitante, goles_local, arbitro from partidos
      where temporada = ? and competicion = ? and grupo = ?`)
      .all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as Array<{
        local: string; visitante: string; goles_local: number | null; arbitro: string | null;
      }>;
    const suyas = filas.filter((f) => esFilaDeDescanso(f.local) || esFilaDeDescanso(f.visitante));
    return {
      total: suyas.length,
      conResultado: suyas.filter((f) => f.goles_local !== null).length,
      conArbitro: suyas.filter((f) => f.arbitro !== null && String(f.arbitro).trim() !== '').length,
    };
  }

  /**
   * Cuántas filas de `partidos` del grupo son en realidad filas de descanso. Se cuenta para poder DECIRLO:
   * un descarte que no se ve es un descarte que nadie puede revisar si la palabra cambia de significado.
   */
  filasDeDescanso(ambito: AmbitoGrupo): number {
    return this.cuentaDescansos(ambito).total;
  }

  actas(ambito: AmbitoGrupo): FilaActa[] {
    return this.db.prepare(`select codigo, temporada, competicion, grupo, jornada, menores, estado, archivo,
        hash, datos, comprobada_en, version_parser, calidad, incidencias
      from actas where temporada = ? and competicion = ? and grupo = ?
      order by jornada, codigo`).all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as FilaActa[];
  }

  participaciones(acta: { temporada: string; competicion: string; grupo: string; jornada: number; codigo: string }): FilaParticipacion[] {
    return this.db.prepare(`select temporada, competicion, grupo, jornada, acta, lado, condicion, orden,
        jugador_codigo, nombre, dorsal, portero, menores
      from participaciones where temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?
      order by lado, condicion, orden`).all(
      acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.codigo,
    ) as unknown as FilaParticipacion[];
  }

  eventos(acta: { temporada: string; competicion: string; grupo: string; jornada: number; codigo: string }): FilaEvento[] {
    return this.db.prepare(`select temporada, competicion, grupo, jornada, acta, orden, tipo, minuto, lado,
        jugador_codigo, nombre, menores, subtipo, minuto_base, minuto_anadido, sujeto_tipo, lado_beneficiado
      from eventos_acta where temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?
      order by orden`).all(
      acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.codigo,
    ) as unknown as FilaEvento[];
  }

  tecnicos(acta: { temporada: string; competicion: string; grupo: string; jornada: number; codigo: string }): FilaTecnico[] {
    return this.db.prepare(`select temporada, competicion, grupo, jornada, acta, lado, rol, nombre, menores
      from tecnicos_acta where temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?
      order by lado, rol, nombre`).all(
      acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.codigo,
    ) as unknown as FilaTecnico[];
  }

  personaPorCodigo(codigo: string): FilaPersona | undefined {
    return this.db.prepare('select codigo, nombre, primera_acta, ultima_acta, actualizado_en from personas where codigo = ?')
      .get(codigo) as unknown as FilaPersona | undefined;
  }

  /**
   * Recuentos de origen de un Ã¡mbito, para la comparaciÃ³n origen/destino.
   *
   * â”€â”€ POR QUÃ‰ HAY DOS JUEGOS DE RECUENTOS (medido el 21/09/2026) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   *
   * El destino sÃ³lo puede recibir **las actas que estÃ¡n enlazadas con un partido** (`partidos.codigo_acta`):
   * un informe de partido sin partido no existe. Pero la cola puede tener **mÃ¡s actas que partidos** â€”medido en
   * Navarra, grupo 22841470: 27 actas y 18 partidos, y el acta 25449854 (Â«Beti Kozkor K.E. 1-0 C.D. PamplonaÂ»)
   * no la cita ningÃºn partido de ese grupoâ€”, y entonces comparar el destino contra el TOTAL hacÃ­a fallar el lote
   * entero: la carga masiva se quedaba a cero.
   *
   * AsÃ­ que se devuelven los dos:
   *
   *   Â· `actasHechas`, `participaciones`â€¦ (el total, como siempre) â†’ sirve para DECIR cuÃ¡ntas no encajan;
   *   Â· `actasEnlazadas`, `participacionesEnlazadas`â€¦ (sÃ³lo las que se van a escribir) â†’ sirve para COMPARAR.
   *
   * La diferencia no se silencia: quien llama la cuenta y la deja registrada en el lote (ver `lote.ts`).
   */
  /** `actasApartadas`: actas que el importador decidió NO enlazar (ver `FACYLF_APARTAR_ACTAS_DISCORDANTES`
   *  en lote.ts); se descuentan de todo lo «enlazado» para que el contraste siga siendo exacto. */
  recuentos(ambito: AmbitoGrupo, actasApartadas?: Set<string>) {
    const uno = (sql: string, ...parametros: Array<string | number>) => {
      const fila = this.db.prepare(sql).get(...parametros) as { n?: number } | undefined;
      return Number(fila?.n ?? 0);
    };
    const p = [ambito.temporada, ambito.competicion, ambito.grupo] as const;
    /*
     * â”€â”€ LAS ACTAS Â«ENLAZADASÂ», CALCULADAS UNA VEZ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
     *
     * Â«EnlazadaÂ» = el acta existe, estÃ¡ analizada y algÃºn partido del grupo la cita. Antes eso se
     * comprobaba con un `exists` correlacionado DENTRO de cada fila de `participaciones`, `eventos_acta` y
     * `tecnicos_acta`, y ahÃ­ estaba el cuello de botella.
     *
     * El motivo: `partidos` tiene la clave primaria `(temporada, competicion, grupo, jornada, orden)`. Un
     * filtro por `temporada` y `grupo` SIN `competicion` en medio no puede usar el Ã­ndice, asÃ­ que
     * **recorrÃ­a todos los partidos de la temporada** â€” una vez por participaciÃ³n.
     *
     * Medido el 24/09/2026 en un grupo de Madrid de 27 actas y 1.067 participaciones: `recuentos` tardaba
     * **156 segundos**, la mitad de importar el grupo entero, mientras que el total de tiempo de TODAS las
     * consultas a PostgreSQL de ese lote era de **126 milisegundos**. El cuello no estaba en el destino:
     * estaba en esta validaciÃ³n del origen.
     *
     * Ahora el conjunto se materializa una sola vez, partiendo de `partidos` acotado por grupo â€”que sÃ­ usa
     * el Ã­ndiceâ€” y cruzÃ¡ndolo con `actas`. Los nÃºmeros que devuelve son EXACTAMENTE los mismos: se
     * comprobaron grupo a grupo antes y despuÃ©s del cambio, y ademÃ¡s el importador contrasta estos
     * recuentos con los del destino en cada lote, asÃ­ que una diferencia detendrÃ­a la importaciÃ³n.
     */
    /*
     * El conjunto de actas enlazadas se calcula UNA vez, en JavaScript y con el MISMO predicado que usa el
     * importador. Dos motivos, cada uno costó una tarde:
     *
     *  1. Velocidad: la versión con `exists` correlacionado dentro de cada fila tardaba 156 s en un grupo
     *     de Madrid (ver la nota larga de arriba).
     *  2. Coherencia: desde que `partidos()` descarta las filas de descanso, este conjunto tiene que
     *     descartarlas TAMBIÉN. Si no, el origen contaría actas enlazadas a un partido que el importador no
     *     va a escribir y el contraste origen/destino fallaría por un descuadre inventado: le pasó al grupo
     *     58161916 de Cataluña, con 8 actas de origen contra 6 de destino.
     */
    const actasEnlazadas = this.codigosDeActasEnlazadas(ambito);
    for (const codigo of actasApartadas ?? []) actasEnlazadas.delete(codigo);
    const cuentaEnlazadas = (tabla: 'participaciones' | 'eventos_acta' | 'tecnicos_acta'): number => {
      if (actasEnlazadas.size === 0) return 0;
      const filas = this.db.prepare(`select acta from ${tabla}
        where temporada = ? and competicion = ? and grupo = ?`)
        .all(...p) as unknown as Array<{ acta: string }>;
      return filas.reduce((n, f) => n + (actasEnlazadas.has(f.acta) ? 1 : 0), 0);
    };
    // Los parametros de ENLAZADAS ya no existen: el conjunto se calcula en JavaScript, con el mismo
    // predicado que el importador, para que los dos lados no puedan discrepar.
    /*
     * Las filas de descanso que hay en `partidos`, contadas UNA vez y con sus propias condiciones: se
     * descuentan de los tres recuentos de partidos para que cuadren con lo que el importador va a escribir.
     */
    const descansos = this.cuentaDescansos(ambito);
    /*
     * Y las filas imposibles —el mismo equipo en los dos lados— se descuentan igual: `partidos()` ya no las
     * devuelve, así que si no se restaran aquí el origen contaría partidos que el importador no va a escribir.
     */
    const imposibles = this.cuentaImposibles(ambito);
    return {
      jornadas: uno('select count(*) n from jornadas where temporada = ? and competicion = ? and grupo = ?', ...p),
      // Los recuentos de partidos DESCUENTAN las filas de descanso y las imposibles, igual que hace
      // `partidos()`: si no, el contraste origen/destino fallaría por filas que se descartan a propósito.
      partidos: uno('select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ?', ...p) - descansos.total - imposibles.total,
      partidosConResultado: uno('select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ? and goles_local is not null', ...p) - descansos.conResultado - imposibles.conResultado,
      actas: uno('select count(*) n from actas where temporada = ? and competicion = ? and grupo = ?', ...p),
      actasHechas: uno("select count(*) n from actas where temporada = ? and competicion = ? and grupo = ? and estado = 'hecha'", ...p),
      actasEnlazadas: actasEnlazadas.size,
      participaciones: uno('select count(*) n from participaciones where temporada = ? and competicion = ? and grupo = ?', ...p),
      participacionesEnlazadas: cuentaEnlazadas('participaciones'),
      eventos: uno('select count(*) n from eventos_acta where temporada = ? and competicion = ? and grupo = ?', ...p),
      eventosEnlazados: cuentaEnlazadas('eventos_acta'),
      tecnicos: uno('select count(*) n from tecnicos_acta where temporada = ? and competicion = ? and grupo = ?', ...p),
      tecnicosEnlazados: cuentaEnlazadas('tecnicos_acta'),
      partidosConArbitro: uno("select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ? and arbitro is not null and trim(arbitro) <> ''", ...p) - descansos.conArbitro - imposibles.conArbitro,
    };
  }

  /**
   * Los codigos de las actas del grupo que estan «enlazadas»: analizadas y citadas por un partido.
   *
   * Se calcula sobre `partidos()` —que YA descarta las filas de descanso— para que el origen y el
   * importador usen exactamente el mismo criterio de que es un partido.
   *
   * ── Y SE CUENTAN LAS QUE DEJAN INFORME, NO SÓLO LAS `hecha` (medido el 24/09/2026) ──────────────────────
   *
   * Antes este conjunto se llenaba sólo con `estado = 'hecha'`, pero el importador escribe fila en
   * `core.match_report` para tres estados: `hecha`, `sin_datos` (calidad `partial`) y `ausente_web`
   * (`unavailable`). Un grupo con 270 actas buenas y **una `sin_datos`** daba 270 en el origen y 271 informes
   * en el destino, y el lote se caía con «actas analizadas 270≠271», con el grupo entero detrás.
   *
   * Le pasaba a siete federaciones a la vez —Baleares, Asturias, Navarra, Extremadura, Castilla-La Mancha,
   * Aragón y Rioja—, siempre con exactamente una de más, porque siempre era una `sin_datos`. El predicado se
   * lee ahora de `produceInforme`, el mismo que usa `calidadInforme`: los dos lados no pueden separarse.
   */
  codigosDeActasEnlazadas(ambito: AmbitoGrupo): Set<string> {
    const conInforme = new Set(
      (this.db.prepare(`select codigo, estado from actas where temporada = ? and competicion = ? and grupo = ?`)
        .all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as Array<{ codigo: string; estado: string }>)
        .filter((a) => produceInforme(a.estado))
        .map((a) => a.codigo),
    );
    const enlazadas = new Set<string>();
    for (const p of this.partidos(ambito)) {
      if (p.codigo_acta && conInforme.has(p.codigo_acta)) enlazadas.add(p.codigo_acta);
    }
    return enlazadas;
  }
}
