/** Une temporadas de una misma sección del club sin confundir juvenil B con cadete B. */
const simple=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');

export function letraEquipo(nombre,club){
 const n=simple(nombre),c=simple(club);
 if(!n||!c)return null;
 if(n===c)return 'A';
 if(n.startsWith(c+' ')){
  const tail=n.slice(c.length+1);
  if(/^[A-Z]$/.test(tail))return tail;
 }
 return null;
}

export function mismoEquipoHistorico(actual,candidato){
 if(String(actual.club_id)!==String(candidato.club_id)||simple(actual.categoria)!==simple(candidato.categoria))return false;
 const a=letraEquipo(actual.equipo,actual.club),b=letraEquipo(candidato.equipo,actual.club);
 if(a&&b&&a!==b)return false;
 if(actual.codigo_externo&&candidato.codigo_externo&&String(actual.codigo_externo)===String(candidato.codigo_externo))return true;
 // Si el código cambió, la letra explícita aún identifica la sección dentro de club y categoría.
 if(a&&b)return a===b;
 return simple(actual.equipo)===simple(candidato.equipo);
}
