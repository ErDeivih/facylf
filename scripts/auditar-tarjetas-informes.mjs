import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {abreCanonico} from './lib/informes-consulta.mjs';
try{process.loadEnvFile('.env');}catch{}

const cli=process.argv.slice(2);
const personName=cli.find(x=>x.startsWith('--persona='))?.slice('--persona='.length)||'';
const teamArgs=cli.filter(x=>!x.startsWith('--'));
const teams=teamArgs.length?teamArgs.map(Number):[17747,8874,8869,165];
const tokens=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).sort().join(' ');
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
const results=[];
try{
 for(const team of teams){
  const {rows:matches}=await c.query(`select m.id,m.home_team_entry_id,m.away_team_entry_id,
    r.quality,r.archivo_ruta from core.match m
    left join core.match_report r on r.match_id=m.id
    where m.home_team_entry_id=$1 or m.away_team_entry_id=$1
    order by m.fecha_prevista desc nulls last,m.id desc limit 40`,[team]);
  let available=0,missing=0,mismatches=0,personMismatches=0;
  const rawTypes=new Map();
  const doubles=[];
  const unpairedDoubles=[];
  const personSource=[],personCanonical=[];
  const examples=[];
  for(const m of matches){
   const stem=m.archivo_ruta?.replace(/\.html(?:\.gz)?$/i,'');
   const paths=stem?[stem+'.json.gz',stem+'.json']:[];
   const path=paths.find(existsSync);
   if(!path){missing++;continue;}
   available++;
   const raw=JSON.parse(path.endsWith('.gz')?gunzipSync(readFileSync(path)):readFileSync(path,'utf8'));
   const {rows:events}=await c.query(`select e.event_type,e.subtipo,e.sujeto_tipo,e.person_id,e.team_entry_id,e.minute_base,p.nombre_mostrado
    from core.match_event e left join core.person p on p.id=e.person_id
    where e.match_id=$1 and e.event_type in ('tarjeta_amarilla','tarjeta_roja')`,[m.id]);
   const source=(raw.tarjetas||[]).map(x=>({tipo:x.tipo,lado:x.lado,jugador:x.jugador,minuto:x.minutoBase}));
   if(personName){
    personSource.push(...source.filter(x=>tokens(x.jugador)===tokens(personName)).map(x=>({match:m.id,...x})));
    personCanonical.push(...events.filter(x=>tokens(x.nombre_mostrado)===tokens(personName)).map(x=>({match:m.id,...x})));
   }
   for(const card of source)rawTypes.set(card.tipo,(rawTypes.get(card.tipo)||0)+1);
   for(const card of source.filter(x=>/doble/i.test(x.tipo))){
    const same=source.filter(x=>tokens(x.jugador)===tokens(card.jugador));
    doubles.push({match:m.id,...card,tarjetasDeLaMismaPersona:same});
    if(!same.some(x=>x.tipo==='amarilla'))unpairedDoubles.push({match:m.id,...card});
   }
   const sourceYellow=source.filter(x=>/amarilla/i.test(x.tipo)&&!/doble/i.test(x.tipo)).length;
   const sourceRed=source.filter(x=>/roja|doble/i.test(x.tipo)).length;
   const dbYellow=events.filter(x=>x.event_type==='tarjeta_amarilla').length;
   const dbRed=events.filter(x=>x.event_type==='tarjeta_roja').length;
   if(sourceYellow!==dbYellow||sourceRed!==dbRed){mismatches++;examples.push({match:m.id,quality:m.quality,sourceYellow,dbYellow,sourceRed,dbRed,source,events});}
   const sourceKey=x=>`${/amarilla/i.test(x.tipo)&&!/doble/i.test(x.tipo)?'amarilla':'roja'}:${tokens(x.jugador)}`;
   const dbKey=x=>`${x.event_type==='tarjeta_amarilla'?'amarilla':'roja'}:${tokens(x.nombre_mostrado)}`;
   const counts=new Map();for(const x of source)counts.set(sourceKey(x),(counts.get(sourceKey(x))||0)+1);
   for(const x of events)counts.set(dbKey(x),(counts.get(dbKey(x))||0)-1);
   const differences=[...counts].filter(([,count])=>count!==0);
   if(differences.length){personMismatches++;if(examples.length<3)examples.push({match:m.id,quality:m.quality,differences,source,events});}
  }
  results.push({team,matches:matches.length,available,missing,mismatches,personMismatches,rawTypes:Object.fromEntries(rawTypes),unpairedDoubles,doubles:doubles.slice(0,4),personSource,personCanonical,examples:examples.slice(0,3)});
 }
 console.log(JSON.stringify(results,null,2));
 if(results.some(x=>x.missing>0||x.mismatches>0))process.exitCode=1;
}finally{await c.end();}
