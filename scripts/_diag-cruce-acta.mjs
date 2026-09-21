// CRUCE independiente del inventario del acta, con UNA sola consulta por federación.
//
// El inventario clasifica fila a fila en JavaScript; esto lo cuenta con un `join` y `json_extract` en SQL,
// sin recorrer cursores ni preparar sentencias dentro del bucle. Si los dos números no coinciden, uno de los
// dos está mal y hay que averiguar cuál antes de publicar nada: contar dos veces de la misma manera no es
// comprobar nada.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const raiz = process.argv[2] ?? '.';
const VOCABULARIO = ['descansa', 'descans', 'atsedena'];
const POR_LADO = `lower(trim(p.local)) in (?,?,?) or lower(trim(p.visitante)) in (?,?,?)`;
/*
 * OJO con la trampa que este cruce tenía: `trim(json_extract(...)) <> ''` NO es lo mismo que `is not null`.
 * Las actas de Madrid y Valencia tienen `{"local":"","visitante":""}` —vacías, con estado `pendiente`—, y
 * contarlas como «pareja» daba 111 y 150 filas «con dos equipos reales» que no existen. El inventario lo
 * hacía bien (una cadena vacía es falsa en JavaScript); el que estaba mal era este cruce. Se deja escrito
 * porque el cruce es justo lo que tiene que detectar estas cosas, y aquí el que falló fue el cruce.
 */
const PAREJA = `json_extract(a.datos,'$.local') is not null and json_extract(a.datos,'$.visitante') is not null
  and trim(json_extract(a.datos,'$.local')) <> '' and trim(json_extract(a.datos,'$.visitante')) <> ''`;
const REALES = `${PAREJA} and lower(trim(json_extract(a.datos,'$.local'))) not in (?,?,?)
  and lower(trim(json_extract(a.datos,'$.visitante'))) not in (?,?,?)`;

const federaciones = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['euskadi', 'valencia', 'madrid', 'cataluna', 'aragon', 'navarra', 'rioja', 'ceuta', 'cantabria',
    'castilla-la-mancha', 'murcia'];

for (const fed of federaciones) {
  const ruta = `${raiz.replace(/[\\/]+$/, '')}/descargas-${fed}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const cuenta = (extra, ...params) => db.prepare(`select count(*) n from partidos p
      left join actas a on a.codigo = p.codigo_acta and a.temporada = p.temporada
        and a.competicion = p.competicion and a.grupo = p.grupo
    where (${POR_LADO}) ${extra}`).get(...VOCABULARIO, ...VOCABULARIO, ...params).n;
  const filas = cuenta('');
  const conPareja = cuenta(`and ${PAREJA}`);
  const dosReales = cuenta(`and ${REALES}`, ...VOCABULARIO, ...VOCABULARIO);
  console.log(`${fed.padEnd(20)} filas ${String(filas).padStart(5)} · con pareja de acta ${String(conPareja).padStart(5)} · DOS equipos reales ${String(dosReales).padStart(5)}`);
  if (dosReales > 0) {
    // La forma CRUDA, para poder mirarla: si el inventario y esto no coinciden, aquí se ve por qué.
    const muestras = db.prepare(`select p.grupo, p.jornada, p.orden, p.local, p.visitante, p.codigo_acta,
        a.estado, substr(a.datos, 1, 200) as datos
      from partidos p join actas a on a.codigo = p.codigo_acta and a.temporada = p.temporada
        and a.competicion = p.competicion and a.grupo = p.grupo
      where (${POR_LADO}) and ${REALES} limit 2`).all(...VOCABULARIO, ...VOCABULARIO, ...VOCABULARIO, ...VOCABULARIO);
    for (const m of muestras) {
      console.log(`    g${m.grupo} J${m.jornada} ord ${m.orden}: «${m.local} vs ${m.visitante}» · acta ${m.codigo_acta} (${m.estado})`);
      console.log(`      datos: ${m.datos}`);
    }
  }
  db.close();
}
