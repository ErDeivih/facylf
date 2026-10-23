-- 0040 · Tanda de penaltis en las eliminatorias.
--
-- Medido el 22/10/2026 en las actas crudas de Novanet (sólo recuentos): en las copas de 2024-25 y 2025-26,
-- Valencia 33 tandas en 339 actas leídas y Madrid 151 en 1.129 (≈ 1 de cada 8 partidos de copa). El acta trae
-- `hay_penaltis`, `penaltis_casa` y `penaltis_fuera`, pero el importador no los leía: un partido de copa
-- decidido en los penaltis salía como empate y no se sabía quién pasaba. El resultado oficial sigue siendo el
-- empate (no cuenta como victoria en rachas ni estadísticas); la tanda sólo decide la eliminatoria.
--
-- El importador (fase D, PLAN-DEEPSEEK §5.5) rellena estas columnas; hasta entonces quedan NULL (desconocido,
-- nunca 0-0).

alter table core.match add column if not exists penaltis_local smallint,
                       add column if not exists penaltis_visitante smallint;
do $$ begin
  alter table core.match add constraint match_penaltis_check check (
    (penaltis_local is null and penaltis_visitante is null)
    -- (con NULL una comparación no es falsa sino desconocida y el CHECK la dejaría pasar: por eso el «is not null»)
    or (penaltis_local is not null and penaltis_visitante is not null
        and penaltis_local >= 0 and penaltis_visitante >= 0 and penaltis_local <> penaltis_visitante
        and goles_local is not null and goles_local = goles_visitante));
exception when duplicate_object then null;
end $$;

comment on column core.match.penaltis_local is
  'Goles del local en la tanda de penaltis (sólo si el partido acabó en empate y hubo tanda). NULL = no hubo o no se sabe.';

-- Quién pasa una eliminatoria a partido único: el ganador del partido o, si empató, el de la tanda.
create or replace function analytics.ganador_partido(m core.match) returns bigint language sql immutable as $$
  select case
    when m.goles_local is null or m.goles_visitante is null then null
    when m.goles_local > m.goles_visitante then m.home_team_entry_id
    when m.goles_local < m.goles_visitante then m.away_team_entry_id
    when m.penaltis_local > m.penaltis_visitante then m.home_team_entry_id
    when m.penaltis_local < m.penaltis_visitante then m.away_team_entry_id
  end
$$;

-- Caso de datos (0032): empate en una eliminatoria sin tanda conocida → informativo (puede haber ida y vuelta).
-- Se detecta aparte para no tocar ops.detecta_casos: lo llama el proyector al final, como los demás casos.
create or replace function ops.detecta_empates_sin_tanda(p_edicion bigint) returns integer language plpgsql as $$
declare n integer;
begin
  insert into ops.caso_dato (codigo, titulo, severidad, entidad, competition_edition_id, match_id, tratamiento)
  select 'P4', 'Empate en eliminatoria sin tanda de penaltis conocida', 'info', 'partido:' || m.id, p_edicion, m.id,
         'el partido se muestra como empate; quién pasa se deduce de la siguiente ronda si existe'
    from core.match m join core.phase_group pg on pg.id = m.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where ce.id = p_edicion and (ce.ambito = 'copa' or pg.tipo in ('copa', 'ascenso'))
     and m.goles_local is not null and m.goles_local = m.goles_visitante and m.penaltis_local is null
  on conflict (codigo, entidad) do update set visto_en = now(),
    estado = case when ops.caso_dato.estado = 'resuelto_solo' then 'abierto' else ops.caso_dato.estado end;
  get diagnostics n = row_count;
  -- Se cierra solo cuando la tanda llega (el importador la rellena) o el partido deja de ser empate.
  update ops.caso_dato c set estado = 'resuelto_solo', visto_en = now()
   where c.codigo = 'P4' and c.competition_edition_id = p_edicion and c.estado in ('abierto', 'confirmado')
     and not exists (select 1 from core.match m where m.id = c.match_id and m.goles_local = m.goles_visitante and m.penaltis_local is null);
  return n;
end $$;

grant execute on function analytics.ganador_partido(core.match) to facylf_lector, facylf_app, facylf_publicador;
grant execute on function ops.detecta_empates_sin_tanda(bigint) to facylf_publicador;
