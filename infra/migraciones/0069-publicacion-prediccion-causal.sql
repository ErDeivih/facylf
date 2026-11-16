-- La jornada forma parte de la identidad del cruce. Una emisión conserva su corte y sus bandas.
alter table analytics.prediccion_emitida_cruce drop constraint prediccion_emitida_cruce_pkey;
alter table analytics.prediccion_emitida_cruce add primary key
  (phase_group_id, jornada, home_team_entry_id, away_team_entry_id);
alter table analytics.prediccion_emitida_cruce
  add column corte_datos date,
  add column bandas jsonb;
alter table analytics.prediccion_ml add column corte_datos date;
alter table analytics.prediccion_resultado alter column marcador_acierto drop not null;
alter table analytics.simulacion_final add column modelo text;
alter table core.calendario_previsto add column origen text not null default 'canónico';

create or replace view core.calendario_pendiente as
select c.phase_group_id, c.jornada, c.orden, c.home_team_entry_id, c.away_team_entry_id, c.fecha_prevista
  from core.calendario_previsto c
 where not exists (
   select 1 from core.matchday d join core.match m on m.matchday_id = d.id
    where d.phase_group_id = c.phase_group_id and d.numero = c.jornada
      and m.phase_group_id = d.phase_group_id
      and m.home_team_entry_id = c.home_team_entry_id and m.away_team_entry_id = c.away_team_entry_id
 );
