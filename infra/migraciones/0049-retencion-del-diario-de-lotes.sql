-- 0049 · Retención del diario de lotes (`ops.batch_cambio`): se puede podar, pero APAGADO hasta que David decida.
--
-- Medido por DeepSeek el 23/10/2026: `ops.batch_cambio` tiene 18,4 millones de filas y 7,3 GB, y `ops.purga()` no
-- lo toca nunca. No es un fallo: el importador ya poda el diario de un grupo cuando lo reimporta
-- (`purgaDiarioSustituido` en packages/canonico/src/lote.ts) y deja entero el del ÚLTIMO lote de cada grupo, que es
-- lo que permite `--revertir` ese lote con exactitud. Con ~40.000 grupos, «el último diario de cada uno» pesa
-- tanto como el propio canónico.
--
-- Lo que añade esta migración, sin borrar nada por sí misma:
--   1. `ops.diario_lotes_resumen()`: cuánto ocupa el diario por antigüedad del lote, para decidir con cifras.
--   2. `ops.poda_diario_lotes(dias, max_filas, aplicar)`: borra el diario de los lotes validados o publicados que
--      terminaron hace más de `dias` días. Lote ENTERO o nada (un diario a medias revertiría a medias), en
--      tandas de como mucho `max_filas` filas por llamada, y deja la marca `validacion.diario = 'podado'` para que
--      `--revertir` explique por qué ya no se puede (packages/canonico/src/reversion.ts). Sin `aplicar` sólo cuenta.
--      Nunca toca lotes en curso, fallidos ni revertidos.
--   3. `ops.parametro.diario_lote_dias` = 0 (APAGADO). Con un valor ≥ 7, `ops.purga()` (mantenimiento de cada
--      noche) poda una tanda por noche.
--
-- Qué se pierde al podar: la reversión EXACTA de ese lote. Lo importado sigue igual; si hiciera falta deshacer un
-- grupo viejo, se hace como ya se hace con un grupo sin diario: retirada del ámbito y reimportación
-- (`scripts/prepara-lote-retirada-grupo.mjs`). Propuesta para David: 30 días (un error de importación se ve antes).
-- El espacio que libera lo reutiliza PostgreSQL para filas nuevas; devolverlo al disco exige `vacuum full
-- ops.batch_cambio` (bloquea la tabla mientras dura: de noche y con el importador parado).

insert into ops.parametro (clave, valor, descripcion) values
  ('diario_lote_dias', 0, 'Días que se guarda el diario de un lote validado (0 = no se poda nunca; mínimo 7). Ver 0049'),
  ('diario_lote_tanda', 200000, 'Filas de diario que poda ops.purga() como mucho en cada noche')
on conflict (clave) do nothing;

create index if not exists batch_terminado_idx on ops.batch (terminado_en) where estado in ('validado', 'publicado');

-- Cuánto ocupa el diario, por antigüedad del lote (lectura; tarda lo que tarde contar el diario una vez).
create or replace function ops.diario_lotes_resumen()
returns table (antiguedad text, lotes bigint, filas bigint, pct numeric)
language sql stable as $$
  with por_lote as (
    select c.batch_id, count(*) as filas from ops.batch_cambio c group by c.batch_id),
  t as (
    select case when b.estado not in ('validado', 'publicado') then '(' || b.estado || ': no se poda)'
                when b.terminado_en is null then '(sin fecha de fin)'
                when b.terminado_en > now() - interval '7 days' then 'menos de 7 días'
                when b.terminado_en > now() - interval '30 days' then '7-30 días'
                when b.terminado_en > now() - interval '90 days' then '30-90 días'
                else 'más de 90 días' end as antiguedad,
           p.filas
      from por_lote p join ops.batch b on b.id = p.batch_id)
  select antiguedad, count(*), sum(filas), round(100.0 * sum(filas) / nullif(sum(sum(filas)) over (), 0), 1)
    from t group by antiguedad order by min(antiguedad)
$$;

create or replace function ops.poda_diario_lotes(p_dias integer, p_max_filas integer default 200000, p_aplicar boolean default false)
returns jsonb language plpgsql as $$
declare
  v_lotes bigint[] := '{}'; v_filas bigint := 0; v_borradas bigint := 0; v_n bigint; r record;
begin
  if p_dias is null or p_dias < 7 then raise exception 'DIAS_MINIMO_7'; end if;
  if p_max_filas is null or p_max_filas < 1 then raise exception 'TANDA_NO_VALIDA'; end if;
  -- Lotes candidatos, del más viejo al más nuevo, hasta llenar la tanda (un lote nunca se parte).
  -- (El recuento de cada lote va DENTRO del bucle: así sólo se cuentan los lotes que caben en la tanda, por el
  -- índice batch_cambio_batch_idx, y no los ~40.000 lotes antes de ordenar.)
  for r in
    select b.id
      from ops.batch b
     where b.estado in ('validado', 'publicado')
       and b.terminado_en < now() - make_interval(days => p_dias)
       and exists (select 1 from ops.batch_cambio c where c.batch_id = b.id)
     order by b.terminado_en, b.id
  loop
    select count(*) into v_n from ops.batch_cambio c where c.batch_id = r.id;
    exit when v_filas > 0 and v_filas + v_n > p_max_filas;
    v_lotes := v_lotes || r.id; v_filas := v_filas + v_n;
    exit when v_filas >= p_max_filas;
  end loop;
  if p_aplicar and cardinality(v_lotes) > 0 then
    delete from ops.batch_cambio where batch_id = any(v_lotes);
    get diagnostics v_borradas = row_count;
    update ops.batch
       set validacion = coalesce(validacion, '{}'::jsonb) || jsonb_build_object('diario', 'podado', 'diario_podado_en', now())
     where id = any(v_lotes);
  end if;
  return jsonb_build_object('lotes', cardinality(v_lotes), 'filas', v_filas, 'borradas', v_borradas, 'aplicado', p_aplicar);
end $$;

-- La de cada noche: lee el parámetro; con 0 no hace nada.
create or replace function ops.purga_diario_lotes() returns jsonb language plpgsql as $$
declare v_dias integer := coalesce(ops.p('diario_lote_dias'), 0)::int;
begin
  if v_dias < 7 then return jsonb_build_object('diario_lotes', 'apagado'); end if;
  return jsonb_build_object('diario_lotes',
    ops.poda_diario_lotes(v_dias, coalesce(ops.p('diario_lote_tanda'), 200000)::int, true));
end $$;

-- ops.purga() = datos || plataforma || uso (0039) || cuentas (0043) || diario de lotes
create or replace function ops.purga() returns jsonb language sql as $$
  select ops.purga_datos() || ops.purga_plataforma() || ops.purga_uso() || ops.purga_cuentas() || ops.purga_diario_lotes()
$$;

grant execute on function ops.diario_lotes_resumen(), ops.poda_diario_lotes(integer, integer, boolean),
  ops.purga_diario_lotes() to facylf_publicador;
