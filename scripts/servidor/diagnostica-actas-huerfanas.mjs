import { DatabaseSync } from 'node:sqlite';

/*
 * ¿POR QUÉ HAY ACTAS EN UN GRUPO DONDE NO ENCAJAN?
 *
 * El importador detiene el lote cuando la cola tiene más actas que partidos, y eso bloquea la carga masiva.
 * Esto mira UN caso concreto (Navarra, grupo 22841470, temporada 22) para saber de dónde salen las 9 actas
 * que no cita ningún partido: ¿son de otro grupo de la misma competición?, ¿de otro grupo de otra competición?,
 * ¿o el acta es de un partido que el calendario no tiene?
 *
 * Sólo lee. No cambia nada.
 */
const raiz = process.argv[2] ?? 'F:/EspacioCodigo/facylf';
const federacion = process.argv[3] ?? 'navarra';
const temporada = process.argv[4] ?? '22';
const grupo = process.argv[5] ?? '22841470';

const db = new DatabaseSync(`${raiz}/descargas-${federacion}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const todos = (sql, ...a) => db.prepare(sql).all(...a);
const uno = (sql, ...a) => Object.values(db.prepare(sql).get(...a) ?? {})[0] ?? null;

console.log(`=== ${federacion} · temporada ${temporada} · grupo ${grupo} ===\n`);

const citadas = todos(`select a.codigo, a.jornada, a.competicion, a.grupo,
    (select count(*) from partidos p where p.codigo_acta = a.codigo) citada
  from actas a where a.temporada = ? and a.grupo = ? and a.estado = 'hecha'
  order by a.jornada, a.codigo`, temporada, grupo);

console.log(`actas del grupo: ${citadas.length} · citadas por algún partido: ${citadas.filter((c) => c.citada > 0).length}`);
const huerfanas = citadas.filter((c) => c.citada === 0);
console.log(`sin partido que las cite: ${huerfanas.length}\n`);

for (const acta of huerfanas.slice(0, 4)) {
  console.log(`── acta ${acta.codigo} (jornada ${acta.jornada}, competicion ${acta.competicion}) ──`);

  // El contenido dice de qué partido es: equipos y, si está, la jornada y el grupo según el acta.
  const equipos = todos(`select distinct lado, nombre from participaciones
    where temporada = ? and competicion = ? and grupo = ? and acta = ? limit 4`, temporada, acta.competicion, grupo, acta.codigo);
  console.log(`  equipos en el acta: ${equipos.map((e) => `${e.lado}:${e.nombre}`).join(' | ') || '(sin participaciones)'}`);

  const nombres = [...new Set(equipos.map((e) => e.nombre))];
  if (nombres.length >= 2) {
    // ¿A qué partido de la competición corresponden esos equipos? (en cualquier grupo)
    const candidatos = todos(`select p.grupo, p.jornada, p.codigo_acta, e1.nombre local, e2.nombre visitante
      from partidos p
      join equipos e1 on e1.codigo = p.equipo_local_codigo and e1.temporada = p.temporada
      join equipos e2 on e2.codigo = p.equipo_visitante_codigo and e2.temporada = p.temporada
      where p.temporada = ? and p.competicion = ? and (e1.nombre in (${nombres.map(() => '?').join(',')})
        or e2.nombre in (${nombres.map(() => '?').join(',')}))`, temporada, acta.competicion, ...nombres);
    if (candidatos.length) {
      for (const c of candidatos.slice(0, 3)) {
        console.log(`  partido candidato: grupo ${c.grupo} jornada ${c.jornada} · ${c.local} - ${c.visitante} `
          + `· codigo_acta ${c.codigo_acta ?? '(ninguno)'}${c.grupo !== grupo ? '  ← ESTÁ EN OTRO GRUPO' : ''}`);
      }
    } else {
      console.log('  ningún partido de esa competición tiene esos equipos');
    }
  }

  const deDonde = uno(`select archivo, url, jornada from actas where codigo = ?`, acta.codigo);
  console.log(`  archivo: ${String(deDonde?.archivo ?? '').slice(0, 90)}`);
  console.log('');
}

// Y la otra mitad de la historia: ¿cuántos partidos del grupo tienen acta citada y cuántos no?
const partidos = uno('select count(*) from partidos where temporada = ? and grupo = ?', temporada, grupo);
const conActa = uno('select count(*) from partidos where temporada = ? and grupo = ? and codigo_acta is not null', temporada, grupo);
console.log(`partidos del grupo: ${partidos} · con acta asignada: ${conActa}`);
db.close();
