import {abreCanonico} from './lib/informes-consulta.mjs';
process.loadEnvFile('.env');
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{console.log(JSON.stringify((await c.query(`select s.etiqueta,g.id,g.nombre,ce.nombre_publicado,ce.visibility_state,cp.visibility_state grupo_estado,cp.jornadas_esperadas,cp.jornadas_cerradas,count(distinct a.person_id) jugadores
from core.appearance a join core.team_entry te on te.id=a.team_entry_id join core.phase_group g on g.id=te.phase_group_id join core.competition_edition ce on ce.id=g.competition_edition_id join core.season s on s.id=ce.season_id left join ops.coverage_checkpoint cp on cp.phase_group_id=g.id
where a.person_id in (select person_id from core.appearance where team_entry_id=8869) and s.etiqueta>='2021-22'
group by s.etiqueta,g.id,ce.id,cp.phase_group_id order by s.etiqueta desc`)).rows,null,2));}finally{await c.end();}
