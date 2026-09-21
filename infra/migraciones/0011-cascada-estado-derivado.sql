-- 0011 · Estado derivado: se va con la entidad de la que sale
--
-- Por qué: revertir un lote (`packages/canonico/src/reversion.ts`) borra el grupo que ese lote creó.
-- `ops.coverage_checkpoint` lo referencia sin CASCADE, así que el borrado fallaba con
--   update or delete on table "phase_group" violates foreign key constraint
--   "coverage_checkpoint_phase_group_id_fkey" on table "coverage_checkpoint"
-- y el grupo (y su edición) quedaban "conservados": el lote no se podía deshacer del todo.
--
-- La cobertura y los agregados NO son hechos: se recalculan desde partidos y actas. Si la entidad
-- desaparece, su fila derivada no tiene ningún sentido, así que la relación correcta es CASCADE.
-- Migración nueva, nunca se edita una ya aplicada.

alter table ops.coverage_checkpoint
  drop constraint coverage_checkpoint_phase_group_id_fkey,
  add constraint coverage_checkpoint_phase_group_id_fkey
    foreign key (phase_group_id) references core.phase_group(id) on delete cascade;

alter table analytics.team_edition_summary
  drop constraint team_edition_summary_phase_group_id_fkey,
  add constraint team_edition_summary_phase_group_id_fkey
    foreign key (phase_group_id) references core.phase_group(id) on delete cascade;

alter table analytics.player_team_season_summary
  drop constraint player_team_season_summary_competition_edition_id_fkey,
  add constraint player_team_season_summary_competition_edition_id_fkey
    foreign key (competition_edition_id) references core.competition_edition(id) on delete cascade;

comment on constraint coverage_checkpoint_phase_group_id_fkey on ops.coverage_checkpoint is
  'Estado derivado: revertir el lote que creó el grupo se lleva su punto de control de cobertura.';
