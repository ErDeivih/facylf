/** Minutos reglamentarios, no tiempo añadido. NULL = secuencia no interpretable o formato sin minutos
 * derivables (fútbol sala y playa: cambios ilimitados y rotativos). Ver informe-formato.mjs. */
export function minutosSql(duracion){
 return `case
  when (${duracion}) is null then null
  when a.condition not in ('starter','substitute') then null
  when a.condition='substitute' and mov.entradas=0 and mov.salidas=0 then 0
  when mov.invalido or mov.entradas>1 or mov.salidas>1 then null
  when a.condition='starter' and mov.entradas>0 then null
  when a.condition='substitute' and mov.entradas=0 then null
  when exists(select 1 from core.appearance duplicada where duplicada.match_id=a.match_id
    and duplicada.person_id=a.person_id and duplicada.team_entry_id=a.team_entry_id and duplicada.id<>a.id) then null
  when a.condition='substitute' and mov.salida<mov.entrada then null
  else least(coalesce(mov.salida,${duracion}),${duracion})
   - case when a.condition='starter' then 0 else least(mov.entrada,${duracion}) end end`;
}
export function movimientosSql(duracion){
 return `left join lateral (
  select min(e.minute_base) filter(where e.event_type='entra') as entrada,
   min(e.minute_base) filter(where e.event_type in ('sale','tarjeta_roja')) as salida,
   count(*) filter(where e.event_type='entra') as entradas,
   count(*) filter(where e.event_type='sale') as salidas,
   coalesce(bool_or(e.minute_base is null or e.minute_base<0 or e.minute_base>${duracion}+30),false) as invalido
  from core.match_event e where e.match_id=a.match_id and e.person_id=a.person_id
   and e.team_entry_id=a.team_entry_id and e.sujeto_tipo='jugador'
   and e.event_type in ('entra','sale','tarjeta_roja')
 ) mov on true
 left join lateral(select mov.entrada as minuto) entra on true
 left join lateral(select mov.salida as minuto) sale on true`;
}
