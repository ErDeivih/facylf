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
import { separaNombreYEstado } from '@facylf/ingesta';
import type { ClienteCanonico, PoolCanonico } from './destino/pool.js';
import { Repositorio, enTransaccion, type Contadores } from './destino/repositorio.js';
import { ColaOrigen, type AmbitoGrupo, type FilaActa, type FilaEquipo, type FilaGrupo, type FilaPartido } from './origen/cola.js';
import {
  calidadInforme, categoriaDesdeNombre, condicionParticipacion, estadoPartido, fechaIso, generoDesdeNombre,
  horaIso, incidencias, lado, ladoOpcional, sujetoTipo, tipoEvento, ValorDesconocido,
} from './origen/vocabularios.js';
import { Normalizador, contextoDe, fuenteDeFederacion, resuelveFederacion, resuelveTemporada } from './resolucion/contexto.js';
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
import { importaClasificacionOficial, type CatalogoEquipos, type ResumenOficial } from './clasificacion-oficial.js';
import { nombreDeClub } from './clasificacion-oficial-json.js';
import { revisaCuadreDelCalendario, type ResumenCalendario } from './integridad.js';
import { PersonasEnLote } from './resolucion/personas-lote.js';
import { resuelveCampo } from './resolucion/campo.js';

export const VERSION_PARSER = 19;
export const VERSION_NORMALIZADOR = 1;

export type OpcionesLote = {
  raiz: string;
  federacion: string;
  temporada?: string;
  grupo?: string;
  seco?: boolean;
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
  const cola = new ColaOrigen(ColaOrigen.rutaDeFederacion(opciones.raiz, opciones.federacion));
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
    const { rows: federacionRows } = await cliente.query<{ id: string }>(
      `insert into core.federation (codigo, nombre, adaptador, portal_url)
       values ($1, $2, $3, $4)
       on conflict (codigo) do update set nombre = excluded.nombre, adaptador = excluded.adaptador,
         portal_url = excluded.portal_url
       returning id`,
      [fuente.codigo, fuente.nombre, adaptador, fuente.portal ?? null],
    );
    const federacionId = Number(federacionRows[0]?.id);
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

    const repo = new Repositorio(cliente, batchId, contadores);
    const normalizador = new Normalizador(cliente);
    // Las personas se resuelven una vez por lote y sus columnas de seguimiento se aplican al final:
    // antes se hacían dos o tres consultas POR APARICIÓN (decenas de miles por grupo).
    const personas = new PersonasEnLote(cliente, repo, normalizador, federacionId);
    const seasonId = await resuelveTemporada(cliente, repo, { codigo: temporada.codigo, etiqueta: etiquetaTemporada, origen: 'web', comprobada_en: null });

    const jornadas = cola.jornadas(ambito);
    const partidos = cola.partidos(ambito);

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
    const { candidatos, ambiguos } = construyeCandidatos(citas);
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

      // Los dos lados, resueltos contra el catálogo de ESTE grupo. Un partido nunca cruza dos grupos.
      const lado = (literal: string, codigoExplicito: string | null) => resuelveInscripcion({
        literal, codigoExplicito, catalogo: catalogoInscripciones,
        referenciasExistentes: new Map([...vinculaciones].map(([norm, v]) => [norm, `contexto:${norm}`])),
      });
      const resolucionLocal = lado(partido.local, partido.equipo_local_codigo);
      const resolucionVisitante = lado(partido.visitante, partido.equipo_visitante_codigo);
      const entradaDe = (r: typeof resolucionLocal): number | null => {
        if (r.clave === null) return null;
        const entrada = entradaPorClave.get(r.clave);
        if (entrada === undefined) {
          throw new Error(`La inscripción «${r.limpio}» del partido J${partido.jornada} orden ${partido.orden} `
            + `no se ha podido persistir en el grupo ${grupo.codigo}`);
        }
        return entrada;
      };
      const entradaLocal = entradaDe(resolucionLocal);
      const entradaVisitante = entradaDe(resolucionVisitante);

      // Un partido NO se importa con un equipo sin resolver: elegir mal contamina dos plantillas a la vez
      // y no se nota. Se detiene el lote con la evidencia de por qué no se pudo resolver.
      if (entradaLocal === null || entradaVisitante === null) {
        const sinResolver = [
          resolucionLocal.clave === null ? `${partido.local} (${resolucionLocal.evidencia})` : null,
          resolucionVisitante.clave === null ? `${partido.visitante} (${resolucionVisitante.evidencia})` : null,
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
    const aparicionesConfirmadas: Array<{ match_id: number; team_entry_id: number; person_id: number; orden: number }> = [];
    /** Pareja efectiva de los partidos reparados, por `jornada|orden`, para la clasificación. */
    const correccionesDelCalendario = new Map<string, { local: string; visitante: string }>();
    const resumen = {
      actas_enlazadas: partidos.filter((p) => p.codigo_acta !== null).length,
      actas_disponibles: 0, actas_parseadas: 0, actas_correctas: 0, actas_a_revisar: 0,
    };
    for (const acta of actas) {
      const clave = `${acta.jornada}|${partidos.find((p) => p.codigo_acta === acta.codigo)?.orden ?? 0}`;
      const matchId = matchIdPorClave.get(clave);
      const partido = partidos.find((p) => p.codigo_acta === acta.codigo);
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
          conflicto: ['match_id', 'team_entry_id', 'person_id', 'orden'],
        });
      }
      await repo.upsertMasivo('core.appearance', apariciones);
      // Si el lote ha tenido que reasignar los equipos de este partido, las apariciones que escribió la
      // versión anterior siguen ahí: `core.appearance` se indexa por (match_id, team_entry_id, person_id,
      // orden), así que cambiar el equipo NO pisa la fila vieja, la duplica. Se anota lo que este lote
      // confirma para retirar lo demás al cerrar (igual que la ficha de cuerpo técnico).
      if (equipos.decision.reparado) {
        partidosReparados.push(matchId);
        for (const aparicion of apariciones) {
          aparicionesConfirmadas.push({
            match_id: Number(aparicion.valores.match_id),
            team_entry_id: Number(aparicion.valores.team_entry_id),
            person_id: Number(aparicion.valores.person_id),
            orden: Number(aparicion.valores.orden),
          });
        }
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
        const persona = await personas.nominal({
          federacionId, etiquetaTemporada, nombre, rol,
          ambito: 'equipo', ambitoId: entradaDeLado(ladoTecnico) ?? edicionId, esMenor: false,
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
    if (partidosReparados.length > 0) {
      const { rowCount } = await cliente.query(
        `delete from core.appearance a
          where a.match_id = any($1::bigint[])
            and not exists (
              select 1 from unnest($2::bigint[], $3::bigint[], $4::bigint[], $5::smallint[])
                as v(match_id, team_entry_id, person_id, orden)
               where v.match_id = a.match_id and v.team_entry_id = a.team_entry_id
                 and v.person_id = a.person_id and v.orden = a.orden)`,
        [
          partidosReparados,
          aparicionesConfirmadas.map((f) => f.match_id),
          aparicionesConfirmadas.map((f) => f.team_entry_id),
          aparicionesConfirmadas.map((f) => f.person_id),
          aparicionesConfirmadas.map((f) => f.orden),
        ],
      );
      aparicionesRetiradas = rowCount ?? 0;
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
    const clasificacionOficial = await importaClasificacionOficial(cliente, repo, {
      raizCola: dirname(cola.ruta),
      temporada,
      competicion: grupo.competicion,
      grupo: grupo.codigo,
      batchId,
      federacion,
      phaseGroupId,
      matchdayId: clasificacion?.matchdayId ?? null,
      catalogo,
      normalizaVarios: (textos: string[]) => normalizador.normalizaVarios(textos),
      reconstruida: clasificacion?.puntosPorEquipo ?? new Map(),
      // Sólo se contrasta con la temporada terminada: a mitad de temporada la tabla oficial es de otra
      // fecha y las diferencias serían ruido, no un hallazgo.
      comparar: clasificacion !== null && (grupo.jornadas ?? 0) > 0 && clasificacion.jornada >= (grupo.jornadas ?? 0),
    });

    // Cuadre del calendario: si los equipos no juegan todos los mismos partidos, el emparejamiento de
    // la fuente tiene algún partido mal asignado. Se registra (no se corrige solo).
    const calendario = await revisaCuadreDelCalendario(cliente, {
      phaseGroupId, batchId, federacion, grupo: grupo.codigo,
    });

    const cobertura = await recalculaCobertura(cliente, {
      phaseGroupId, edicionId, jornadasEsperadas: grupo.jornadas, jornadas, partidos, resumen,
    });
    const validacion = await validaLote(cliente, cola, ambito, { matchIdPorClave, phaseGroupId });
    const cambios = await repo.persisteDiario();
    await cliente.query(
      `update ops.batch set estado = $2, terminado_en = now(), filas_insertadas = $3, filas_actualizadas = $4,
         filas_rechazadas = $5, validacion = $6::jsonb where id = $1`,
      [batchId, validacion.ok ? 'validado' : 'fallido', suma(contadores, 'insertadas'), suma(contadores, 'actualizadas'),
        rechazadas.length, JSON.stringify({ ...validacion, cambios, cobertura, staff_obsoleto_retirado: staffRetirado ?? 0, apariciones_obsoletas_retiradas: aparicionesRetiradas, partidos_con_equipos_rea_signados: partidosReparados.length, clasificacion, clasificacion_oficial: clasificacionOficial, calendario })],
    );
    if (!validacion.ok) {
      // Un lote que no cuadra no se publica ni se deja a medias: se revierte entero.
      throw new Error(`La validación del lote ${batchId} ha fallado: ${validacion.diferencias.map((d) => `${d.entidad} ${d.origen}≠${d.destino}`).join(', ')}`);
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
  // Jornada completa: todas sus fechas pasadas y todos sus partidos con resultado.
  const numeros = [...new Set(datos.partidos.map((p) => p.jornada))].sort((a, b) => a - b);
  let completaHasta: number | null = null;
  for (const numero of numeros) {
    const deLaJornada = datos.partidos.filter((p) => p.jornada === numero);
    const todosConResultado = deLaJornada.every((p) => p.goles_local !== null && p.goles_visitante !== null);
    if (!todosConResultado) break;
    completaHasta = numero;
  }
  const esperadas = datos.jornadasEsperadas ?? (numeros.length > 0 ? Math.max(...numeros) : null);
  const completa = esperadas !== null && completaHasta !== null && completaHasta >= esperadas
    && conResultado.length === datos.partidos.length;
  const visibility = completa && datos.resumen.actas_parseadas >= datos.resumen.actas_disponibles
    ? 'completa'
    : completaHasta !== null && completaHasta > 0 ? 'verificada_hasta_jornada'
      : datos.partidos.length > 0 ? 'parcial_privada' : 'oculta';

  const cobertura: Cobertura = {
    jornadas_esperadas: esperadas,
    jornadas_descubiertas: datos.jornadas.length,
    jornadas_cerradas: jornadasCerradas,
    partidos_conocidos: datos.partidos.length,
    partidos_con_resultado: conResultado.length,
    ...datos.resumen,
    complete_through_matchday: completaHasta,
    visibility_state: visibility,
  };
  await cliente.query(
    `insert into ops.coverage_checkpoint (phase_group_id, jornadas_esperadas, jornadas_descubiertas, jornadas_cerradas,
        partidos_conocidos, partidos_con_resultado, actas_enlazadas, actas_disponibles, actas_parseadas,
        actas_correctas, actas_a_revisar, complete_through_matchday, completitud_historica, visibility_state, calculado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (phase_group_id) do update set
       jornadas_esperadas = excluded.jornadas_esperadas, jornadas_descubiertas = excluded.jornadas_descubiertas,
       jornadas_cerradas = excluded.jornadas_cerradas, partidos_conocidos = excluded.partidos_conocidos,
       partidos_con_resultado = excluded.partidos_con_resultado, actas_enlazadas = excluded.actas_enlazadas,
       actas_disponibles = excluded.actas_disponibles, actas_parseadas = excluded.actas_parseadas,
       actas_correctas = excluded.actas_correctas, actas_a_revisar = excluded.actas_a_revisar,
       complete_through_matchday = excluded.complete_through_matchday,
       visibility_state = excluded.visibility_state, calculado_en = now()`,
    [datos.phaseGroupId, cobertura.jornadas_esperadas, cobertura.jornadas_descubiertas, cobertura.jornadas_cerradas,
      cobertura.partidos_conocidos, cobertura.partidos_con_resultado, cobertura.actas_enlazadas,
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
  contexto: { matchIdPorClave: Map<string, number>; phaseGroupId: number },
): Promise<ResultadoValidacion> {
  const origen = cola.recuentos(ambito);
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
  const informesDestino = await uno(
    `select count(*) n from core.match_report r join core.match m on m.id = r.match_id where m.phase_group_id = $1`,
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
