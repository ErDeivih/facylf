import {abreCanonico} from './lib/informes-consulta.mjs';
process.loadEnvFile('.env');
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{console.log(JSON.stringify((await c.query(`select f.codigo federacion,cp.tabla_oficial_estado estado,count(*)::int grupos,
 count(*) filter(where cp.tabla_oficial_corte_completo=false)::int sin_corte_confirmado
 from ops.coverage_checkpoint cp join core.phase_group g on g.id=cp.phase_group_id
 join core.competition_edition ce on ce.id=g.competition_edition_id join core.federation f on f.id=ce.federation_id
 where cp.tabla_oficial_estado is not null group by f.codigo,cp.tabla_oficial_estado order by f.codigo,cp.tabla_oficial_estado`)).rows,null,2));}finally{await c.end();}
