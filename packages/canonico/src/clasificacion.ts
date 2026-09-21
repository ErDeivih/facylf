/**
 * Clasificación RECONSTRUIDA desde los partidos del grupo.
 *
 * No es la clasificación oficial y no se presenta como tal: se guarda en
 * `core.standing_snapshot` con `origen = 'reconstruida'`, que es justo para lo que el esquema tiene
 * ese valor. La oficial (`origen = 'oficial'`) es lo que publica la federación, con sus sanciones y
 * sus ajustes, y sólo se escribirá cuando se importe.
 *
 * Las reglas de puntos y desempate NO se reinventan aquí: viven en `packages/dominio`
 * (`calculaClasificacion`), que es donde están probadas —victoria 3, empate 1, derrota 0, y desempate
 * por enfrentamiento directo cuando los empatados ya se han enfrentado todos entre sí, después
 * diferencia de goles, después goles a favor, y **sorteo pendiente** si sigue el empate, que se marca
 * en vez de inventar un orden—.
 *
 * La tabla se calcula hasta la última jornada COMPLETA. Una tabla a mitad de jornada no es la tabla
 * de ninguna jornada, y publicarla como si lo fuera es exactamente el tipo de dato falso que este
 * proyecto evita.
 */
import { calculaClasificacion, type Partido as PartidoDominio } from '@facylf/dominio';
import type { ClienteCanonico } from './destino/pool.js';
import type { Repositorio } from './destino/repositorio.js';
import type { FilaPartido } from './origen/cola.js';

export type ResumenClasificacion = {
  jornada: number;
  /** Jornada del canónico en la que se guarda la tabla: la última completa. */
  matchdayId: number;
  filas: number;
  /** Equipos empatados que el reglamento manda resolver por sorteo: se marca, no se ordena a dedo. */
  sorteoPendiente: boolean;
  retiradas: number;
  /** Puntos por inscripción, para contrastar con la tabla oficial. */
  puntosPorEquipo: Map<number, number>;
  /** Nombre en la fuente de cada inscripción, para casar con la tabla oficial cuando no trae código. */
  entradaPorNombre: Map<string, number>;
};

/** Última jornada con TODOS sus partidos resueltos, contando desde la primera. */
export function ultimaJornadaCompleta(partidos: FilaPartido[]): number | null {
  const porJornada = new Map<number, FilaPartido[]>();
  for (const p of partidos) {
    const lista = porJornada.get(p.jornada) ?? [];
    lista.push(p);
    porJornada.set(p.jornada, lista);
  }
  const numeros = [...porJornada.keys()].sort((a, b) => a - b);
  let completa: number | null = null;
  for (const numero of numeros) {
    const suyos = porJornada.get(numero)!;
    if (!suyos.every((p) => p.goles_local !== null && p.goles_visitante !== null)) break;
    completa = numero;
  }
  return completa;
}

export async function reconstruyeClasificacion(
  cliente: ClienteCanonico,
  repo: Repositorio,
  datos: {
    phaseGroupId: number;
    partidos: FilaPartido[];
    /**
     * La inscripción efectiva de cada lado del partido, por `jornada|orden`.
     *
     * Antes esto se resolvía buscando por `partidos.equipo_local_codigo`, y un equipo sin código
     * federativo no se encontraba: la tabla quedaba sin resolver y no se publicaba. Ahora el lote ya ha
     * resuelto los dos lados —con código o por referencia contextual— y aquí sólo se leen.
     */
    entradaPorPartido: Map<string, { local: number | null; visitante: number | null }>;
    /** Inscripción → nombre en la fuente, de TODOS los equipos del grupo (no sólo de los que jugaron). */
    nombrePorEntrada: Map<number, string>;
    /**
     * Pareja efectiva de los partidos cuyos equipos el lote ha tenido que reasignar, por `jornada|orden`.
     *
     * Sin esto la tabla se calcularía con los equipos que decía el calendario de la cola y contradiría
     * al `core.match` que el propio lote acaba de escribir: la fila del partido diría «Burgos Promesas
     * vs Villaralbo» y la clasificación seguiría dándole los puntos a Almazán.
     */
    correcciones: Map<string, { local: string; visitante: string }>;
  },
): Promise<ResumenClasificacion | null> {
  const hasta = ultimaJornadaCompleta(datos.partidos);
  if (hasta === null) return null;

  const jugados = datos.partidos.filter((p) => p.jornada <= hasta);
  /**
   * El nombre con el que se AGRUPA un equipo es el de su INSCRIPCIÓN, nunca el literal de la cola.
   *
   * Es la corrección de un defecto real: en Euskadi el mismo equipo aparece con el marcador de estado
   * pegado en unas jornadas (`(Sailkatua) ALAVES "B"`) y sin él en otras (`ALAVES "B"`), y agrupar por el
   * literal lo parte en DOS filas de la tabla que apuntan a la MISMA inscripción. Eso revienta al
   * escribir `standing_snapshot`:
   *
   *     ON CONFLICT DO UPDATE command cannot affect row a second time
   *
   * Medido importando el grupo 24038325 de Euskadi sin reconstruir la cola. La reconstrucción de la cola
   * lo tapaba —deja los nombres limpios— pero el importador no puede depender de que la cola esté limpia:
   * la reconstrucción es una operación aparte, con su manifiesto y su ventana, y el importador tiene que
   * ser correcto con los datos que haya.
   */
  const nombreDeInscripcion = (entradaId: number | null | undefined, literal: string): string =>
    entradaId === null || entradaId === undefined
      ? literal
      : (datos.nombrePorEntrada.get(entradaId) ?? literal);

  const dominio: PartidoDominio[] = jugados.map((p) => {
    // El nombre que manda es el de la inscripción efectiva; para un partido sin reparación es el mismo
    // literal que trae el calendario.
    const correccion = datos.correcciones.get(`${p.jornada}|${p.orden}`);
    const efectiva = datos.entradaPorPartido.get(`${p.jornada}|${p.orden}`);
    return {
      jornada: p.jornada,
      fecha: p.fecha,
      hora: p.hora,
      campo: p.campo,
      local: correccion?.local ?? nombreDeInscripcion(efectiva?.local, p.local),
      visitante: correccion?.visitante ?? nombreDeInscripcion(efectiva?.visitante, p.visitante),
      golesLocal: p.goles_local,
      golesVisitante: p.goles_visitante,
    };
  });
  const tabla = calculaClasificacion(dominio);
  if (tabla.length < 2) return null;

  // Nombre en la fuente → inscripción del equipo. Se parte del catálogo COMPLETO del grupo (una
  // reparación puede dejar a un equipo con un nombre que sus partidos no jugados no traían) y se añade
  // lo que citan los partidos. Si algún equipo de la tabla no se puede resolver, NO se escribe media
  // tabla: una tabla a la que le falta un equipo está mal y no se publica.
  const entradaPorNombre = new Map<string, number>();
  for (const [entrada, nombre] of datos.nombrePorEntrada) entradaPorNombre.set(nombre, entrada);
  for (const p of jugados) {
    const efectiva = datos.entradaPorPartido.get(`${p.jornada}|${p.orden}`);
    // El nombre que se usa para indexar es el del literal de la fila del calendario, que es el mismo que
    // devuelve `calculaClasificacion` para esa inscripción.
    if (efectiva?.local != null) entradaPorNombre.set(p.local, efectiva.local);
    if (efectiva?.visitante != null) entradaPorNombre.set(p.visitante, efectiva.visitante);
  }
  const entradas = tabla.map((fila) => entradaPorNombre.get(fila.equipo));
  if (entradas.some((e) => e === undefined)) return null;

  const { rows } = await cliente.query<{ id: string }>(
    'select id from core.matchday where phase_group_id = $1 and numero = $2',
    [datos.phaseGroupId, hasta],
  );
  const matchdayId = Number(rows[0]?.id);
  if (!Number.isFinite(matchdayId)) return null;

  // Una corrección a la baja de los datos puede dejar una tabla de una jornada posterior que ya no
  // se sostiene: se retira.
  const { rowCount } = await cliente.query(
    `delete from core.standing_snapshot s
      using core.matchday d
      where s.phase_group_id = $1 and s.origen = 'reconstruida'
        and d.id = s.matchday_id and d.phase_group_id = $1 and d.numero > $2`,
    [datos.phaseGroupId, hasta],
  );

  await repo.upsertMasivo(
    'core.standing_snapshot',
    tabla.map((fila, i) => ({
      valores: {
        phase_group_id: datos.phaseGroupId,
        matchday_id: matchdayId,
        team_entry_id: entradas[i]!,
        posicion: fila.posicion,
        puntos: fila.puntos,
        jugados: fila.jugados,
        ganados: fila.ganados,
        empatados: fila.empatados,
        perdidos: fila.perdidos,
        goles_favor: fila.golesFavor,
        goles_contra: fila.golesContra,
        origen: 'reconstruida',
      },
      conflicto: ['phase_group_id', 'matchday_id', 'team_entry_id', 'origen'],
    })),
    // `core.standing_snapshot` no tiene columna `id`: su clave primaria es la tupla completa, y el
    // diario tiene que guardar ESA clave para poder borrar o restaurar la fila al revertir.
    { devolver: 'phase_group_id' },
  );

  return {
    jornada: hasta,
    matchdayId,
    filas: tabla.length,
    sorteoPendiente: tabla.some((f) => f.sorteoPendiente),
    retiradas: rowCount ?? 0,
    puntosPorEquipo: new Map(tabla.map((fila, i) => [entradas[i]!, fila.puntos])),
    entradaPorNombre,
  };
}
