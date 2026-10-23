const limpio=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75);
/** Ficha individual: «nombre_ficha-jugador_consulta-AAAA-MM-DD.pdf». */
export function nombrePdfPersona(datos,fecha=new Date()){
 return [datos.persona.nombre,'ficha-jugador','consulta-'+fecha.toISOString().slice(0,10)].map(limpio).filter(Boolean).join('_')+'.pdf';
}
export function nombrePdf(snapshot,alcance='resumen'){
 const c=snapshot.datos.contexto[0];
 const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,75);
 return [c.club_nombre,c.nombre_en_fuente,c.categoria,c.temporada,alcance,'consulta-'+snapshot.generadoEn.slice(0,10)].map(clean).filter(Boolean).join('_')+'.pdf';
}
