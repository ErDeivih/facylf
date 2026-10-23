/*
 * ── ¿UNA FEDERACIÓN PARADA ES QUE NO TIENE TRABAJO, O QUE NO SE LE ENCOLÓ? ───────────────────────────────
 *
 * David desconfió con razón: en una federación con años de registros por detrás, «no hay trabajo» es
 * sospechoso. Lo normal es que SIEMPRE queden actas, clasificaciones y jornadas de temporadas anteriores.
 *
 * Esta cuenta separa las dos cosas, que es lo que ningún resumen de ritmo dice:
 *
 *   · PENDIENTE    — en `pendiente`/`bloqueado` con la fecha de intento ya vencida: hay trabajo Y se puede
 *                    hacer ahora. Si esto es 0 y la federación no pide nada, está legítimamente al día.
 *   · APLAZADO     — pendiente pero con la fecha en el futuro. Aquí está la trampa: un trabajo aplazado a
 *                    2099 o al 1 de abril cuenta como «no hay nada que hacer» y se queda ahí para siempre
 *                    si nadie lo mira.
 *   · SIN TRABAJO  — actas que están en la tabla `actas` y NO tienen ningún trabajo asociado. Eso no es «no
 *                    tener trabajo»: es trabajo que nunca llegó a encolarse, y es el agujero que ya apareció
 *                    dos veces en este proyecto (13.439 casos en el PC y 6.767 en el servidor el 01/10/2026).
 *
 * Imprime una línea JSON por federación, y una tabla al final. SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-trabajo-cola.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.log(JSON.stringify({ federacion: etiqueta ?? ruta, error: 'no encuentro la cola' }));
  process.exit(0);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const ahora = new Date().toISOString();
const uno = (sql, ...p) => Number(db.prepare(sql).get(...p)?.n ?? 0);

try {
  const temporadas = db.prepare(`
    select temporada,
      sum(case when estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?) then 1 else 0 end) pendiente,
      sum(case when estado in ('pendiente','bloqueado') and siguiente_intento > ? then 1 else 0 end) aplazado,
      sum(case when estado = 'hecho' then 1 else 0 end) hecho,
      sum(case when estado = 'cancelado' then 1 else 0 end) cancelado
    from trabajos group by temporada order by cast(temporada as integer) desc`).all(ahora, ahora)
    .map((t) => `${t.temporada}:p${Number(t.pendiente)}/a${Number(t.aplazado)}/h${Number(t.hecho)}/c${Number(t.cancelado)}`);

  console.log(JSON.stringify({
    federacion: etiqueta ?? ruta,
    pendienteAhora: uno(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?)`, ahora),
    aplazado: uno(`select count(*) n from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ?`, ahora),
    enCurso: uno(`select count(*) n from trabajos where estado='en_curso'`),
    hecho: uno(`select count(*) n from trabajos where estado='hecho'`),
    cancelado: uno(`select count(*) n from trabajos where estado='cancelado'`),
    apartado: uno(`select count(*) n from trabajos where estado='apartado'`),
    porTipoPendiente: db.prepare(`select tipo, count(*) n from trabajos where estado in ('pendiente','bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?) group by tipo order by n desc`).all(ahora)
      .map((f) => `${f.tipo}:${f.n}`).join(' ') || 'nada',
    actasEnLaTabla: uno('select count(*) n from actas'),
    actasSinTrabajo: uno(`select count(*) n from actas a where not exists (select 1 from trabajos t
      where t.tipo='acta' and t.temporada=a.temporada and t.competicion=a.competicion
        and t.grupo=a.grupo and t.acta=a.codigo)`),
    proximoAplazamiento: db.prepare(`select min(siguiente_intento) p from trabajos
      where estado in ('pendiente','bloqueado') and siguiente_intento > ?`).get(ahora)?.p ?? null,
    temporadas,
  }));
} finally {
  db.close();
}
