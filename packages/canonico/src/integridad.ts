/**
 * Cuadre del calendario: ¿cierra el grupo como una liga regular?
 *
 * De dónde sale esto. Al comparar la clasificación reconstruida con la oficial, en el grupo de Tercera
 * Federación de Castilla y León 2024-25 salían **7 equipos con puntos distintos**. Investigado: no era
 * un error de la reconstrucción ni una sanción. Con 19 equipos cada uno debe jugar 18 rivales dos
 * veces = **36 partidos**, y la tabla oficial da 36 a los diecinueve; el calendario archivado da 35 a
 * cinco equipos y 37 a otros cinco. Es decir: **cinco partidos del calendario tienen mal asignado uno
 * de los dos equipos** (uno juega un partido de más y otro uno de menos). Ni un solo equipo aparece dos
 * veces en la misma jornada: el fallo está en el emparejamiento, no en el reparto de jornadas.
 *
 * Regla que se comprueba aquí, sin depender del formato de la competición: en una liga regular **todos
 * los equipos juegan el mismo número de partidos**. El número habitual (la moda) es el esperado y
 * cualquier equipo que se aparte de él es una anomalía que hay que mirar. No se corrige nada solo: se
 * registra en `ops.normalizacion_error` con `codigo = 'calendario_no_cuadra'` para que se vea.
 */
import type { ClienteCanonico } from './destino/pool.js';

export type DesviacionCalendario = { equipo: string; partidos: number; descansos: number };

/**
 * Anomalía de emparejamiento: una pareja de equipos que no puede ser un calendario real.
 *
 * Se comprueba sin saber el formato de la competición, porque las dos cosas que detecta son
 * imposibles en cualquier liga o eliminatoria a doble partido:
 *
 * - **más de dos enfrentamientos** entre los mismos dos equipos;
 * - **dos enfrentamientos en el mismo campo**, cuando lo que corresponde es uno en cada uno.
 *
 * Es la comprobación que destapa un partido con un equipo mal asignado incluso cuando los recuentos
 * por equipo cuadran: si a un equipo le roban el rival de una jornada y le dan el de otra, sigue
 * jugando el mismo número de partidos, pero una pareja acaba con tres enfrentamientos.
 */
export type AnomaliaEmparejamiento = {
  local: string;
  visitante: string;
  enfrentamientos: number;
  enElMismoCampo: boolean;
};

export type ResumenEmparejamiento = {
  parejas: number;
  anomalias: AnomaliaEmparejamiento[];
};

export type ResumenCalendario = {
  equipos: number;
  jornadas: number;
  /** Partidos que juega la mayoría de los equipos: lo que se espera de una liga regular. */
  partidosHabitual: number;
  equiposHabitual: number;
  desviados: DesviacionCalendario[];
  /** Parejas de equipos cuyo emparejamiento no puede ser el de un calendario real. */
  emparejamiento: ResumenEmparejamiento;
};

export async function revisaCuadreDelCalendario(
  cliente: ClienteCanonico,
  datos: { phaseGroupId: number; batchId: number; federacion: string; grupo: string },
): Promise<ResumenCalendario | null> {
  const emparejamiento = await revisaEmparejamiento(cliente, datos);

  const { rows } = await cliente.query<{ equipo: string; partidos: string }>(
    `select te.nombre_en_fuente as equipo, count(m.id)::int as partidos
       from core.team_entry te
       left join core.match m on m.home_team_entry_id = te.id or m.away_team_entry_id = te.id
      where te.phase_group_id = $1
      group by te.nombre_en_fuente
      order by 2 desc, 1`,
    [datos.phaseGroupId],
  );
  // Con un solo equipo no hay nada que cuadrar. Con dos ya se ve si uno juega más que el otro.
  if (rows.length < 2) return null;

  const { rows: jornadas } = await cliente.query<{ n: string }>(
    `select count(distinct matchday_id)::int n from core.match where phase_group_id = $1`,
    [datos.phaseGroupId],
  );
  const totalJornadas = Number(jornadas[0]?.n ?? 0);

  const cuenta = new Map<number, number>();
  for (const fila of rows) cuenta.set(Number(fila.partidos), (cuenta.get(Number(fila.partidos)) ?? 0) + 1);
  // La moda: lo que juega la mayoría. Con empate, gana el número mayor (la liga manda).
  let partidosHabitual = 0;
  let equiposHabitual = -1;
  for (const [partidos, equipos] of [...cuenta.entries()].sort((a, b) => b[0] - a[0])) {
    if (equipos > equiposHabitual) { partidosHabitual = partidos; equiposHabitual = equipos; }
  }
  const desviados: DesviacionCalendario[] = rows
    .filter((fila) => Number(fila.partidos) !== partidosHabitual)
    .map((fila) => ({
      equipo: fila.equipo,
      partidos: Number(fila.partidos),
      descansos: totalJornadas - Number(fila.partidos),
    }));

  const resumen: ResumenCalendario = {
    equipos: rows.length,
    jornadas: totalJornadas,
    partidosHabitual,
    equiposHabitual: Math.max(0, equiposHabitual),
    desviados,
    emparejamiento,
  };
  if (desviados.length === 0) return resumen;

  await cliente.query(
    `insert into ops.normalizacion_error (batch_id, codigo, parametros)
     values ($1, 'calendario_no_cuadra', $2::jsonb)`,
    [datos.batchId, JSON.stringify({
      federacion: datos.federacion,
      grupo: datos.grupo,
      equipos: resumen.equipos,
      jornadas: resumen.jornadas,
      partidos_habitual: resumen.partidosHabitual,
      desviados: desviados.slice(0, 20),
    })],
  );
  return resumen;
}

/**
 * Emparejamiento del grupo: ¿hay una pareja de equipos que se haya enfrentado de una forma imposible?
 *
 * Independiente del recuento por equipo a propósito: un partido con un equipo mal asignado puede
 * dejar a todos los equipos con el mismo número de partidos y seguir siendo imposible. Medido en el
 * grupo 11379752 (Tercera Federación de Castilla y León 2024-25): el recuento por equipo delataba diez
 * equipos desviados, pero había **siete** partidos mal asignados, porque dos de ellos se compensaban
 * entre sí en el recuento. El emparejamiento los delata a los siete.
 */
async function revisaEmparejamiento(
  cliente: ClienteCanonico,
  datos: { phaseGroupId: number; batchId: number; federacion: string; grupo: string },
): Promise<ResumenEmparejamiento> {
  const { rows } = await cliente.query<{
    local: string; visitante: string; enfrentamientos: string; campos: string;
  }>(
    // `least`/`greatest` dan la pareja sin importar el orden; `count(distinct home_team_entry_id)` dice
    // si los dos enfrentamientos se jugaron en el mismo campo.
    `select tl.nombre_en_fuente as local, tv.nombre_en_fuente as visitante,
            count(*)::int as enfrentamientos,
            count(distinct m.home_team_entry_id)::int as campos
       from core.match m
       join core.team_entry tl on tl.id = least(m.home_team_entry_id, m.away_team_entry_id)
       join core.team_entry tv on tv.id = greatest(m.home_team_entry_id, m.away_team_entry_id)
      where m.phase_group_id = $1
        and m.home_team_entry_id is not null and m.away_team_entry_id is not null
      group by 1, 2
     having count(*) > 2 or (count(*) = 2 and count(distinct m.home_team_entry_id) = 1)
      order by 3 desc, 1`,
    [datos.phaseGroupId],
  );
  const { rows: total } = await cliente.query<{ n: string }>(
    `select count(*)::int n from (
       select least(home_team_entry_id, away_team_entry_id) a, greatest(home_team_entry_id, away_team_entry_id) b
         from core.match where phase_group_id = $1
          and home_team_entry_id is not null and away_team_entry_id is not null
        group by 1, 2) t`,
    [datos.phaseGroupId],
  );
  const anomalias: AnomaliaEmparejamiento[] = rows.map((fila) => ({
    local: fila.local,
    visitante: fila.visitante,
    enfrentamientos: Number(fila.enfrentamientos),
    enElMismoCampo: Number(fila.campos) === 1,
  }));
  if (anomalias.length > 0) {
    await cliente.query(
      `insert into ops.normalizacion_error (batch_id, codigo, parametros)
       values ($1, 'calendario_emparejamiento_no_cuadra', $2::jsonb)`,
      [datos.batchId, JSON.stringify({
        federacion: datos.federacion,
        grupo: datos.grupo,
        anomalias: anomalias.slice(0, 20),
      })],
    );
  }
  return { parejas: Number(total[0]?.n ?? 0), anomalias };
}
