/* Comprobación decisiva: ¿los empates a cero que leo son partidos jugados o partidos SIN jugar?
 * Un partido jugado tiene acta enlazada. Si los 0-0 no tienen acta y los demás sí, es que esas
 * celdas sin dígito significan "sin resultado", no "cero goles". */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] ?? 'descargas-euskadi/recolector-local/cola-v2.sqlite', { readOnly: true });
const uno = (s, ...a) => db.prepare(s).get(...a);

console.log('== cruce: marcador frente a tener acta enlazada ==');
for (const r of db.prepare(`select
    case when goles_local=0 and goles_visitante=0 then '0-0'
         when goles_local is null then 'sin marcador'
         else 'con goles' end tipo,
    count(*) n,
    sum(codigo_acta is not null) conActa
  from partidos group by tipo order by n desc`).all()) {
  const pct = ((r.conActa / r.n) * 100).toFixed(1);
  console.log(`   ${r.tipo.padEnd(14)} ${String(r.n).padStart(7)} partidos · con acta ${String(r.conActa).padStart(7)} (${pct} %)`);
}

console.log('\n== lo mismo sólo en partidos con resultado, por número de goles ==');
for (const r of db.prepare(`select (goles_local+goles_visitante) t, count(*) n,
    sum(codigo_acta is not null) conActa from partidos where goles_local is not null
    group by t order by t limit 6`).all()) {
  console.log(`   ${r.t} goles  ${String(r.n).padStart(6)} partidos · con acta ${String(r.conActa).padStart(6)} (${((r.conActa/r.n)*100).toFixed(1)} %)`);
}

console.log('\n== fechas de los 0-0 frente a hoy ==');
const hoy = new Date().toISOString().slice(0, 10);
const cero = uno(`select count(*) n, sum(fecha > ?) futuros from partidos
  where goles_local=0 and goles_visitante=0 and fecha is not null`, hoy);
console.log(`   0-0 con fecha futura: ${cero.futuros} de ${cero.n}`);
const conGoles = uno(`select count(*) n, sum(fecha > ?) futuros from partidos
  where goles_local is not null and not (goles_local=0 and goles_visitante=0) and fecha is not null`, hoy);
console.log(`   con goles y fecha futura: ${conGoles.futuros} de ${conGoles.n}`);
db.close();
