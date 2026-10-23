import {abreCanonico} from './lib/informes-consulta.mjs';
import {execFileSync} from 'node:child_process';
process.loadEnvFile('.env');const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{
 const rows=(await c.query(`select application_name,state,wait_event_type,wait_event,now()-query_start as transcurrido,query as consulta from pg_stat_activity where datname=current_database() and state='active' and backend_type='client backend'`)).rows;
 for(const r of rows){console.log({...r,consulta:r.consulta.slice(0,160),conNombres:r.consulta.includes('nombres as')});
  if(process.argv.includes('--plan')&&r.application_name==='facylf-informe-juvenil'){
   const sql=execFileSync(process.execPath,['scripts/informe-equipo.mjs','--equipo','165','--sql-consulta','cuerpo_tecnico_por_nombre'],{encoding:'utf8',windowsHide:true});
   const plan=(await c.query('explain (format json) '+sql)).rows[0]['QUERY PLAN'][0].Plan;
   const visit=(n,level=0)=>{console.log(' '.repeat(level)+[n['Node Type'],n['Relation Name'],n['CTE Name'],n['Plan Rows'],n['Total Cost']].filter(x=>x!=null).join(' | '));for(const ch of n.Plans||[])visit(ch,level+1);};visit(plan);
  }
 }
}finally{await c.end();}
