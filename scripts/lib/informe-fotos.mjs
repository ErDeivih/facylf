import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {gunzipSync} from 'node:zlib';

/** Solo imágenes incrustadas y vinculadas al código federativo de la fila. Nunca por nombre. */
export function fotosDeActa(html) {
 const fotos=new Map();
 for(const chunk of html.split(/<tr\b/i).slice(1)){
  const row=chunk.split(/<\/tr>/i)[0],code=/jugador=(\d+)/i.exec(row)?.[1];
  const image=/<img[^>]+src\s*=\s*["']data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)["']/i.exec(row);
  if(!code||!image)continue;
  const bytes=Buffer.from(image[1],'base64');
  const mime=bytes[0]===255&&bytes[1]===216?'jpeg':bytes[0]===137&&bytes[1]===80?'png':bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
  if(mime&&bytes.length<=500000)fotos.set(code,`data:image/${mime};base64,${bytes.toString('base64')}`);
 }return fotos;
}

function rutasLocales(path){
 if(!path)return [];
 const normalized=path.replaceAll('\\','/');
 const relative=normalized.match(/(?:^|\/)(descargas-[^/]+\/.*)$/)?.[1];
 const root=resolve('.');
 return [...new Set([relative,normalized].filter(Boolean).flatMap(p=>[resolve(p),resolve(p+'.gz')]))]
  .filter(p=>p.startsWith(root+sep));
}

/** Consulta nueva; solo recursos locales. No descarga ni guarda informes ni fotos. */
export async function cargarFotos(c,snapshot){
 const d=snapshot.datos,requests=new Map();
 for(const p of d.plantilla)requests.set(`${p.person_id}:${d.contexto[0].temporada}`,{person:String(p.person_id),season:d.contexto[0].temporada});
 for(const h of d.historial)requests.set(`${h.person_id}:${h.temporada}`,{person:String(h.person_id),season:h.temporada});
 const photos={};
 // Reutilizar recursos de cualquier informe previo de la MISMA persona canónica y año.
 const files=await readdir(resolve('informes/fotos')).catch(()=>[]);
 for(const file of files){
  const m=/-(\d+)-(\d{4}-\d{2})\.(jpg|jpeg|png|webp)$/i.exec(file);if(!m)continue;
  const key=`${m[1]}:${m[2]}`;if(!requests.has(key)||photos[key])continue;
  const b=await readFile(resolve('informes/fotos',file));
  photos[key]=`data:image/${m[3]==='jpg'?'jpeg':m[3]};base64,${b.toString('base64')}`;
 }
 const pending=[...requests].filter(([key])=>!photos[key]).map(([,r])=>r);
 if(!pending.length)return photos;
 const {rows}=await c.query(`with wanted as (select * from jsonb_to_recordset($1::jsonb) as w(person bigint,season text))
 select distinct w.person,w.season,psi.codigo_externo, f.codigo federacion,r.archivo_ruta
 from wanted w join core.appearance a on a.person_id=w.person
 join core.season s on s.id=a.season_id and s.etiqueta=w.season
 join core.match_report r on r.match_id=a.match_id and r.archivo_ruta is not null
 join core.team_entry te on te.id=a.team_entry_id
 join core.phase_group g on g.id=te.phase_group_id
 join core.competition_edition ce on ce.id=g.competition_edition_id
 join core.federation f on f.id=ce.federation_id
 join core.person_source_identity psi on psi.person_id=w.person and psi.federation_id=ce.federation_id
 where psi.codigo_externo is not null
 order by w.season desc,w.person`,[JSON.stringify(pending)]);
 const archives=new Map();
 for(const row of rows){const key=`${row.person}:${row.season}`;if(!archives.has(row.archivo_ruta))archives.set(row.archivo_ruta,[]);archives.get(row.archivo_ruta).push({key,code:row.codigo_externo});}
 for(const [path,wanted] of archives){
  if(wanted.every(x=>photos[x.key]))continue;
  for(const local of rutasLocales(path)){
   try{
    if((await stat(local)).size>12000000)continue;
    const b=await readFile(local),html=(b[0]===31&&b[1]===139?gunzipSync(b,{maxOutputLength:24000000}):b).toString('utf8');
    const found=fotosDeActa(html);
    for(const w of wanted)if(!photos[w.key]&&found.has(w.code))photos[w.key]=found.get(w.code);
    break;
   }catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))console.warn('Foto archivada no legible:',error.code||error.name);}
  }
 }
 return photos;
}
