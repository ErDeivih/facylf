-- 0053 · Lo de La Preferente no sale en la web mientras David no lo diga (decisión D2, 25/10/2026).
--
-- Plan: docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md (L7) y ENCARGO-DEEPSEEK-2026-10-25.md (D2).
--
-- La web lee `core` con facylf_lector (y facylf_app, que lo hereda). Las ediciones que vienen de La Preferente
-- (`origen = 'lapreferente'`, 0051) se importan al canónico para tener la historia y para contrastar, pero:
--   · una edición que la federación ya ha cubierto (`reemplazada_por` no nulo) NO se enseña nunca;
--   · una edición sólo de LP se enseña únicamente si el ajuste `facylf.lp_publico` vale 'on' en la sesión
--     (por defecto no existe = no se enseña). Para publicarlas, cuando David diga que sí:
--         alter role facylf_lector set facylf.lp_publico = 'on';   -- y reiniciar la web (conexiones nuevas)
--     y la web tiene que marcar esas páginas como «Dato no oficial (La Preferente)» (encargo L7).
--
-- Se hace con seguridad por filas sobre core.competition_edition y no tocando las 46 consultas de la web: todas
-- llegan a la edición por un join, así que lo que no se ve aquí desaparece de catálogo, partidos, fichas y paneles.
-- Además scripts/proyectar-lectura.mjs no proyecta los grupos de esas ediciones (búsqueda, carreras, ojeo), con
-- lo que tampoco quedan en `analytics`.
--
-- El importador (facylf_publicador) y la proyección siguen viendo todo: la política restrictiva es sólo para
-- facylf_lector. facylf_admin es superusuario y no pasa por aquí. Deshacer:
--     alter table core.competition_edition disable row level security;
--
-- Coste: la condición es sobre la propia fila (dos columnas y un current_setting) y la tabla es pequeña.

alter table core.competition_edition enable row level security;

-- Sin una política permisiva, con RLS activa nadie que no sea dueño vería nada.
drop policy if exists todo_visible on core.competition_edition;
create policy todo_visible on core.competition_edition as permissive for all to public using (true) with check (true);

drop policy if exists web_sin_la_preferente on core.competition_edition;
create policy web_sin_la_preferente on core.competition_edition as restrictive for select to facylf_lector
  using (
    reemplazada_por is null
    and (origen = 'federacion' or coalesce(current_setting('facylf.lp_publico', true), '') = 'on')
  );

comment on policy web_sin_la_preferente on core.competition_edition is
  'La web (facylf_lector y quien lo herede) no ve ediciones reemplazadas por la federación, ni las de La Preferente '
  'salvo con facylf.lp_publico = on (decisión D2). 0053, Claude 26/10/2026.';
