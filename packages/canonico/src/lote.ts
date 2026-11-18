/**
 * Orquestación de un lote: un grupo, en una transacción, en el orden que exige el encargo.
 *
 * Orden (§5 de IMPORTADOR-SQLITE.md):
 *   temporada → competición/edición → grupo → jornada → equipos → campos → partidos
 *   → actas (match_report) → personas → participaciones → eventos → técnicos → árbitros
 *   → clasificación oficial → cobertura
 *
 * Un fallo en cualquier punto revierte el lote entero: un lote a medias es peor que ninguno porque
 * parece cobertura. La unidad de lote es el GRUPO, que es la unidad de publicación, así que el WAL de
 * PostgreSQL se mantiene pequeño sin partir la transacción de un grupo.
 */
import { dirname } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '@facylf/ingesta';
import type { ClienteCanonico, PoolCanonico } from './destino/pool.js';
import { Repositorio, enTransaccion, type Contadores } from './destino/repositorio.js';
import { ColaOrigen, type AmbitoGrupo, type FilaActa, type FilaEquipo, type FilaGrupo, type FilaPartido } from './origen/cola.js';
import {
  calidadInforme, categoriaDesdeNombre, condicionParticipacion, estadoPartido, fechaIso, generoDesdeNombre,
  horaIso, incidencias, lado, ladoOpcional, sujetoTipo, tipoEvento, ValorDesconocido,
} from './origen/vocabularios.js';
import { Normalizador, ambitoNominalTecnico, contextoDe, fuenteDeFederacion, resuelveFederacion, resuelveTemporada } from './resolucion/contexto.js';
import { registraRef, resuelveEdicion, resuelveGrupo, resuelveJornada } from './resolucion/catalogo.js';
import { resuelveEquipo } from './resolucion/equipo.js';
import {
  construyeCandidatos, construyeCatalogoInscripciones, resuelveInscripcion,
  type InscripcionDeGrupo, type VinculacionContextual,
} from './resolucion/inscripcion.js';
import {
  equiposDeclaradosPorActa, reconciliaEquiposDelPartido, type DecisionEquipos,
} from './resolucion/equipos-acta.js';
import { resuelveRolTecnico } from './resolucion/roles.js';
import { reconstruyeClasificacion } from './clasificacion.js';
import { importaClasificacionOficial, type CatalogoEquipos, type EstadoTablaOficial, type ResumenOficial } from './clasificacion-oficial.js';
import { diagnosticaTablaOficial, mtimeDelArchivo } from './clasificacion-oficial.js';
import { TablaOficialInvalida } from './clasificacion-oficial-json.js';
import { nombreDeClub } from './clasificacion-oficial-json.js';
import { revisaCuadreDelCalendario, type ResumenCalendario } from './integridad.js';
import { PersonasEnLote } from './resolucion/personas-lote.js';
import { resuelveCampo } from './resolucion/campo.js';
import { calendarioImposible } from './origen/calendario-imposible.js';

export const VERSION_PARSER = 19;
export const VERSION_NORMALIZADOR = 1;

export type OpcionesLote = {
  raiz: string;
  federacion: string;
  temporada?: string;
  grupo?: string;
  seco?: boolean;
  /**
   * No detener la importación cuando un grupo falla: anotarlo y seguir con el siguiente.
   *
   * Existe por una razón medida, no por comodidad. Un grupo de 2025-26 de Castilla y León tenía un acta que
   * no se correspondía con su fila del calendario —una incoherencia real de la fuente—, y eso **dejó sin
   * importar los 126 grupos que venían detrás**: se importaron 66 de 193. Con 28.382 grupos esperando en las
   * diecinueve colas, un solo grupo roto no puede decidir si el resto entra.
   *
   * NO cambia el comportamiento por defecto: sin esta opción, un grupo que falla sigue deteniendo el lote,
   * que es lo correcto cuando estás importando un grupo a propósito y quieres enterarte.
   */
  continuar?: boolean;
  /**
   * `false` = modo masivo: este lote NO guarda diario de cambios y por tanto `--revertir` no podrá
   * deshacerlo. Es lo que hace viable cargar de una vez los 28.382 grupos que esperan en las colas:
   * medido el 24/09/2026, el diario ocupaba la MITAD de la base (601 MB de 1.196 MB) con sólo 242 grupos
   * importados. No se revierte un grupo de benjamines de 2016.
   *
   * El lote sigue siendo una transacción: si algo falla, se revierte entero. Lo que se pierde es poder
   * deshacerlo después, y por eso el lote lo declara en su validación y `--revertir` se niega en vez de
   * fingir que revierte.
   */
  diario?: boolean;
};

export type InformeGrupo = {
  federacion: string;
  etiquetaTemporada: string;
  competicion: string;
  grupo: string;
  batchId: number;
  contadores: Record<string, { insertadas: number; actualizadas: number }>;
  recuentosOrigen: Record<string, number>;
  validacion: ResultadoValidacion;
  cobertura: Cobertura;
  rechazadas: Array<{ motivo: string; fila: string }>;
  /** Filas de diario borradas de lotes anteriores del mismo ámbito (ya no eran revertibles). */
  diarioSustituido: number;
  /** Clasificación oficial archivada, si la federación la publicó y se pudo casar con el canónico. */
  clasificacionOficial: ResumenOficial | null;
  /** Cuadre del calendario: equipos que juegan un número de partidos distinto del habitual. */
  calendario: ResumenCalendario | null;
  /** Partidos a los que el lote ha reasignado los equipos porque el calendario se contradecía con el acta. */
  partidosReparados: number;
  /** Apariciones obsoletas de esos partidos retiradas al cerrar (no se dejan dos plantillas donde hay una). */
  aparicionesRetiradas: number;
  milisegundos: number;
  /** Motivo por el que este grupo NO se ha importado. Sólo aparece cuando se importa con `continuar`. */
  error?: string;
};

export type ResultadoValidacion = {
  ok: boolean;
  diferencias: Array<{ entidad: string; origen: number; destino: number }>;
  comprobaciones: Array<{ nombre: string; ok: boolean; detalle: string }>;
};

/**
 * Los dos lados del partido tal y como quedan escritos en el canónico, con la decisión que los fijó.
 *
 * `entradaLocal`/`entradaVisitante` son los `team_entry` que usan A LA VEZ `core.match` y todas las
 * apariciones, eventos y fichas de ese partido: una sola decisión, un solo par de identificadores.
 */
type EquiposEfectivos = {
  entradaLocal: number | null;
  entradaVisitante: number | null;
  /** Nombre en la fuente de cada inscripción efectiva, para la clasificación reconstruida. */
  nombreLocal: string;
  nombreVisitante: string;
  decision: DecisionEquipos;
};

export type Cobertura = {
  jornadas_esperadas: number | null;
  jornadas_descubiertas: number;
  jornadas_cerradas: number;
  partidos_conocidos: number;
  partidos_con_resultado: number;
  actas_enlazadas: number;
  actas_disponibles: number;
  actas_parseadas: number;
  actas_correctas: number;
  actas_a_revisar: number;
  complete_through_matchday: number | null;
  visibility_state: string;
};

/** Importa un grupo (o todos los de una temporada) y devuelve el informe de cada lote. */
export async function importaFederacion(pool: PoolCanonico, opciones: OpcionesLote): Promise<InformeGrupo[]> {
  const fuente = fuenteDeFederacion(opciones.raiz, opciones.federacion);
  const cola = new ColaOrigen(ColaOrigen.rutaDeFederacion(opciones.raiz, opciones.federacion, opciones.temporada));
  const informes: InformeGrupo[] = [];
  try {
    const temporadas = opciones.temporada
      ? [cola.temporadaPorEtiqueta(opciones.temporada)].filter((t): t is NonNullable<typeof t> => Boolean(t))
      : cola.temporadas();
    if (temporadas.length === 0) {
      throw new Error(`La federación ${opciones.federacion} no tiene la temporada ${opciones.temporada}`);
    }
    for (const temporada of temporadas) {
      const grupos = cola.gruposConDatos(temporada.codigo, opciones.grupo);
      for (const grupo of grupos) {
        const cliente = await pool.connect();
        try {
          const informe = await importaGrupo(cliente, cola, fuente.codigo, temporada, grupo, opciones);
          informes.push(informe);
        } catch (error) {
          // Con `continuar`, un grupo que no se puede importar se anota y se sigue. El lote de ese grupo ya
          // se ha revertido entero dentro de `importaGrupo`, así que la base queda como estaba: no se
          // publica media cobertura. Ver el porqué en `OpcionesLote.continuar`.
          if (!opciones.continuar) throw error;
          informes.push({
            federacion: fuente.codigo, etiquetaTemporada: temporada.etiqueta,
            competicion: grupo.competicion, grupo: grupo.codigo, batchId: 0,
            contadores: {}, recuentosOrigen: {}, rechazadas: [], diarioSustituido: 0,
            validacion: { ok: false, diferencias: [], comprobaciones: [] },
            cobertura: {} as Cobertura, clasificacionOficial: null, calendario: null,
            partidosReparados: 0, aparicionesRetiradas: 0, milisegundos: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          cliente.release();
        }
      }
    }
  } finally {
    cola.cierra();
  }
  return informes;
}

async function importaGrupo(
  cliente: ClienteCanonico,
  cola: ColaOrigen,
  federacion: string,
  temporada: { codigo: string; etiqueta: string },
  grupo: FilaGrupo,
  opciones: OpcionesLote,
): Promise<InformeGrupo> {
  const inicio = Date.now();
  const ambito: AmbitoGrupo = { temporada: grupo.temporada, competicion: grupo.competicion, grupo: grupo.codigo };
  const contadores: Contadores = new Map();
  const rechazadas: Array<{ motivo: string; fila: string }> = [];
  const etiquetaTemporada = temporada.etiqueta;

  // El lote es UNA transacción: si algo falla en cualquier punto se revierte entero, y en modo seco
  // se revierte siempre (no basta con no escribir: hay que deshacer lo escrito). Un lote a medias es
  // peor que ninguno porque parece cobertura.
  await cliente.query('begin');
  let resultado: {
    batchId: number; validacion: ResultadoValidacion; cobertura: Cobertura;
    clasificacionOficial: ResumenOficial | null; calendario: ResumenCalendario | null;
    partidosReparados: number; aparicionesRetiradas: number;
  };
  let diarioSustituido = 0;
  try {
    resultado = await ejecutaLote(cliente, cola, federacion, temporada, grupo, opciones, {
      contadores, rechazadas, etiquetaTemporada,
    });
    if (opciones.seco) {
      await cliente.query('rollback');
    } else {
      await cliente.query('commit');
      // Con el lote ya confirmado, el diario de los lotes anteriores del mismo grupo sólo ocupaba
      // disco: los hechos son de este lote, así que aquellos ya no se podían revertir con exactitud.
      diarioSustituido = await purgaDiarioSustituido(cliente, resultado.batchId);
    }
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    throw error;
  }

  return {
    federacion,
    etiquetaTemporada,
    competicion: grupo.competicion,
    grupo: grupo.codigo,
    batchId: resultado.batchId,
    contadores: Object.fromEntries(contadores),
    recuentosOrigen: cola.recuentos(ambito) as unknown as Record<string, number>,
    validacion: resultado.validacion,
    cobertura: resultado.cobertura,
    rechazadas,
    diarioSustituido,
    clasificacionOficial: resultado.clasificacionOficial,
    calendario: resultado.calendario,
    partidosReparados: resultado.partidosReparados,
    aparicionesRetiradas: resultado.aparicionesRetiradas,
    milisegundos: Date.now() - inicio,
  };
}

/**
 * Borra el diario de los lotes anteriores del mismo ámbito.
 *
 * Un lote guarda, fila a fila, el estado anterior de todo lo que escribe (eso es lo que hace exacta
 * la reversión). En cuanto se reimporta el mismo grupo, ese diario ya no puede deshacer nada —los
 * hechos que describe los ha sustituido el lote nuevo— y sólo ocupa disco: medido, el diario de un
 * grupo completo pesa más que sus partidos y actas juntos. El lote nuevo conserva el suyo íntegro y
 * sigue siendo revertible; de los viejos queda su fila en `ops.batch` con sus recuentos.
 */
async function purgaDiarioSustituido(cliente: ClienteCanonico, batchId: number): Promise<number> {
  try {
    const { rowCount } = await cliente.query(
      `delete from ops.batch_cambio
        where batch_id <> $1
          and batch_id in (select id from ops.batch
                            where cursor_hasta = (select cursor_hasta from ops.batch where id = $1)
                              and estado = 'validado')`,
      [batchId],
    );
    return rowCount ?? 0;
  } catch {
    // El lote ya está confirmado: que no se pueda limpiar el diario viejo no puede hacer parecer
    // que la importación ha fallado. Se devuelve -1 para que la consola lo diga.
    return -1;
  }
}

async function ejecutaLote(
  cliente: ClienteCanonico,
  cola: ColaOrigen,
  federacion: string,
  temporada: { codigo: string; etiqueta: string },
  grupo: FilaGrupo,
  opciones: OpcionesLote,
  memoria: { contadores: Contadores; rechazadas: Array<{ motivo: string; fila: string }>; etiquetaTemporada: string },
): Promise<{
  batchId: number; validacion: ResultadoValidacion; cobertura: Cobertura;
  clasificacionOficial: ResumenOficial | null; calendario: ResumenCalendario | null;
  partidosReparados: number; aparicionesRetiradas: number;
}> {
  const { contadores, rechazadas, etiquetaTemporada } = memoria;
  const ambito: AmbitoGrupo = { temporada: grupo.temporada, competicion: grupo.competicion, grupo: grupo.codigo };

  const fuente = fuenteDeFederacion(opciones.raiz, federacion);
    // La federación se asegura ANTES de abrir el lote: `ops.batch.federation_id` es obligatorio y la
    // fila de federación es catálogo de proyecto, no dato importado (no entra en el diario).
    const adaptador = ['pnfg', 'isquad', 'fcf'].includes(fuente.adaptador) ? fuente.adaptador : 'ninguno';
    /*
     * ── SE BUSCA Y SÓLO SE CREA SI FALTA (medido el 25/09/2026) ──────────────────────────────────────────
     *
     * Antes esto era un `insert ... on conflict (codigo) do update`, y en PostgreSQL esa forma CONSUME un
     * `nextval` de la columna de identidad aunque acabe en conflicto. Como se llama una vez por grupo
     * importado, la secuencia de `core.federation` —un `smallint`, máximo 32767— se agotó con 22
     * federaciones de verdad, y a partir de ahí **ninguna importación entraba**:
     *
     *     nextval: reached maximum value of sequence "federation_id_seq" (32767)
     *
     * Buscar primero y crear sólo si falta no gasta secuencia en el caso normal, que es el 100 % de las
     * veces: la federación ya está.
     */
    const { rows: federacionPrevia } = await cliente.query<{ id: string }>(
      'select id from core.federation where codigo = $1', [fuente.codigo],
    );
    let federacionId = federacionPrevia[0] !== undefined ? Number(federacionPrevia[0].id) : Number.NaN;
    if (!Number.isFinite(federacionId)) {
      const { rows: creada } = await cliente.query<{ id: string }>(
        `insert into core.federation (codigo, nombre, adaptador, portal_url)
         values ($1, $2, $3, $4)
         on conflict (codigo) do update set nombre = excluded.nombre, adaptador = excluded.adaptador,
           portal_url = excluded.portal_url
         returning id`,
        [fuente.codigo, fuente.nombre, adaptador, fuente.portal ?? null],
      );
      federacionId = Number(creada[0]?.id);
    } else {
      // El catálogo tiene que decir lo que dice la configuración: se actualiza sólo si cambió algo.
      await cliente.query(
        `update core.federation set nombre = $2, adaptador = $3, portal_url = $4
          where id = $1 and (nombre, adaptador, portal_url) is distinct from ($2, $3, $4)`,
        [federacionId, fuente.nombre, adaptador, fuente.portal ?? null],
      );
    }
    if (!Number.isFinite(federacionId)) throw new Error(`No se pudo resolver la federación ${federacion}`);

    // El lote se registra antes de escribir hechos, para poder identificar el diario.
    const { rows: batchRows } = await cliente.query<{ id: string }>(
      `insert into ops.batch (federation_id, sqlite_origen, cursor_desde, cursor_hasta, parser_version,
         normalizador_version, estado, validacion)
       values ($1, $2, $3, $4, $5, $6, 'en_curso', '{}'::jsonb)
       returning id`,
      [federacionId, cola.ruta, contextoDe({ etiquetaTemporada }), contextoDe({
        etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo,
      }), VERSION_PARSER, VERSION_NORMALIZADOR],
    );
    const batchId = Number(batchRows[0]?.id);
    if (!Number.isFinite(batchId)) throw new Error('No se pudo registrar el lote');

    // El diario de cambios sólo se mantiene si el lote lo va a poder usar: `--sin-diario` carga en masa
    // sin él. Ver `Repositorio` para el porqué y lo que se pierde.
    const repo = new Repositorio(cliente, batchId, contadores, opciones.diario !== false);
    const normalizador = new Normalizador(cliente);
    // Las personas se resuelven una vez por lote y sus columnas de seguimiento se aplican al final:
    // antes se hacían dos o tres consultas POR APARICIÓN (decenas de miles por grupo).
    const personas = new PersonasEnLote(cliente, repo, normalizador, federacionId);
    const seasonId = await resuelveTemporada(cliente, repo, { codigo: temporada.codigo, etiqueta: etiquetaTemporada, origen: 'web', comprobada_en: null });

    const jornadas = cola.jornadas(ambito);
    const partidos = cola.partidos(ambito);

    /*
     * ── UN CALENDARIO IMPOSIBLE NO SE IMPORTA ────────────────────────────────────────────────────────────
     *
     * Antes de escribir nada: si el calendario de la cola es imposible (todas las jornadas iguales, o más de
     * cuatro vueltas contra el mismo rival), el lote se detiene. No es una precaución de estilo; es lo que
     * evita que entren partidos que no existieron. Medido el 24/09/2026: el defecto del recolector de Cataluña
     * dejó **242 grupos y 95.876 apariciones infladas** dentro del canónico, y quedaban **1.277 grupos** por
     * entrar así, 170.012 partidos.
     *
     * El grupo se rechaza entero, con el motivo escrito: es cobertura que FALTA y se ve, en vez de cobertura
     * falsa. Se repara reconstruyendo el calendario desde las actas archivadas, que sí traen su pareja y su
     * jornada. Ver `calendario-imposible.ts` y §3.11 de la guía.
     */
    const imposible = calendarioImposible(partidos.map((p) => ({ jornada: p.jornada, local: p.local, visitante: p.visitante })));
    if (imposible) throw new Error(imposible.mensaje);

    /* --- edición y grupo --- */
    const competicion = cola.competiciones(grupo.temporada).find((c) => c.codigo === grupo.competicion);
    if (!competicion) throw new Error(`La competición ${grupo.competicion} no está en la cola`);
    const edicionId = await resuelveEdicion(cliente, repo, normalizador, {
      federacionId, seasonId, etiquetaTemporada, competicion,
      fechas: jornadas.map((j) => j.fecha),
    });
    const phaseGroupId = await resuelveGrupo(cliente, repo, {
      federacionId, etiquetaTemporada, competicion: grupo.competicion, edicionId, grupo, orden: 0,
    });

    /* --- jornadas --- */
    const matchdayPorNumero = new Map<number, number>();
    for (const jornada of jornadas) {
      const id = await resuelveJornada(cliente, repo, {
        federacionId, etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo, jornada, phaseGroupId,
      });
      matchdayPorNumero.set(jornada.numero, id);
    }
    // Un partido puede estar en una jornada sin fila en `jornadas`: se crea la jornada que falte.
    for (const partido of partidos) {
      if (matchdayPorNumero.has(partido.jornada)) continue;
      const id = await resuelveJornada(cliente, repo, {
        federacionId, etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo,
        jornada: { temporada: grupo.temporada, competicion: grupo.competicion, grupo: grupo.codigo, numero: partido.jornada, fecha: partido.fecha, archivo: null, hash: null, comprobada_en: null },
        phaseGroupId,
      });
      matchdayPorNumero.set(partido.jornada, id);
    }

    /* --- equipos, campos --- */
    const categoria = categoriaDesdeNombre(competicion.nombre);
    const genero = generoDesdeNombre(competicion.nombre);

    // El catálogo del grupo se monta de TODAS sus representaciones archivadas, con o sin código. Antes
    // se partía sólo de `equiposDeGrupo`, que filtra por `equipos.codigo`: un equipo que la fuente no
    // publica con código no existía, así que su partido quedaba sin equipos. Medido en Euskadi el
    // 15/09/2026: 30.314 de 34.358 partidos sin ningún código.
    const citas = cola.citasDeEquipo(ambito);
    /*
     * Y las inscripciones que ESTE GRUPO ya tiene en el canónico, con la procedencia `catalogo`: la identidad
     * establecida tiene que poder reutilizarse aunque la cola ya no cite su forma. Medido el 25/09/2026: al
     * reparar el calendario de un grupo catalán desde sus actas, la cola pasa a citar «ARO, C.E.» —sin sufijo
     * y sin código, que es como lo escribe el acta— y la inscripción buena, «ARO, C.E. A» con el código 5081,
     * dejaba de estar en el catálogo. Cada reimportación creaba entonces un equipo NUEVO con el partido
     * colgado y la identidad de código se quedaba a cero: 263 parejas en 23 grupos.
     */
    const { rows: filasPersistidas } = await cliente.query<{ nombre_en_fuente: string; codigo_externo: string | null }>(
      `select nombre_en_fuente, codigo_externo from core.team_entry
        where phase_group_id = $1 and retirado = false`,
      [phaseGroupId],
    );
    const { candidatos, ambiguos } = construyeCandidatos([
      ...citas,
      ...filasPersistidas.map((f) => ({
        literal: f.nombre_en_fuente, codigo: f.codigo_externo, procedencia: 'catalogo' as const,
      })),
    ]);
    // Las inscripciones contextuales que YA existen en este grupo. Es lo que hace que la segunda
    // importación devuelva la misma inscripción, y que un código que aparece más tarde se VINCULE en vez
    // de crear una inscripción nueva.
    const { rows: filasVinculadas } = await cliente.query<{ referencia_contextual: string; codigo_externo: string | null; id: string }>(
      `select referencia_contextual, codigo_externo, id from core.team_entry
        where phase_group_id = $1 and referencia_contextual is not null`,
      [phaseGroupId],
    );
    const vinculaciones = new Map<string, VinculacionContextual>();
    for (const fila of filasVinculadas) {
      vinculaciones.set(fila.referencia_contextual, { teamEntryId: Number(fila.id), codigoExterno: fila.codigo_externo });
    }
    const catalogoInscripciones = construyeCatalogoInscripciones({ candidatos, ambiguos, vinculaciones });

    /** Clave de inscripción (código o `contexto:<normalizado>`) → `team_entry`. */
    const entradaPorClave = new Map<string, number>();
    /** Inscripción → nombre en la fuente. Es el nombre estable de un equipo dentro del grupo. */
    const nombrePorEntrada = new Map<number, string>();
    const equipos = [...catalogoInscripciones.porClave.values()];
    const normalizadoPorNombre = await normalizador.normalizaVarios(equipos.map((e) => e.nombre));
    // Nombre normalizado → CLAVE de inscripción, SÓLO con los equipos de este grupo.
    //
    // El valor es la clave, no el código: un equipo sin código federativo también tiene identidad dentro
    // del grupo, y sin ella el acta no podría reconciliarse con el calendario. Los nombres ambiguos ya
    // vienen fuera del mapa: resolverlos elegiría uno de los dos a dedo y contaminaría dos plantillas.
    const clavePorNombre = new Map<string, string>(catalogoInscripciones.porNormalizado);
    // Caché del nombre normalizado: `normalizador.normaliza` consulta la base y ya memoriza, pero aquí
    // hace falta una versión SÍNCRONA para la resolución de la tabla oficial.
    const nombreNormalizadoCache = new Map<string, string>();
    for (const [literal, normalizado] of normalizadoPorNombre) nombreNormalizadoCache.set(literal, normalizado);

    // Cuántas veces aparece cada equipo en cada jornada: es lo que permite demostrar que el equipo
    // que el calendario pone como local de un partido no juega ningún otro partido de esa jornada.
    const aparicionesPorJornada = new Map<number, Map<string, number>>();
    for (const partido of partidos) {
      if (!aparicionesPorJornada.has(partido.jornada)) aparicionesPorJornada.set(partido.jornada, new Map());
      const cuenta = aparicionesPorJornada.get(partido.jornada)!;
      for (const codigo of [partido.equipo_local_codigo, partido.equipo_visitante_codigo]) {
        if (codigo) cuenta.set(codigo, (cuenta.get(codigo) ?? 0) + 1);
      }
    }
    for (const inscripcion of equipos) {
      const resuelto = await resuelveEquipo(cliente, repo, normalizador, {
        federacionId, seasonId, etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo,
        phaseGroupId, inscripcion, categoria: categoria.categoria, genero: genero.genero,
      });
      entradaPorClave.set(resuelto.clave, resuelto.teamEntryId);
      nombrePorEntrada.set(resuelto.teamEntryId, inscripcion.nombre);
    }

    /* --- partidos --- */
    const contextoPartido = (partido: FilaPartido) => contextoDe({
      etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo, jornada: partido.jornada,
    });
    const matchIdPorClave = new Map<string, number>();
    /** Partidos cuya fila de calendario YA NO trae árbitro: si una versión anterior lo escribió, se retira. */
    const partidosSinArbitro: number[] = [];
    /**
     * La inscripción efectiva de cada lado del partido, por `jornada|orden`.
     *
     * Se resuelve con el MISMO orden de evidencia para todos (código explícito válido en el ámbito,
     * referencia contextual existente, nombre limpio único) y se guarda aquí porque la clasificación
     * reconstruida la necesita: antes la buscaba por el código de la cola, y un equipo sin código no la
     * encontraba.
     */
    const entradaPorPartido = new Map<string, {
      local: number | null; visitante: number | null;
      /** La CLAVE resuelta de cada lado: la reconciliación con el acta la necesita tal cual. */
      claveLocal: string | null; claveVisitante: string | null;
    }>();
    for (const partido of partidos) {
      const matchdayId = matchdayPorNumero.get(partido.jornada);
      if (!matchdayId) throw new Error(`Partido sin jornada resoluble: ${partido.jornada}`);
      const fecha = fechaIso(partido.fecha);
      const hora = horaIso(partido.hora);
      const venueId = await resuelveCampo(cliente, repo, normalizador, {
        federacionId, nombre: partido.campo, codigo: partido.campo_codigo,
      });

      /*
       * Las referencias contextuales ya persistidas, REPUNTADAS por las fusiones del catálogo: si una
       * inscripción contextual se ha unido a la del código («QUART, U.E.» → «QUART, U.E. A»), la referencia
       * vieja tiene que resolver a la nueva o resolvería a una inscripción que ya no existe.
       */
      const referenciasExistentes = new Map(
        [...vinculaciones].map(([norm]) => {
          const contextual = `contexto:${norm}`;
          return [norm, catalogoInscripciones.equivalencias.get(contextual) ?? contextual];
        }),
      );
      // Los dos lados, resueltos contra el catálogo de ESTE grupo. Un partido nunca cruza dos grupos.
      const lado = (literal: string, codigoExplicito: string | null) => resuelveInscripcion({
        literal, codigoExplicito, catalogo: catalogoInscripciones, referenciasExistentes,
      });
      const resolucionLocal = lado(partido.local, partido.equipo_local_codigo);
      const resolucionVisitante = lado(partido.visitante, partido.equipo_visitante_codigo);
      const entradaDe = (r: typeof resolucionLocal): number | null => {
        if (r.clave === null) return null;
        const entrada = entradaPorClave.get(r.clave);
        if (entrada === undefined) {
          throw new Error(`La inscripción «${r.limpio}» del partido J${partido.jornada} orden ${partido.orden} `
            + `no se ha podido persistir en el grupo ${grupo.codigo} `
            + `(clave resuelta ${r.clave}, vía ${r.via}; el catálogo tiene ${entradaPorClave.size} inscripciones)`);
        }
        return entrada;
      };
      const entradaLocal = entradaDe(resolucionLocal);
      const entradaVisitante = entradaDe(resolucionVisitante);

      // Un partido NO se importa con un equipo sin resolver: elegir mal contamina dos plantillas a la vez
      // y no se nota. Se detiene el lote con la evidencia de por qué no se pudo resolver.
      if (entradaLocal === null || entradaVisitante === null) {
        /*
         * Y cuando el nombre viene VACÍO, se dice: la cola publica un código sin nombre, así que no hay nada
         * que resolver y el mensaje «no está en el catálogo» haría pensar en un problema de catálogo. Medido
         * el 25/09/2026 en el grupo 18850968 de Madrid: el código 17145319 aparece en doce partidos con el
         * nombre en blanco, y ese equipo tampoco tiene nombre en ninguna otra temporada del canónico.
         */
        const describe = (literal: string, r: typeof resolucionLocal): string => literal.trim() !== ''
          ? `${literal} (${r.evidencia})`
          : `un equipo SIN NOMBRE publicado en la cola (${r.evidencia})`;
        const sinResolver = [
          resolucionLocal.clave === null ? describe(partido.local, resolucionLocal) : null,
          resolucionVisitante.clave === null ? describe(partido.visitante, resolucionVisitante) : null,
        ].filter((x): x is string => x !== null);
        throw new Error(
          `El partido J${partido.jornada} orden ${partido.orden} del grupo ${grupo.codigo} tiene un equipo sin `
          + `resolver y no se importa: ${sinResolver.join('; ')}.`,
        );
      }

      const matchId = await repo.upsert(
        'core.match',
        {
          phase_group_id: phaseGroupId,
          matchday_id: matchdayId,
          source_order: partido.orden,
          home_team_entry_id: entradaLocal,
          away_team_entry_id: entradaVisitante,
          // NULL nunca se convierte en 0: un marcador sin publicar es NULL.
          goles_local: partido.goles_local,
          goles_visitante: partido.goles_visitante,
          official_status: estadoPartido(partido.goles_local, partido.goles_visitante, fecha),
          played_at: fecha && hora ? `${fecha}T${hora}` : null,
          fecha_prevista: fecha,
          hora_confirmada: hora !== null,
          venue_id: venueId,
          data_version: 1,
        },
        ['phase_group_id', 'matchday_id', 'source_order'],
      );
      entradaPorPartido.set(`${partido.jornada}|${partido.orden}`, {
        local: entradaLocal,
        visitante: entradaVisitante,
        claveLocal: resolucionLocal.clave,
        claveVisitante: resolucionVisitante.clave,
      });
      matchIdPorClave.set(`${partido.jornada}|${partido.orden}`, matchId);
      await repo.upsert(
        'core.match_source',
        { match_id: matchId, federation_id: federacionId, codigo_acta: partido.codigo_acta, url: null },
        ['match_id', 'federation_id', 'codigo_acta'],
      );
      await registraRef(repo, {
        federacionId, entityType: 'partido', externalId: String(partido.orden),
        contextKey: contextoPartido(partido), canonicalId: matchId,
      });
      // Árbitro: persona sin código federativo → identidad nominal, ámbito de EDICIÓN.
      const arbitro = String(partido.arbitro ?? '').trim();
      if (arbitro === '') partidosSinArbitro.push(matchId);
      if (arbitro !== '') {
        const { personId } = await personas.nominal({
          federacionId, etiquetaTemporada, nombre: arbitro, rol: 'arbitro', ambito: 'edicion', ambitoId: edicionId, esMenor: false,
        });
        await repo.upsert(
          'core.match_official',
          { match_id: matchId, person_id: personId, rol: 'principal' },
          ['match_id', 'rol'],
        );
      }
    }

    /* --- actas y hechos --- */
    const actas = cola.actas(ambito);
    // Literales de rol que no encajan en el vocabulario medido: se registran UNA vez por lote.
    const rolesSinMedir = new Set<string>();
    // Ficha de cuerpo técnico confirmada por este lote: lo que no esté aquí se retira después.
    const staffEscrito: Array<{ match_id: number; person_id: number; rol: string }> = [];
    // Partidos cuyos equipos ha reasignado este lote, y apariciones que confirma de esos partidos.
    const partidosReparados: number[] = [];
    const aparicionesConfirmadas: Array<{ match_id: number; team_entry_id: number; person_id: number; orden: number; condicion: string }> = [];
    /** Partidos cuya alineación ha reescrito este lote desde su acta (estén o no reparados sus equipos). */
    const partidosConAlineacionReescrita = new Set<number>();
    /** Pareja efectiva de los partidos reparados, por `jornada|orden`, para la clasificación. */
    const correccionesDelCalendario = new Map<string, { local: string; visitante: string }>();
    const resumen = {
      actas_enlazadas: partidos.filter((p) => p.codigo_acta !== null).length,
      actas_disponibles: 0, actas_parseadas: 0, actas_correctas: 0, actas_a_revisar: 0,
    };
    /*
     * ── APARTAR EL ACTA QUE NO CUADRA, EN VEZ DE PERDER EL GRUPO (12/10/2026, opcional) ─────────────────────
     *
     * Cuando el acta y la fila del calendario que la cita hablan de equipos DISTINTOS (forma «otro»), no se
     * sabe qué partido describe el acta y no se elige: eso no cambia. Lo que cambia, sólo con
     * `FACYLF_APARTAR_ACTAS_DISCORDANTES=1`, es la consecuencia: en vez de detener el lote —y perder el
     * grupo entero—, esa acta NO se enlaza (ni informe, ni alineaciones, ni eventos), el partido entra con
     * los datos del calendario y queda un aviso `acta_apartada_por_no_cuadrar` con las dos parejas.
     * La validación descuenta del origen las actas apartadas, así que sigue siendo exacta.
     * Medido: la provincial de Salamanca de CyL perdía así 779 partidos (8 grupos en 2020-21 y 2024-25).
     */
    const apartarDiscordantes = process.env.FACYLF_APARTAR_ACTAS_DISCORDANTES === '1';
    const actasApartadas = new Set<string>();
    for (const acta of actas) {
      /*
       * El acta se une a su partido por el CÓDIGO, con la jornada del PARTIDO (13/10/2026). Antes la clave usaba
       * la jornada guardada en la fila del acta, y un partido aplazado —el calendario lo pone en la jornada 9 y la
       * cola guardó su acta bajo la 8— quedaba como «acta sin partido en el grupo», mientras el recuento del
       * origen sí la contaba como enlazada (lo hace por código). CyL 2013-14, grupo 3768: «actas analizadas
       * 145≠144» y su alineación, eventos y técnicos fuera. Si la misma acta está guardada también bajo la
       * jornada buena, manda esa y la otra copia se aparta.
       *
       * Orden de búsqueda: primero el partido que cita el código EN LA JORNADA DEL ACTA (una misma acta puede
       * estar citada por dos partidos de jornadas distintas, cada uno con su fila de acta: prueba 10); y sólo si
       * no hay ninguno, el partido de otra jornada que la cita (el aplazado: prueba 18).
       */
      let partido = partidos.find((p) => p.codigo_acta === acta.codigo && p.jornada === acta.jornada);
      if (!partido) {
        const deOtraJornada = partidos.find((p) => p.codigo_acta === acta.codigo);
        if (deOtraJornada && actas.some((otra) => otra.codigo === acta.codigo && otra.jornada === deOtraJornada.jornada)) {
          rechazadas.push({ motivo: 'acta repetida bajo otra jornada', fila: `acta ${acta.codigo} J${acta.jornada}` });
          continue;
        }
        partido = deOtraJornada;
      }
      const matchId = partido ? matchIdPorClave.get(`${partido.jornada}|${partido.orden}`) : undefined;
      if (!matchId || !partido) {
        rechazadas.push({ motivo: 'acta sin partido en el grupo', fila: `acta ${acta.codigo} J${acta.jornada}` });
        continue;
      }
      const contextoCtx = {
        federacion, temporada: acta.temporada, competicion: acta.competicion,
        grupo: acta.grupo, jornada: acta.jornada, acta: acta.codigo,
      };

      /* Quién jugó de verdad: el calendario manda en la programación, el acta en la pareja de equipos.
         Ver `resolucion/equipos-acta.ts` para el fallo que obliga a comprobarlo. */
      const equipos = await decideEquiposDelActa(cliente, repo, normalizador, {
        batchId, federacion, grupo: grupo.codigo, jornada: acta.jornada, acta,
        partido, matchId, clavePorNombre, entradaPorClave, nombrePorEntrada,
        claveLocal: entradaPorPartido.get(`${partido.jornada}|${partido.orden}`)?.claveLocal ?? null,
        claveVisitante: entradaPorPartido.get(`${partido.jornada}|${partido.orden}`)?.claveVisitante ?? null,
        apariciones: aparicionesPorJornada.get(partido.jornada) ?? new Map(),
      });
      if (equipos.decision.reparado) {
        // La clasificación reconstruida se calcula desde los partidos, así que tiene que ver la MISMA
        // pareja que se acaba de escribir en `core.match`: si no, la tabla seguiría calculándose con los
        // equipos viejos y contradiría al calendario del propio canónico.
        correccionesDelCalendario.set(`${partido.jornada}|${partido.orden}`, {
          local: equipos.nombreLocal,
          visitante: equipos.nombreVisitante,
        });
      }
      if (equipos.decision.discrepancia?.forma === 'otro') {
        // Las dos filas no hablan ni siquiera de los mismos equipos: no se sabe qué partido describe el
        // acta, así que no se elige. Elegir mal contamina dos equipos a la vez y no se nota.
        const d = equipos.decision.discrepancia;
        if (apartarDiscordantes) {
          actasApartadas.add(acta.codigo);
          rechazadas.push({ motivo: 'acta apartada: no cuadra con su fila del calendario', fila: `acta ${acta.codigo} J${acta.jornada}` });
          await registraAvisoDeLote(cliente, batchId, 'acta_apartada_por_no_cuadrar', {
            federacion, grupo: grupo.codigo, jornada: acta.jornada, orden: partido.orden, codigo_acta: acta.codigo,
            calendario: `${d.calendario.local} / ${d.calendario.visitante}`,
            acta: `${d.acta.local} / ${d.acta.visitante}`,
            consecuencia: 'el partido entra con los datos del calendario; el acta no se enlaza',
          });
          console.warn(`  ⊘ Acta ${acta.codigo} (${grupo.codigo} J${acta.jornada}) apartada: el calendario dice «${d.calendario.local} vs ${d.calendario.visitante}» y el acta «${d.acta.local} vs ${d.acta.visitante}».`);
          continue;
        }
        throw new Error(
          `El acta ${acta.codigo} (${grupo.codigo} J${acta.jornada}) no se corresponde con la fila del `
          + `calendario que la cita: el calendario dice «${d.calendario.local} vs ${d.calendario.visitante}» `
          + `y el acta dice «${d.acta.local} vs ${d.acta.visitante}». El lote se detiene: hay que revisar la fuente.`,
        );
      }
      // El partido y sus equipos pertenecen al MISMO grupo: la resolución se hizo contra el catálogo
      // de este grupo, y `decideEquiposDelActa` falla si un código resuelto no está inscrito en él.
      const entradaDeLado = (ladoPedido: 'local' | 'visitante' | null): number | null => {
        if (ladoPedido === 'local') return equipos.entradaLocal;
        if (ladoPedido === 'visitante') return equipos.entradaVisitante;
        return null;
      };

      const quality = calidadInforme(acta.estado, acta.calidad, contextoCtx);
      if (quality === null) continue; // pendiente: cobertura pendiente, no crea informe
      if (quality !== 'unavailable') resumen.actas_disponibles += 1;
      if (quality === 'correct' || quality === 'review' || quality === 'administrative' || quality === 'partial') resumen.actas_parseadas += 1;
      if (quality === 'correct') resumen.actas_correctas += 1;
      if (quality === 'review') resumen.actas_a_revisar += 1;

      // La discrepancia no se resuelve en silencio: va como incidencia estructurada del acta, con las
      // dos parejas enteras, para que la web pueda enseñarla y no parezca que la fuente coincidía.
      const incidenciasActa = incidencias(acta.incidencias);
      if (equipos.decision.discrepancia) {
        const d = equipos.decision.discrepancia;
        incidenciasActa.push({
          codigo: 'EQUIPOS_ACTA_NO_CUADRA',
          parametros: `forma=${d.forma};calendario=${d.calendario.local}/${d.calendario.visitante};acta=${d.acta.local}/${d.acta.visitante}`,
        });
      }
      if (equipos.decision.actaSinResolver) {
        incidenciasActa.push({
          codigo: 'EQUIPOS_ACTA_SIN_RESOLVER',
          parametros: `calendario=${partido.local}/${partido.visitante}`,
        });
      }

      await repo.upsert(
        'core.match_report',
        {
          match_id: matchId,
          quality,
          parser_version: Number(acta.version_parser ?? 0),
          archivo_ruta: acta.archivo,
          archivo_hash: acta.hash,
          source_updated_at: acta.comprobada_en,
          incidencias: JSON.stringify(incidenciasActa),
        },
        ['match_id'],
        // `core.match_report` no tiene columna `id`: su clave primaria es el propio partido, y el diario
        // tiene que guardar ESA clave para poder borrar o restaurar la fila.
        { devolver: 'match_id', clavePrimaria: ['match_id'] },
      );

      if (quality === 'unavailable') continue;

      /* participaciones (apariciones) */
      const filasParticipacion = cola.participaciones({ temporada: acta.temporada, competicion: acta.competicion, grupo: acta.grupo, jornada: acta.jornada, codigo: acta.codigo });
      const apariciones: Array<{ valores: Record<string, unknown>; conflicto: string[] }> = [];
      for (const p of filasParticipacion) {
        const ladoCanonico = lado(p.lado, contextoCtx);
        const condicion = condicionParticipacion(p.condicion, contextoCtx);
        const teamEntryId = entradaDeLado(ladoCanonico);
        if (!teamEntryId) {
          rechazadas.push({ motivo: 'participación sin equipo resoluble', fila: `acta ${acta.codigo} ${p.lado} ${p.nombre}` });
          continue;
        }
        const codigoJugador = String(p.jugador_codigo ?? '').trim();
        // Sin código federativo NO se inventa uno con el nombre: eso uniría a todos los que se llaman
        // igual en toda la federación. Se resuelve como identidad nominal dentro de su equipo.
        const persona = codigoJugador !== ''
          ? await personas.conCodigo({
            federacionId, codigo: codigoJugador, nombre: p.nombre, esMenor: Number(p.menores) === 1,
            primeraActa: null, ultimaActa: acta.codigo,
          })
          : await personas.jugadorSinCodigo({
            federacionId, etiquetaTemporada, nombre: p.nombre, esMenor: Number(p.menores) === 1,
            teamEntryId,
          });
        apariciones.push({
          valores: {
            match_id: matchId,
            person_id: persona.personId,
            team_entry_id: teamEntryId,
            season_id: seasonId,
            lado: ladoCanonico,
            condition: condicion,
            dorsal: p.dorsal,
            portero: Number(p.portero) === 1,
            orden: p.orden,
          },
          // La clave natural lleva `condition` porque el `orden` de la fuente sólo es único DENTRO de cada
          // condición (el recolector numera titulares y suplentes por separado). Sin ella, el mismo nombre
          // publicado como titular y como suplente con el mismo `orden` rompía la tanda entera con «ON
          // CONFLICT DO UPDATE command cannot affect row a second time»: 9 grupos medidos el 24/09/2026.
          // Ver la migración 0016.
          conflicto: ['match_id', 'team_entry_id', 'person_id', 'condition', 'orden'],
        });
      }
      await repo.upsertMasivo('core.appearance', apariciones);
      // Lo que este lote confirma de la alineación se anota para retirar lo demás al cerrar (igual que la
      // ficha de cuerpo técnico). Antes sólo se hacía con los partidos de equipos REPARADOS; desde el
      // 13/10/2026 con todos: en la temporada en curso la federación corrige actas (quita un convocado, cambia
      // un dorsal) y la fila vieja se quedaba al lado de la nueva. CyL 2026-27, grupo 24218942: el canónico
      // tenía 624 participaciones y el acta corregida 622, y la validación (con razón) no dejaba entrar el
      // grupo, con 14 partidos nuevos detrás.
      if (equipos.decision.reparado) partidosReparados.push(matchId);
      partidosConAlineacionReescrita.add(matchId);
      for (const aparicion of apariciones) {
        aparicionesConfirmadas.push({
          match_id: Number(aparicion.valores.match_id),
          team_entry_id: Number(aparicion.valores.team_entry_id),
          person_id: Number(aparicion.valores.person_id),
          orden: Number(aparicion.valores.orden),
          condicion: String(aparicion.valores.condition),
        });
      }

      /* eventos */
      const filasEvento = cola.eventos({ temporada: acta.temporada, competicion: acta.competicion, grupo: acta.grupo, jornada: acta.jornada, codigo: acta.codigo });
      const eventos: Array<{ valores: Record<string, unknown>; conflicto: string[] }> = [];
      for (const e of filasEvento) {
        const mapeo = tipoEvento(e.tipo, e.subtipo, contextoCtx);
        const sujeto = sujetoTipo(e.sujeto_tipo, contextoCtx);
        const ladoEvento = ladoOpcional(e.lado, contextoCtx);
        const ladoBeneficiado = ladoOpcional(e.lado_beneficiado, contextoCtx);
        let personId: number | null = null;
        const codigoEvento = String(e.jugador_codigo ?? '').trim();
        if (sujeto !== 'desconocido' && codigoEvento !== '') {
          const persona = await personas.conCodigo({
            federacionId, codigo: codigoEvento, nombre: String(e.nombre ?? ''),
            esMenor: Number(e.menores) === 1, primeraActa: null, ultimaActa: acta.codigo,
          });
          personId = persona.personId;
        }
        const teamEntryId = entradaDeLado(ladoEvento);
        // Un goleador sin código sí se puede identificar por su nombre dentro del equipo que marca:
        // antes se quedaba sin persona y el gol no tenía autor. Sin equipo resoluble no se inventa
        // nada: el evento queda sin persona, que es la verdad.
        if (personId === null && sujeto !== 'desconocido' && codigoEvento === '' && teamEntryId !== null) {
          const nombreEvento = String(e.nombre ?? '').trim();
          if (nombreEvento !== '') {
            const persona = await personas.jugadorSinCodigo({
              federacionId, etiquetaTemporada, nombre: nombreEvento, esMenor: Number(e.menores) === 1, teamEntryId,
            });
            personId = persona.personId;
          }
        }
        eventos.push({
          valores: {
            match_id: matchId,
            person_id: personId,
            team_entry_id: teamEntryId,
            event_type: mapeo.event_type,
            subtipo: mapeo.subtipo,
            minute_base: e.minuto_base ?? e.minuto ?? null,
            minute_added: e.minuto_anadido ?? null,
            lado: ladoEvento,
            lado_beneficiado: ladoBeneficiado,
            sujeto_tipo: sujeto,
            source_order: e.orden,
          },
          conflicto: ['match_id', 'source_order'],
        });
      }
      await repo.upsertMasivo('core.match_event', eventos);

      /* cuerpo técnico: persona nominal con ámbito de EQUIPO */
      const filasTecnico = cola.tecnicos({ temporada: acta.temporada, competicion: acta.competicion, grupo: acta.grupo, jornada: acta.jornada, codigo: acta.codigo });
      for (const t of filasTecnico) {
        const ladoTecnico = ladoOpcional(t.lado, contextoCtx);
        const teamEntryId = entradaDeLado(ladoTecnico);
        const nombre = String(t.nombre ?? '').trim();
        if (nombre === '') continue;
        const rolLiteral = String(t.rol ?? '').trim();
        const { rol, reconocido } = resuelveRolTecnico(rolLiteral);
        // Un rol que no encaja en el vocabulario medido no se descarta ni se convierte en «otro»: se
        // usa tal cual (normalizado) y se registra, para poder medirlo y añadirlo con conocimiento.
        if (!reconocido && rol !== '') await registraRolSinMedir(cliente, batchId, federacion, rolLiteral, rolesSinMedir);
        // Sin lado conocido el ámbito es la edición, declarado como tal (ver ambitoNominalTecnico).
        const ambitoTecnico = ambitoNominalTecnico(teamEntryId, edicionId);
        const persona = await personas.nominal({
          federacionId, etiquetaTemporada, nombre, rol,
          ambito: ambitoTecnico.ambito, ambitoId: ambitoTecnico.id, esMenor: false,
        });
        await repo.upsert(
          'core.match_staff',
          { match_id: matchId, person_id: persona.personId, team_entry_id: teamEntryId, rol: rolLiteral },
          ['match_id', 'person_id', 'rol'],
        );
        staffEscrito.push({ match_id: matchId, person_id: persona.personId, rol: rolLiteral });
      }
    }

    // Reconciliación de la ficha de cuerpo técnico: de los partidos que este lote reescribe, lo que el    // lote no confirma se retira. Sin esto, reimportar un grupo con la identidad corregida duplicaba
    // las fichas (medido en Cataluña: 2.552 filas de origen acabaron siendo 4.475 en el canónico,
    // porque la identidad vieja y la nueva convivían). No es borrar datos de la fuente: es no dejar
    // dos fichas donde la fuente trae una.
    const partidosDelLote = [...matchIdPorClave.values()];
    const { rowCount: staffRetirado } = await cliente.query(
      `delete from core.match_staff s
        where s.match_id = any($1::bigint[])
          and not exists (
            select 1 from unnest($2::bigint[], $3::bigint[], $4::text[]) as v(match_id, person_id, rol)
             where v.match_id = s.match_id and v.person_id = s.person_id and v.rol = s.rol)`,
      [partidosDelLote, staffEscrito.map((f) => f.match_id), staffEscrito.map((f) => f.person_id), staffEscrito.map((f) => f.rol)],
    );

    // Y lo mismo con las apariciones de los partidos a los que este lote ha cambiado los equipos: de
    // esos partidos sólo sobrevive lo que el lote confirma. Sin esto, reasignar un equipo dejaba dos
    // plantillas donde el acta trae una (una en cada equipo) y el recuento origen/destino lo delataba
    // como un lote fallido, con razón.
    let aparicionesRetiradas = 0;
    if (partidosConAlineacionReescrita.size > 0) {
      const { rowCount } = await cliente.query(
        `delete from core.appearance a
          where a.match_id = any($1::bigint[])
            and not exists (
              select 1 from unnest($2::bigint[], $3::bigint[], $4::bigint[], $5::smallint[], $6::text[])
                as v(match_id, team_entry_id, person_id, orden, condicion)
               where v.match_id = a.match_id and v.team_entry_id = a.team_entry_id
                 and v.person_id = a.person_id and v.orden = a.orden and v.condicion = a.condition::text)`,
        [
          [...partidosConAlineacionReescrita],
          aparicionesConfirmadas.map((f) => f.match_id),
          aparicionesConfirmadas.map((f) => f.team_entry_id),
          aparicionesConfirmadas.map((f) => f.person_id),
          aparicionesConfirmadas.map((f) => f.orden),
          aparicionesConfirmadas.map((f) => f.condicion),
        ],
      );
      aparicionesRetiradas = rowCount ?? 0;
    }

    /*
     * ── PARTIDOS QUE LA FUENTE YA NO PUBLICA (14/10/2026) ───────────────────────────────────────────────────
     *
     * En la temporada en curso la federación quita o recoloca partidos (un aplazado que cambia de jornada, una
     * fase corta que se rehace), y la fila vieja se quedaba en el canónico: «partidos 4≠5» en Navarra 2026-27,
     * grupo 23018560, y lo mismo en dos grupos de Euskadi 2026-27. Se retiran los partidos del grupo que este
     * lote no ha escrito, con todo lo que cuelga de ellos, y queda un aviso.
     *
     * CON TOPE, a propósito: si faltan MUCHOS (más de 2 y más del 10 % del grupo), lo más probable no es una
     * corrección de la fuente sino un origen viejo o incompleto, y borrar sería perder datos buenos. Entonces no
     * se retira nada y la validación falla como siempre («el ORIGEN trae menos»), que es lo seguro.
     */
    const { rows: sobrantes } = await cliente.query<{ id: string }>(
      `select id from core.match where phase_group_id = $1 and not (id = any($2::bigint[]))`,
      [phaseGroupId, partidosDelLote],
    );
    const topeRetirada = Math.max(2, Math.floor(partidosDelLote.length * 0.1));
    if (sobrantes.length > 0 && sobrantes.length <= topeRetirada) {
      const ids = sobrantes.map((f) => Number(f.id));
      for (const tabla of ['core.match_event', 'core.appearance', 'core.match_staff', 'core.match_official', 'core.match_report', 'core.match_source']) {
        await cliente.query(`delete from ${tabla} where match_id = any($1::bigint[])`, [ids]);
      }
      await cliente.query(`delete from core.match where id = any($1::bigint[])`, [ids]);
      await cliente.query(
        `delete from source.external_ref where federation_id = $1 and entity_type = 'partido' and canonical_id = any($2::bigint[])`,
        [federacionId, ids],
      );
      await registraAvisoDeLote(cliente, batchId, 'partidos_que_la_fuente_ya_no_publica', {
        federacion, grupo: grupo.codigo, partidos: ids.length, consecuencia: 'retirados del canónico con lo que colgaba de ellos',
      });
    } else if (sobrantes.length > topeRetirada) {
      await registraAvisoDeLote(cliente, batchId, 'partidos_de_mas_en_el_canonico_sin_retirar', {
        federacion, grupo: grupo.codigo, partidos: sobrantes.length, tope: topeRetirada,
        consecuencia: 'demasiados para ser una corrección de la fuente: no se retira nada (¿origen viejo?)',
      });
    }

    // Árbitro que la fuente ya no publica para ese partido: se retira la designación vieja. CyL 2026-27,
    // grupo 24219046: 22 designaciones en el canónico contra 21 en el calendario corregido.
    if (partidosSinArbitro.length > 0) {
      await cliente.query(
        `delete from core.match_official where rol = 'principal' and match_id = any($1::bigint[])`,
        [partidosSinArbitro],
      );
    }

    // Seguimiento de personas (primera y última acta vistas, y quién es menor) en una sola sentencia.
    await personas.vuelca();

    // Clasificación reconstruida hasta la última jornada completa, con las reglas probadas de
    // `packages/dominio`. Se marca `origen = 'reconstruida'`: no es la oficial y no se presenta como tal.
    const clasificacion = await reconstruyeClasificacion(cliente, repo, {
      phaseGroupId, partidos, entradaPorPartido, nombrePorEntrada, correcciones: correccionesDelCalendario,
    });

    // Clasificación OFICIAL archivada, si la federación la publicó. Se guarda aparte (`origen`), y si
    // no cuadra con la reconstruida se registra la diferencia en vez de elegir en silencio.
    //
    // El catálogo se monta AQUÍ, no a partir de la reconstruida: la tabla oficial se tiene que poder
    // importar aunque el grupo no tenga todavía ninguna jornada completa (una temporada que acaba de
    // empezar), y en ese caso `clasificacion` es null.
    const catalogo: CatalogoEquipos = {
      // Sólo las inscripciones que TIENEN código: la tabla oficial lo publica y es identidad fuerte
      // dentro del ámbito. Las contextuales se resuelven por nombre, que es la vía que ya existía.
      porCodigo: new Map(equipos
        .filter((e) => e.codigoExterno !== null)
        .map((e) => [e.codigoExterno!, entradaPorClave.get(e.clave)!])
        .filter((par): par is [string, number] => par[1] !== undefined)),
      // Indexado por nombre NORMALIZADO: es la forma en la que se busca siempre, tanto la del
      // calendario como la de la tabla oficial.
      porNombre: new Map([...nombrePorEntrada].map(([entrada, nombre]) => [normalizadoPorNombre.get(nombre) ?? nombre, entrada])),
      porClub: new Map([...porClubDeGrupo(equipos, normalizadoPorNombre)]
        .map(([club, clave]) => [club, entradaPorClave.get(clave)])
        .filter((par): par is [string, number] => par[1] !== undefined)),
    };
    /*
     * ── RESOLVER POR EL CÓDIGO QUE PUBLICA LA PROPIA TABLA OFICIAL ────────────────────────────────────────
     *
     * El catálogo de arriba se monta con los equipos que HAN JUGADO, y la tabla oficial lista a TODOS los
     * inscritos: en un grupo de jornada 1 o 2 media tabla no está en el catálogo y la tabla ENTERA se
     * descartaba. Medido el 26/09/2026: **1.358 grupos** rechazados por esto en quince federaciones (Madrid,
     * Valencia, Aragón y Cataluña los que más).
     *
     * No hacía falta perderlos: cada fila de la tabla trae el código federativo de su equipo, así que la
     * inscripción se busca o se crea por él con `resuelveEquipo` —el MISMO camino que usa el calendario, con
     * sus mismas reglas: club por nombre normalizado, equipo-temporada por (club, temporada, nombre) e
     * inscripción por (equipo-temporada, grupo)—, en vez de exigir que ya exista.
     *
     * Lo que NO cambia: el código lo publica la fuente y no se fabrica; si la fila no trae código, esta vía no
     * se usa y la tabla se descarta como hasta hoy; y una fila que siga sin resolver sigue descartando la
     * tabla entera (no se escribe media tabla). La inscripción resuelta entra en el catálogo del grupo en
     * cuanto se resuelve, así que las filas siguientes y el resto del lote encuentran la MISMA identidad.
     */
    const resuelvePorCodigoPublicado = async (
      fila: { equipo: string; equipoCodigo: string },
    ): Promise<number | null> => {
      const yaEnElCatalogo = catalogo.porCodigo.get(fila.equipoCodigo);
      if (yaEnElCatalogo !== undefined) return yaEnElCatalogo;
      // El nombre publicado se limpia como cualquier otro: la tabla también pega marcadores de estado.
      const separado = separaNombreYEstado(fila.equipo);
      const normalizado = normalizaNombreEquipo(separado.nombreEquipo);
      const inscripcion: InscripcionDeGrupo = {
        clave: fila.equipoCodigo,
        codigoExterno: fila.equipoCodigo,
        referenciaContextual: null,
        metodo: 'codigo-externo',
        nombre: separado.nombreEquipo,
        normalizado,
        // La procedencia se declara: a este equipo lo hemos visto citado en la CLASIFICACIÓN.
        procedencias: ['clasificacion'],
        alias: [fila.equipo],
        marcadoresEstado: separado.marcadoresEstado,
      };
      const resuelto = await resuelveEquipo(cliente, repo, normalizador, {
        federacionId, seasonId, etiquetaTemporada, competicion: grupo.competicion, grupo: grupo.codigo,
        phaseGroupId, inscripcion, categoria: categoria.categoria, genero: genero.genero,
      });
      catalogo.porCodigo.set(fila.equipoCodigo, resuelto.teamEntryId);
      if (normalizado !== '') catalogo.porNombre.set(normalizado, resuelto.teamEntryId);
      entradaPorClave.set(resuelto.clave, resuelto.teamEntryId);
      nombrePorEntrada.set(resuelto.teamEntryId, inscripcion.nombre);
      return resuelto.teamEntryId;
    };
    /*
     * ── LA TABLA OFICIAL ILEGIBLE NO PUEDE TUMBAR EL GRUPO ────────────────────────────────────────────
     *
     * `importaClasificacionOficial` valida la tabla publicada (reglas R1…R7 documentadas en
     * `clasificacion-oficial-json.ts`) y lanza `TablaOficialInvalida` si no cuadra. Hacerlo está bien:
     * media tabla oficial engañaría y no se escribe.
     *
     * Lo que estaba mal era la consecuencia. La excepción subía y **revertía el lote ENTERO**, así que una
     * clasificación mal publicada se llevaba por delante los partidos, las actas, los jugadores, los goles
     * y los minutos de ese grupo — que no tienen nada que ver con la clasificación y están perfectamente
     * bien. Medido el 24/09/2026: **184 grupos de Cataluña rechazados por su tabla de clasificación**, y
     * con ellos toda su cobertura de jugadores.
     *
     * Es el mismo error de fondo que ya costó 126 grupos de 193 en Castilla y León: confundir «este dato
     * auxiliar no sirve» con «este grupo no sirve».
     *
     * Ahora: no se escribe la tabla oficial, se deja el aviso con el motivo exacto, y el grupo se importa
     * con normalidad. La ausencia de tabla oficial ya era un estado normal —cuando la federación no la ha
     * publicado, esto devuelve `null` y el lote sigue—; lo único que cambia es que una tabla ilegible se
     * trata igual que una tabla ausente, en vez de como una catástrofe.
     */
    let clasificacionOficial: ResumenOficial | null = null;
    /*
     * Y el ESTADO de la tabla oficial queda escrito donde se puede leer. `ops.normalizacion_error` no lo ve el
     * rol de lectura, así que sin esto una consulta no puede distinguir «la federación no la ha publicado» de
     * «se archivó y no se pudo leer»: medido el 25/09/2026, 676 capturas de Cataluña rechazadas por sus
     * propias validaciones y 736 grupos sin tabla oficial y sin forma de saber por qué (v. migración 0019).
     *
     * ── Y NO BASTABA CON TRES ESTADOS (medido el 25/09/2026, migración 0020) ────────────────────────────
     *
     * Al ir a importar las 7.980 tablas archivadas y sin importar salió que baleares, galicia y euskadi tienen
     * la clasificación archivada —con la tabla dentro— y CERO tablas oficiales dentro. La causa no era «no la
     * publica» ni «la publica mal»: es que la publican con otra maqueta y el lector saca cero filas. Eso es un
     * hueco nuestro, y se dice con su nombre (`ilegible`), no metido en «sin_archivar».
     */
    let tablaOficialEstado: EstadoTablaOficial = 'sin_archivar';
    /*
     * ── LA JORNADA DE CORTE: LA ÚLTIMA QUE EXISTA, Y SI NO ESTÁ COMPLETA SE DICE (decisión del 27/09/2026) ──
     *
     * `clasificacion?.matchdayId` es la última jornada COMPLETA reconstruida, o sea una fecha verificada. Cuando
     * no hay ninguna —una temporada que acaba de empezar, o un calendario recogido a medias— el importador no
     * escribía la tabla, y eso dejaba **1.404 grupos** sin su clasificación oficial teniendo el archivo legible.
     *
     * Desde ahora se ancla a la **última jornada que exista** del grupo, esté completa o no, y la salvedad viaja
     * con la foto: `corteCompleto` la lleva al aviso del lote y a `ops.coverage_checkpoint`, que es lo que lee
     * el rol de lectura (migración 0022). Sin eso, la web enseñaría la tabla como una foto de fecha confirmada.
     *
     * Y el estado `sin_corte` NO desaparece: sigue siendo lo correcto para un grupo sin ninguna jornada, donde
     * no hay absolutamente nada de lo que colgar la tabla.
     */
    const ultimaJornadaDelGrupo = [...matchdayPorNumero.keys()].sort((a, b) => b - a)[0] ?? null;
    const matchdayIdDeCorte = clasificacion?.matchdayId
      ?? (ultimaJornadaDelGrupo === null ? null : matchdayPorNumero.get(ultimaJornadaDelGrupo)!);
    const corteCompleto = clasificacion !== null;
    try {
      clasificacionOficial = await importaClasificacionOficial(cliente, repo, {
        raizCola: dirname(cola.ruta),
        temporada,
        competicion: grupo.competicion,
        grupo: grupo.codigo,
        batchId,
        federacion,
        phaseGroupId,
        matchdayId: matchdayIdDeCorte,
        corteCompleto,
        catalogo,
        resuelvePorCodigoPublicado,
        normalizaVarios: (textos: string[]) => normalizador.normalizaVarios(textos),
        reconstruida: clasificacion?.puntosPorEquipo ?? new Map(),
        // Sólo se contrasta con la temporada terminada: a mitad de temporada la tabla oficial es de otra
        // fecha y las diferencias serían ruido, no un hallazgo.
        comparar: clasificacion !== null && (grupo.jornadas ?? 0) > 0 && clasificacion.jornada >= (grupo.jornadas ?? 0),
      });
      if (clasificacionOficial !== null) {
        tablaOficialEstado = 'importada';
      } else {
        // No se escribió nada: se dice POR QUÉ, mirando el archivo con el mismo lector.
        const diagnostico = diagnosticaTablaOficial({
          raizCola: dirname(cola.ruta), temporada, competicion: grupo.competicion, grupo: grupo.codigo,
        });
        tablaOficialEstado = diagnostico.estado === 'legible' ? 'sin_corte' : diagnostico.estado;
        if (diagnostico.estado === 'ilegible') {
          await registraAvisoDeLote(cliente, batchId, 'clasificacion_oficial_ilegible_para_el_lector', {
            federacion, competicion: grupo.competicion, grupo: grupo.codigo,
            motivo: diagnostico.motivo,
            consecuencia: 'el grupo se importa igual; la tabla oficial archivada no se puede usar con el lector de hoy',
          });
        }
      }
    } catch (error) {
      if (!(error instanceof TablaOficialInvalida)) throw error;
      tablaOficialEstado = 'rechazada';
      await registraAvisoDeLote(cliente, batchId, 'clasificacion_oficial_ilegible', {
        federacion, competicion: grupo.competicion, grupo: grupo.codigo,
        motivo: error.motivo,
        detalle: error.detalle,
        consecuencia: 'el grupo se importa igual; sólo se pierde la tabla oficial de este grupo',
      });
    }
    // El estado de la tabla oficial, en la tabla que la web LEE (v. migración 0019).
    /*
     * ── Y CON QUÉ ARCHIVO SE DECIDIÓ, que es lo que evita pedir dos veces lo mismo (migración 0021) ─────
     *
     * Sin la fecha del archivo, el plan sólo podía preguntar «¿hay clasificación legible?» y volvía a pedir
     * los mismos 1.394 grupos en cada pasada, porque el motivo de no escribirlos (los equipos no se resuelven
     * dentro de su grupo, dos filas al mismo equipo, o no hay jornada de corte) sólo se ve al importar.
     */
    /*
     * ── POR QUÉ ES UN `insert … on conflict` Y NO UN `update` (medido el 27/09/2026) ──────────────────────
     *
     * La fila de `ops.coverage_checkpoint` se crea al FINAL del lote, así que en la PRIMERA importación de un
     * grupo este `update` no encontraba fila y no escribía nada: el estado de la tabla oficial se quedaba en
     * NULL hasta que alguien reimportaba el grupo o pasaba `revisa-tabla-oficial.mts`. Eso explica los 177
     * grupos «sin calcular» y por qué hubo que escribir aquella herramienta para rellenarlos a posteriori.
     * Con el upsert, el veredicto se guarda la primera vez que se decide, que es cuando se decide.
     *
     * El upsert de cobertura del final del lote NO toca estas columnas (su `do update set` no las nombra), así
     * que este valor no se pisa.
     */
    await cliente.query(
      `insert into ops.coverage_checkpoint
          (phase_group_id, tabla_oficial_estado, tabla_oficial_archivo_en, tabla_oficial_corte_completo)
       values ($1, $2, $3, $4)
       on conflict (phase_group_id) do update set
          tabla_oficial_estado = excluded.tabla_oficial_estado,
          tabla_oficial_archivo_en = excluded.tabla_oficial_archivo_en,
          tabla_oficial_corte_completo = excluded.tabla_oficial_corte_completo`,
      [phaseGroupId, tablaOficialEstado,
        mtimeDelArchivo({ raizCola: dirname(cola.ruta), temporada, competicion: grupo.competicion, grupo: grupo.codigo }),
        // Sólo se afirma algo de la fecha si hay tabla escrita: sin tabla no hay foto de la que dudar.
        clasificacionOficial === null ? null : corteCompleto],
    );

    /*
     * ── LAS FILAS IMPOSIBLES SE DESCARTAN, PERO SE DICEN ─────────────────────────────────────────────────
     *
     * Una fila que pone al mismo equipo en los dos lados no es un partido —medido el 24/09/2026: 91 filas en
     * 20 grupos, todas con dos códigos federativos para el mismo nombre—. `Origen.partidos()` ya no las
     * devuelve y `recuentos()` ya las descuenta, así que el grupo entra; aquí queda ESCRITO cuántas eran y
     * qué decían, porque un descarte que no se ve es un descarte que nadie puede revisar.
     */
    const imposibles = cola.cuentaImposibles(ambito);
    if (imposibles.total > 0) {
      await registraAvisoDeLote(cliente, batchId, 'fila_de_partido_con_el_mismo_equipo_en_los_dos_lados', {
        federacion, competicion: grupo.competicion, grupo: grupo.codigo,
        filas: imposibles.total,
        conResultado: imposibles.conResultado,
        conActaCitada: imposibles.conActa,
        consecuencia: 'esas filas no se importan; el resto del grupo sí',
      });
    }
    const calendario = await revisaCuadreDelCalendario(cliente, {
      phaseGroupId, batchId, federacion, grupo: grupo.codigo,
    });

    const cobertura = await recalculaCobertura(cliente, {
      phaseGroupId, edicionId, jornadasEsperadas: grupo.jornadas, jornadas, partidos, resumen,
    });
    const validacion = await validaLote(cliente, cola, ambito, { matchIdPorClave, phaseGroupId, actasApartadas });
    const cambios = await repo.persisteDiario();
    await cliente.query(
      `update ops.batch set estado = $2, terminado_en = now(), filas_insertadas = $3, filas_actualizadas = $4,
         filas_rechazadas = $5, validacion = $6::jsonb where id = $1`,
      [batchId, validacion.ok ? 'validado' : 'fallido', suma(contadores, 'insertadas'), suma(contadores, 'actualizadas'),
        rechazadas.length, JSON.stringify({ ...validacion, cambios, cobertura, staff_obsoleto_retirado: staffRetirado ?? 0, apariciones_obsoletas_retiradas: aparicionesRetiradas, partidos_con_equipos_rea_signados: partidosReparados.length, clasificacion, clasificacion_oficial: clasificacionOficial, calendario,
          // Se declara si este lote se puede revertir. Un diario omitido NO es un detalle: es la
          // diferencia entre poder deshacer el lote y no poder, y tiene que quedar escrito.
          diario: repo.guardaDiario ? 'completo' : 'omitido' })],
    );
    if (!validacion.ok) {
      // Un lote que no cuadra no se publica ni se deja a medias: se revierte entero.
      // Cuando TODAS las diferencias son «el origen tiene menos que el canónico», lo normal es que el origen sea
      // una cola vieja (p. ej. la cola parada del PC de una temporada que recoge el servidor): se dice, porque
      // leído a secas parece una pérdida del importador. Medido el 12/10/2026 en CyL 2016-17 y Ceuta 2017-18.
      const origenMenor = validacion.diferencias.every((d) => d.origen < d.destino);
      const pista = origenMenor
        ? ' (el ORIGEN trae menos que el canónico: ¿cola vieja? Importa desde el paquete del servidor; el canónico queda como estaba)'
        : '';
      throw new Error(`La validación del lote ${batchId} ha fallado: ${validacion.diferencias.map((d) => `${d.entidad} ${d.origen}≠${d.destino}`).join(', ')} [origen≠canónico]${pista}`);
    }
    return { batchId, validacion, cobertura, clasificacionOficial, calendario, partidosReparados: partidosReparados.length, aparicionesRetiradas };
}

/**
 * Nombre de club (sin la letra de equipo) → CLAVE de inscripción, sólo cuando es inequívoco en el grupo.
 *
 * Es la tercera vía de resolución de la tabla oficial y necesita justificación: en el grupo 54322933 de
 * Cataluña la tabla publicada dice «ARGENTONA, C.F. A» donde el calendario dice «ARGENTONA, C.F. B», y
 * las 16 filas coinciden exactamente con la clasificación reconstruida (mismo registro y mismos puntos)
 * bajo esa correspondencia. Si un club tuviera DOS equipos en el mismo grupo, su nombre de club no
 * entraría aquí y la fila quedaría sin resolver: ante la duda, no se une nada.
 *
 * El valor es la CLAVE y no el código porque un equipo puede no tener código federativo: con
 * `codigo_externo` nulo, la inscripción sigue teniendo identidad dentro del grupo.
 */
function porClubDeGrupo(equipos: InscripcionDeGrupo[], normalizadoPorNombre: Map<string, string>): Map<string, string> {
  const porClub = new Map<string, string>();
  const ambiguos = new Set<string>();
  for (const inscripcion of equipos) {
    const club = nombreDeClub(normalizadoPorNombre.get(inscripcion.nombre) ?? inscripcion.nombre);
    const previo = porClub.get(club);
    if (previo !== undefined && previo !== inscripcion.clave) { ambiguos.add(club); continue; }
    porClub.set(club, inscripcion.clave);
  }
  for (const club of ambiguos) porClub.delete(club);
  return porClub;
}

/**
 * Registra un aviso medible del lote en `ops.normalizacion_error`.
 *
 * No detiene el lote: deja rastro para poder contarlo. Un aviso que no se puede contar no sirve para
 * decidir si hay que ampliar un vocabulario, corregir un extractor o revisar una fuente.
 */
async function registraAvisoDeLote(
  cliente: ClienteCanonico,
  batchId: number,
  codigo: string,
  parametros: Record<string, unknown>,
): Promise<void> {
  await cliente.query(
    `insert into ops.normalizacion_error (batch_id, codigo, parametros) values ($1, $2, $3::jsonb)`,
    [batchId, codigo, JSON.stringify(parametros)],
  );
}

/**
 * Registra un rol que no está en el vocabulario medido.
 *
 * No detiene el lote —el rol es texto libre y el literal se conserva íntegro en `core.match_staff.rol`
 * y en `core.person_name`— pero deja rastro medible: `select parametros, count(*) from
 * ops.normalizacion_error group by 1 order by 2 desc` dice qué literales hay que añadir y cuánto pesan.
 */
async function registraRolSinMedir(
  cliente: ClienteCanonico,
  batchId: number,
  federacion: string,
  literal: string,
  yaRegistrados: Set<string>,
): Promise<void> {
  const clave = literal.toLowerCase();
  if (yaRegistrados.has(clave)) return;
  yaRegistrados.add(clave);
  await registraAvisoDeLote(cliente, batchId, 'rol_tecnico_sin_medir', { federacion, literal });
}

/**
 * Decide qué dos equipos jugaron el partido que cita un acta, y deja rastro de la decisión.
 *
 * El calendario de la cola manda en la programación, pero no es la única fuente sobre QUIÉN jugó: el
 * acta nombra a los dos equipos y todo su contenido (alineaciones, goles, tarjetas, cuerpo técnico y
 * marcador) es relativo a esa pareja. Cuando las dos filas se contradicen, la contradicción se
 * registra —nunca se resuelve en silencio— y sólo se corrige cuando es demostrable.
 *
 * El detalle del fallo que motivó esta comprobación está en `resolucion/equipos-acta.ts`.
 */
async function decideEquiposDelActa(
  cliente: ClienteCanonico,
  repo: Repositorio,
  normalizador: Normalizador,
  datos: {
    batchId: number;
    federacion: string;
    grupo: string;
    jornada: number;
    acta: FilaActa;
    partido: FilaPartido;
    matchId: number;
    clavePorNombre: Map<string, string>;
    claveLocal: string | null;
    claveVisitante: string | null;
    entradaPorClave: Map<string, number>;
    nombrePorEntrada: Map<number, string>;
    apariciones: Map<string, number>;
  },
): Promise<EquiposEfectivos> {
  const { partido } = datos;
  const declarado = equiposDeclaradosPorActa(datos.acta.datos);
  // El calendario puede traer el marcador de estado pegado al nombre y el acta no: `(Sailkatua) ALAVES
  // "B"` frente a `ALAVES B`. Comparar los literales crudos daría «no se corresponden» en casi todos los
  // partidos de Euskadi y detendría el lote entero, que es el fallo que dejaba la federación fuera del
  // canónico. Se compara el nombre LIMPIO de los dos lados, que es la regla documentada: un marcador de
  // estado no forma parte del nombre del equipo.
  const limpioDe = (texto: string): string => separaNombreYEstado(texto).nombreEquipo;
  const normalizados = await normalizador.normalizaVarios([
    limpioDe(partido.local), limpioDe(partido.visitante),
    partido.local, partido.visitante,
    ...(declarado ? [declarado.local, declarado.visitante] : []),
  ]);
  const normaliza = (texto: string): string => {
    const sinMarcador = limpioDe(texto);
    return normalizados.get(sinMarcador) ?? normalizados.get(texto) ?? sinMarcador;
  };

  const decision = reconciliaEquiposDelPartido({
    calendario: {
      localClave: datos.claveLocal,
      visitanteClave: datos.claveVisitante,
      local: partido.local,
      visitante: partido.visitante,
    },
    acta: declarado,
    clavePorNombre: datos.clavePorNombre,
    normaliza,
    localFantasmaJuegaOtroPartido: partido.equipo_local_codigo
      ? (datos.apariciones.get(partido.equipo_local_codigo) ?? 0) > 1
      : true,
  });

  if (decision.actaSinResolver) {
    // Comprobación que NO se ha podido hacer: el acta nombra equipos que este grupo no resuelve (o que
    // resuelven a dos equipos distintos). No se corrige —resolver por parecido sería inventar— pero se
    // registra por partido, porque una comprobación que no se hace no es una comprobación que sale bien.
    await registraAvisoDeLote(cliente, datos.batchId, 'partido_equipo_de_acta_sin_resolver', {
      federacion: datos.federacion,
      grupo: datos.grupo,
      jornada: datos.jornada,
      orden: partido.orden,
      codigo_acta: datos.acta.codigo,
      calendario: `${partido.local} / ${partido.visitante}`,
      acta: declarado ? `${declarado.local} / ${declarado.visitante}` : null,
    });
  } else if (decision.discrepancia) {
    // La contradicción queda registrada siempre, se corrija o no.
    await registraAvisoDeLote(cliente, datos.batchId, 'partido_equipo_no_cuadra_con_acta', {
      federacion: datos.federacion,
      grupo: datos.grupo,
      jornada: datos.jornada,
      orden: partido.orden,
      codigo_acta: datos.acta.codigo,
      forma: decision.discrepancia.forma,
      calendario: `${decision.discrepancia.calendario.local} / ${decision.discrepancia.calendario.visitante}`,
      acta: `${decision.discrepancia.acta.local} / ${decision.discrepancia.acta.visitante}`,
      corregido: decision.reparado,
    });
  }

  // La pareja efectiva tiene que ser de ESTE grupo: un partido nunca cruza dos grupos. Si el código
  // resuelto no está en el grupo, la decisión es inservible y el lote se detiene.
  const entradaDeCodigo = (codigo: string | null): number | null => {
    if (!codigo) return null;
    const entrada = datos.entradaPorClave.get(codigo);
    if (entrada === undefined) {
      throw new Error(
        `El equipo ${codigo} del partido J${partido.jornada} orden ${partido.orden} no está inscrito en el grupo ${datos.grupo}`,
      );
    }
    return entrada;
  };
  const entradaLocal = entradaDeCodigo(decision.local);
  const entradaVisitante = entradaDeCodigo(decision.visitante);

  if (decision.reparado) {
    await repo.actualiza(
      'core.match',
      { home_team_entry_id: entradaLocal, away_team_entry_id: entradaVisitante },
      { id: datos.matchId },
    );
  }
  // El nombre que se devuelve es el de la INSCRIPCIÓN (el mismo que usa el calendario para ese equipo en
  // el resto del grupo), no el literal del acta: la clasificación reconstruida se calcula por nombre, y
  // dos literales distintos del mismo equipo partirían la tabla en dos.
  return {
    entradaLocal,
    entradaVisitante,
    nombreLocal: entradaLocal === null ? partido.local : (datos.nombrePorEntrada.get(entradaLocal) ?? partido.local),
    nombreVisitante: entradaVisitante === null ? partido.visitante : (datos.nombrePorEntrada.get(entradaVisitante) ?? partido.visitante),
    decision,
  };
}

function suma(contadores: Contadores, campo: 'insertadas' | 'actualizadas'): number {
  let total = 0;
  for (const valor of contadores.values()) total += valor[campo];
  return total;
}

/** Cobertura del grupo: lo que la web LEE, sin recalcular nada al pintar. */
async function recalculaCobertura(
  cliente: ClienteCanonico,
  datos: {
    phaseGroupId: number;
    edicionId: number;
    jornadasEsperadas: number | null;
    jornadas: Array<{ numero: number; fecha: string | null }>;
    partidos: FilaPartido[];
    resumen: { actas_enlazadas: number; actas_disponibles: number; actas_parseadas: number; actas_correctas: number; actas_a_revisar: number };
  },
): Promise<Cobertura> {
  const hoy = Date.now();
  const jornadasCerradas = datos.jornadas.filter((j) => j.fecha !== null && new Date(`${j.fecha}T23:59:59`).getTime() < hoy).length;
  const conResultado = datos.partidos.filter((p) => p.goles_local !== null && p.goles_visitante !== null);
  const numeros = [...new Set(datos.partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  const esperadas = datos.jornadasEsperadas ?? (numeros.length > 0 ? Math.max(...numeros) : null);

  /*
   * ── «COMPLETA HASTA LA JORNADA N» TIENE QUE SIGNIFICAR QUE 1..N ESTÁN TODAS ──────────────────────────
   *
   * Antes este bucle recorría sólo las jornadas PRESENTES, así que un grupo con la jornada 30 y nada más
   * —8 partidos de 240— salía «completa hasta la jornada 30» y `visibility_state = 'completa'`. Medido el
   * 25/09/2026 en los grupos catalanes reparados desde sus actas: la cobertura es la tabla que LEE la web
   * (`ops.coverage_checkpoint`), y ahí una consulta no tenía forma de saber que el grupo estaba a trozos:
   * la ausencia se leía como «no hay más partidos».
   *
   * Ahora la cadena empieza en la jornada 1 y se rompe en la primera que falte, en la que no tenga todos
   * sus partidos o en la que tenga alguno sin resultado. Los partidos esperados de una jornada salen del
   * propio grupo —los equipos que cita su calendario, la mitad por jornada— porque un grupo al que sólo le
   * han llegado 1 de sus 8 partidos de la jornada 1 tampoco puede decir que la jornada 1 está verificada.
   */
  const equiposDelCalendario = new Set<string>();
  for (const partido of datos.partidos) {
    if (partido.local) equiposDelCalendario.add(partido.local.trim());
    if (partido.visitante) equiposDelCalendario.add(partido.visitante.trim());
  }
  const partidosPorJornada = Math.max(1, Math.floor(equiposDelCalendario.size / 2));
  let completaHasta: number | null = null;
  for (let numero = 1; numero <= (esperadas ?? 0); numero += 1) {
    const deLaJornada = datos.partidos.filter((p) => p.jornada === numero);
    if (deLaJornada.length < partidosPorJornada) break;
    const todosConResultado = deLaJornada.every((p) => p.goles_local !== null && p.goles_visitante !== null);
    if (!todosConResultado) break;
    completaHasta = numero;
  }
  const partidosEsperados = esperadas === null ? null : partidosPorJornada * esperadas;
  /*
   * Un calendario real no siempre reparte el mismo número de partidos por jornada: con 16 equipos y
   * 30 jornadas puede haber jornadas de 7 y de 9 porque la fuente desplaza un partido de fecha. Antes
   * se exigía `partidosPorJornada` en TODAS y esos grupos quedaban `parcial_privada` para siempre
   * aunque tuvieran los 240 resultados y las 237 actas (medido 06/11/2026: grupo 3789 de 2013-14).
   * Si están todas las jornadas 1..N, todos los partidos tienen resultado y el total no baja del
   * esperado, la cobertura es completa aunque el reparto por jornada no sea uniforme.
   */
  const todasLasJornadas = esperadas !== null && esperadas > 0
    && numeros.length === esperadas
    && numeros.every((numero, i) => numero === i + 1);
  const totaleCuadra = partidosEsperados !== null && datos.partidos.length >= partidosEsperados;
  const completaPorTotal = todasLasJornadas && totaleCuadra
    && conResultado.length === datos.partidos.length;
  const completa = completaPorTotal || (esperadas !== null && completaHasta !== null && completaHasta >= esperadas
    && conResultado.length === datos.partidos.length);
  const visibility = completa && datos.resumen.actas_parseadas >= datos.resumen.actas_disponibles
    ? 'completa'
    : completaHasta !== null && completaHasta > 0 ? 'verificada_hasta_jornada'
      : datos.partidos.length > 0 ? 'parcial_privada' : 'oculta';
  const completeThrough = completaPorTotal && completa ? esperadas : completaHasta;

  const cobertura: Cobertura = {
    jornadas_esperadas: esperadas,
    jornadas_descubiertas: datos.jornadas.length,
    jornadas_cerradas: jornadasCerradas,
    partidos_conocidos: datos.partidos.length,
    partidos_con_resultado: conResultado.length,
    ...datos.resumen,
    complete_through_matchday: completeThrough,
    visibility_state: visibility,
  };
  await cliente.query(
    `insert into ops.coverage_checkpoint (phase_group_id, jornadas_esperadas, jornadas_descubiertas, jornadas_cerradas,
        partidos_esperados, partidos_conocidos, partidos_con_resultado, actas_enlazadas, actas_disponibles, actas_parseadas,
        actas_correctas, actas_a_revisar, complete_through_matchday, completitud_historica, visibility_state, calculado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
     on conflict (phase_group_id) do update set
       jornadas_esperadas = excluded.jornadas_esperadas, jornadas_descubiertas = excluded.jornadas_descubiertas,
       jornadas_cerradas = excluded.jornadas_cerradas, partidos_esperados = excluded.partidos_esperados,
       partidos_conocidos = excluded.partidos_conocidos,
       partidos_con_resultado = excluded.partidos_con_resultado, actas_enlazadas = excluded.actas_enlazadas,
       actas_disponibles = excluded.actas_disponibles, actas_parseadas = excluded.actas_parseadas,
       actas_correctas = excluded.actas_correctas, actas_a_revisar = excluded.actas_a_revisar,
       complete_through_matchday = excluded.complete_through_matchday,
       /*
        * La columna de completitud histórica FALTABA aquí, y es la que dice si el grupo se conoce entero. Al
        * reimportar un grupo que había dejado de estar completo, la fila se quedaba con el true de la primera
        * vez mientras la visibilidad pasaba a «parcial»: medido el 25/09/2026 en el grupo catalán 55764830.
        * Un dato obsoleto que afirma completitud es peor que no tenerlo.
        */
       completitud_historica = excluded.completitud_historica,
       visibility_state = excluded.visibility_state, calculado_en = now()`,
    [datos.phaseGroupId, cobertura.jornadas_esperadas, cobertura.jornadas_descubiertas, cobertura.jornadas_cerradas,
      partidosEsperados, cobertura.partidos_conocidos, cobertura.partidos_con_resultado, cobertura.actas_enlazadas,
      cobertura.actas_disponibles, cobertura.actas_parseadas, cobertura.actas_correctas, cobertura.actas_a_revisar,
      cobertura.complete_through_matchday, cobertura.visibility_state === 'completa', cobertura.visibility_state],
  );
  await cliente.query(
    `update core.competition_edition set visibility_state = $2, data_version = data_version + 1 where id = $1`,
    [datos.edicionId, cobertura.visibility_state === 'oculta' ? 'oculta' : cobertura.visibility_state],
  );
  return cobertura;
}

/** Comparación de recuentos origen/destino del grupo importado. */
async function validaLote(
  cliente: ClienteCanonico,
  cola: ColaOrigen,
  ambito: AmbitoGrupo,
  contexto: { matchIdPorClave: Map<string, number>; phaseGroupId: number; actasApartadas?: Set<string> },
): Promise<ResultadoValidacion> {
  const origen = cola.recuentos(ambito, contexto.actasApartadas);
  const uno = async (sql: string, parametros: unknown[]): Promise<number> => {
    const { rows } = await cliente.query<{ n: string }>(sql, parametros);
    return Number(rows[0]?.n ?? 0);
  };
  const partidosDestino = await uno('select count(*) n from core.match where phase_group_id = $1', [contexto.phaseGroupId]);
  const jornadasDestino = await uno('select count(*) n from core.matchday where phase_group_id = $1', [contexto.phaseGroupId]);
  const conResultadoDestino = await uno(
    'select count(*) n from core.match where phase_group_id = $1 and goles_local is not null and goles_visitante is not null',
    [contexto.phaseGroupId],
  );
  /*
   * ── LAS ACTAS SE CUENTAN POR CÓDIGO, NO POR INFORME (medido el 24/09/2026) ────────────────────────────
   *
   * El origen cuenta **códigos de acta distintos** (`codigosDeActasEnlazadas` es un `Set`), pero aquí se
   * contaban filas de `core.match_report`. Cuando una misma acta queda citada por dos filas del calendario
   * —pasa de verdad: el grupo 23123012 de Aragón tiene 56 filas de calendario y **52 códigos distintos**—, el
   * destino daba 56 contra 52 del origen y el lote se caía con «actas analizadas 52≠56», con el grupo entero
   * detrás. Contando códigos distintos, los dos lados hablan de lo mismo.
   */
  const informesDestino = await uno(
    `select count(distinct s.codigo_acta) n
       from core.match_report r
       join core.match m on m.id = r.match_id
       left join core.match_source s on s.match_id = m.id
      where m.phase_group_id = $1 and s.codigo_acta is not null`,
    [contexto.phaseGroupId],
  );
  const aparicionesDestino = await uno(
    `select count(*) n from core.appearance a join core.match m on m.id = a.match_id where m.phase_group_id = $1`,
    [contexto.phaseGroupId],
  );
  const eventosDestino = await uno(
    `select count(*) n from core.match_event e join core.match m on m.id = e.match_id where m.phase_group_id = $1`,
    [contexto.phaseGroupId],
  );
  // Técnicos y árbitros también se cuentan: sin esto, una reimportación podía dejar fichas de cuerpo
  // técnico duplicadas y la validación decía «cuadran» tan tranquila.
  const tecnicosDestino = await uno(
    `select count(*) n from core.match_staff s join core.match m on m.id = s.match_id where m.phase_group_id = $1`,
    [contexto.phaseGroupId],
  );
  const arbitrosDestino = await uno(
    `select count(*) n from core.match_official o join core.match m on m.id = o.match_id where m.phase_group_id = $1`,
    [contexto.phaseGroupId],
  );
  const diferencias: Array<{ entidad: string; origen: number; destino: number }> = [];
  const compara = (entidad: string, origenN: number, destinoN: number) => {
    if (origenN !== destinoN) diferencias.push({ entidad, origen: origenN, destino: destinoN });
  };
  /*
   * ── SE COMPARA LO QUE SE VA A ESCRIBIR, NO TODO LO QUE HAY (medido el 21/09/2026) ──────────────────────
   *
   * El destino sólo puede recibir las actas que algún partido del grupo cita: un informe de partido sin partido
   * no existe. Cuando la cola tiene más actas que partidos —27 frente a 18 en el grupo 22841470 de Navarra—,
   * comparar el destino contra el TOTAL hacía fallar el lote entero y la carga masiva se quedaba a cero.
   *
   * Ahora se compara contra las **enlazadas** (las que se escriben) y la diferencia no se pierde: queda contada
   * como incidencia unas líneas más abajo. Es la misma regla de siempre —lo que no se entiende se registra, no
   * se convierte en cero— aplicada a un caso que estaba bloqueando todo.
   */
  compara('jornadas', origen.jornadas, jornadasDestino);
  compara('partidos', origen.partidos, partidosDestino);
  compara('partidos con resultado', origen.partidosConResultado, conResultadoDestino);
  compara('actas analizadas', origen.actasEnlazadas, informesDestino);
  compara('participaciones', origen.participacionesEnlazadas, aparicionesDestino);
  compara('eventos', origen.eventosEnlazados, eventosDestino);
  compara('técnicos', origen.tecnicosEnlazados, tecnicosDestino);
  compara('árbitros designados', origen.partidosConArbitro, arbitrosDestino);
  const actasSinPartido = Math.max(0, origen.actasHechas - origen.actasEnlazadas);

  // Marcador contra eventos: coinciden o la diferencia queda como incidencia estructurada.
  const discrepancias = await uno(
    `select count(*) n from (
       select m.id,
         coalesce(m.goles_local, 0) + coalesce(m.goles_visitante, 0) as desde_marcador,
         (select count(*) from core.match_event e where e.match_id = m.id and e.event_type = 'gol') as desde_eventos
       from core.match m where m.phase_group_id = $1 and m.goles_local is not null
     ) t where desde_marcador <> desde_eventos`,
    [contexto.phaseGroupId],
  );
  return {
    ok: diferencias.length === 0,
    diferencias,
    comprobaciones: [
      { nombre: 'recuentos origen/destino', ok: diferencias.length === 0, detalle: diferencias.length === 0 ? 'cuadran' : `${diferencias.length} diferencias` },
      {
        nombre: 'actas sin partido en el grupo',
        ok: true,
        detalle: actasSinPartido
          ? `${actasSinPartido} acta(s) de la cola no las cita ningún partido del grupo: no se importan y quedan contadas aquí`
          : 'ninguna',
      },
      { nombre: 'marcador contra eventos', ok: true, detalle: `${discrepancias} partido(s) con diferencia (quedan como incidencia, no se silencian)` },
    ],
  };
}
