import { DatabaseSync } from 'node:sqlite';

// Resumen breve de una cola de recolector: Uso: node estado-worker-db.mjs <ruta-sqlite>
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const r = (s, ...a) => db.prepare(s).get(...a);
const total = r("SELECT COUNT(*) n FROM trabajos").n;
const hecho = r("SELECT COUNT(*) n FROM trabajos WHERE estado='hecho'").n;
// «Pendiente» es la cola viva: el trabajo de temporadas fuera de la ventana de recolección (anterior a
// 2023-24) está apartado a propósito y se cuenta aparte, para que el avance no parezca atascado.
const pend = r(`SELECT COUNT(*) n FROM trabajos WHERE estado IN ('pendiente','en_curso','bloqueado')
  AND (siguiente_intento IS NULL OR siguiente_intento < '2090')`).n;
const apartados = r("SELECT COUNT(*) n FROM trabajos WHERE estado='pendiente' AND siguiente_intento >= '2090'").n;
const enCurso = r("SELECT COUNT(*) n FROM trabajos WHERE estado='en_curso'").n;
const bloqueados = r("SELECT COUNT(*) n FROM trabajos WHERE estado='bloqueado'").n;
const gruposHecho = r("SELECT COUNT(*) n FROM trabajos WHERE tipo='grupos' AND estado='hecho'").n;
const indiceHecho = r("SELECT COUNT(*) n FROM trabajos WHERE tipo='indice_jornadas' AND estado='hecho'").n;
const jornadasHechas = r("SELECT COUNT(*) n FROM jornadas WHERE archivo IS NOT NULL").n;
const actasHechas = r("SELECT COUNT(*) n FROM actas WHERE estado='hecha'").n;
const actasPend = r("SELECT COUNT(*) n FROM actas WHERE estado='pendiente'").n;
const ult = db.prepare("SELECT id, iniciada_en FROM peticiones ORDER BY id DESC LIMIT 1").get();
const age = ult ? Math.round((Date.now() - new Date(ult.iniciada_en).getTime()) / 1000) : null;
const piezas = [
  `trabajos ${total}`,
  `hechos ${hecho}`,
  `pendientes ${pend}`,
  `apartados ${apartados}`,
  `grupos ${gruposHecho}`,
  `indices ${indiceHecho}`,
  `jornadas ${jornadasHechas}`,
  `actas ${actasHechas}(${actasPend} pend)`,
  `enCurso ${enCurso}`,
  `bloqueados ${bloqueados}`,
  ult ? `ultima ${age}s` : 'sin peticiones',
];
console.log(piezas.join(' | '));
db.close();
