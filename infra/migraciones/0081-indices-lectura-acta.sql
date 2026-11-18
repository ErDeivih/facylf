-- 0081 · Índices para las dos consultas públicas más lentas del acta: eventos y convocatorias.
create index if not exists match_event_match_minuto_idx on core.match_event (match_id, minute_base, id);
create index if not exists appearance_match_team_idx on core.appearance (match_id, team_entry_id, person_id);
