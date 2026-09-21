/**
 * Lectura de la cola SQLite de un recolector.
 *
 * Regla 1 del encargo: la SQLite se abre en SÓLO LECTURA y no se toca su WAL — los recolectores
 * siguen escribiendo mientras esto corre. Aquí no hay una sola sentencia de escritura ni un `pragma`
 * que cambie el modo de diario: la conexión es `readOnly` y todo lo demás es `select`.
 */
import { DatabaseSync } from './sqlite.js';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { equiposDeclaradosPorActa } from '../resolucion/equipos-acta.js';
import type { Procedencia } from '../resolucion/inscripcion.js';

/**
 * Lee un fichero archivado, con o sin comprimir. Devuelve `null` si no está: la ausencia de una
 * representación archivada no es un error, es que esa representación no existe para ese grupo.
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

/** Ámbito de un grupo en la cola: la tupla completa, nunca una parte suelta. */
export type AmbitoGrupo = { temporada: string; competicion: string; grupo: string };

/** Carpetas cuyo nombre no coincide con el código de la federación (herencia del arranque del proyecto). */
const CARPETA_ESPECIAL: Record<string, string> = { 'castilla-leon': 'descargas-federacion' };

export class ColaOrigen {
  readonly ruta: string;
  private readonly db: DatabaseSync;

  constructor(ruta: string) {
    if (!existsSync(ruta)) throw new Error(`No existe la cola SQLite: ${ruta}`);
    this.ruta = ruta;
    this.db = new DatabaseSync(ruta, { readOnly: true });
  }

  static rutaDeFederacion(raiz: string, federacion: string): string {
    const carpeta = CARPETA_ESPECIAL[federacion] ?? `descargas-${federacion}`;
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

  /** Temporada cuya etiqueta (2025-26) es la pedida — las etiquetas sí son comparables entre federaciones. */
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

  /** Grupos de una temporada que tienen algo que importar: alguna jornada o algún partido. */
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
    return this.db.prepare(`select distinct e.temporada, e.codigo, e.nombre, e.primera_jornada
      from equipos e
      where e.temporada = ?
        and (e.codigo in (select equipo_local_codigo from partidos where temporada = ? and competicion = ? and grupo = ?)
          or e.codigo in (select equipo_visitante_codigo from partidos where temporada = ? and competicion = ? and grupo = ?))
      order by e.nombre`).all(
      ambito.temporada, ambito.temporada, ambito.competicion, ambito.grupo,
      ambito.temporada, ambito.competicion, ambito.grupo,
    ) as unknown as FilaEquipo[];
  }

  /**
   * TODAS las citas de equipo del ámbito, con o SIN código federativo.
   *
   * Es la pieza que faltaba: `equiposDeGrupo` filtra por `equipos.codigo`, así que un equipo que la
   * fuente no publica con código no existía para el importador. Medido en Euskadi el 15/09/2026: 30.314
   * de 34.358 partidos no tienen código en ninguno de los dos lados, así que casi todos sus equipos eran
   * invisibles y sus partidos quedaban sin equipos.
   *
   * Se reúne de las representaciones archivadas del MISMO ámbito —nunca se cruza un grupo con otro para
   * resolver un nombre—:
   *
   * | procedencia | de dónde sale |
   * |---|---|
   * | `calendario` | `partidos.local` / `partidos.visitante`, con su código si la fila lo trae |
   * | `catalogo` | la tabla `equipos` de la temporada, para los códigos que juegan en el grupo |
   * | `acta` | la pareja que declara la cabecera del acta archivada |
   * | `clasificacion` | la clasificación archivada del grupo (`codequipo=<código>` con su nombre) |
   * | `jornada` | no aporta literales —la fila de `partidos` ES la jornada ya extraída—, pero sitúa el |
   * |  | directorio del grupo, que es donde vive la clasificación archivada |
   *
   * Leer el HTML de la jornada desde aquí convertiría al importador en la fuente del calendario, que es
   * justo lo contrario del diseño: de eso se encarga `scripts/reconstruir-cola.mjs`, con su manifiesto y
   * su diario. Por eso `jornada` sólo aporta la ubicación.
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

    // La pareja que declara el acta. Es la representación que trae el nombre LIMPIO, sin el marcador de
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
   * Pares (nombre, código) de la clasificación ARCHIVADA del grupo, si está.
   *
   * La clasificación es la segunda representación que publica el código de un equipo, y en la maqueta
   * nova es la única que lo hace para los grupos cuyas filas de calendario no traen el enlace de
   * comparativa. Medido: 242 de los 866 grupos de Euskadi con partidos sin código tienen esos enlaces.
   *
   * El directorio se saca de `jornadas.archivo`, que es lo único que dice dónde archivó el recolector
   * este grupo. Si no hay clasificación, se devuelve vacío: no es un error, es que esa representación no
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

  partidos(ambito: AmbitoGrupo): FilaPartido[] {
    return this.db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
        equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante,
        fecha, hora, campo, campo_codigo, arbitro, actualizado_en
      from partidos where temporada = ? and competicion = ? and grupo = ?
      order by jornada, orden`).all(ambito.temporada, ambito.competicion, ambito.grupo) as unknown as FilaPartido[];
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

  /** Recuentos de origen de un ámbito, para la comparación origen/destino. */
  recuentos(ambito: AmbitoGrupo) {
    const uno = (sql: string, ...parametros: Array<string | number>) => {
      const fila = this.db.prepare(sql).get(...parametros) as { n?: number } | undefined;
      return Number(fila?.n ?? 0);
    };
    const p = [ambito.temporada, ambito.competicion, ambito.grupo] as const;
    return {
      jornadas: uno('select count(*) n from jornadas where temporada = ? and competicion = ? and grupo = ?', ...p),
      partidos: uno('select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ?', ...p),
      partidosConResultado: uno('select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ? and goles_local is not null', ...p),
      actas: uno('select count(*) n from actas where temporada = ? and competicion = ? and grupo = ?', ...p),
      actasHechas: uno("select count(*) n from actas where temporada = ? and competicion = ? and grupo = ? and estado = 'hecha'", ...p),
      participaciones: uno('select count(*) n from participaciones where temporada = ? and competicion = ? and grupo = ?', ...p),
      eventos: uno('select count(*) n from eventos_acta where temporada = ? and competicion = ? and grupo = ?', ...p),
      tecnicos: uno('select count(*) n from tecnicos_acta where temporada = ? and competicion = ? and grupo = ?', ...p),
      partidosConArbitro: uno("select count(*) n from partidos where temporada = ? and competicion = ? and grupo = ? and arbitro is not null and trim(arbitro) <> ''", ...p),
    };
  }
}
