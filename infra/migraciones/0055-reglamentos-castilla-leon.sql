-- 0055 · Reglamento de las competiciones de Castilla y León: zonas de la clasificación
--
-- David revisó la pantalla 2 el 05/11/2026 y vio que la Liga Nacional Juvenil de CyL enseñaba 2
-- descensos cuando son 3. La vista `analytics.zonas_de_grupo` ya prioriza un reglamento fijado a mano
-- (`core.reglamento_grupo`) sobre lo aprendido de las temporadas; lo que faltaba era fijarlo.
--
-- Fuente: Normas del Campeonato Nacional de Liga Nacional Juvenil (RFEF, art. 9): el campeón de cada
-- grupo asciende directamente a División de Honor Juvenil. El número de plazas de descenso lo fija la
-- federación autonómica (las normas remiten a ella para dejar los grupos en 16/18 equipos); las bases
-- de la RFCYLF para esta liga establecen **tres** descensos, confirmado por David el 05/11/2026.
--
-- Se fija por familia (federación + categoría + división), no por grupo, para que valga en todos los
-- grupos y temporadas de esa liga. La fase de ascenso no se fija aquí: las bases no dicen cuántos
-- puestos la juegan y no se inventa; si se conoce, se añade otra fila.
--
-- Aditiva: no toca migraciones aplicadas. Idempotente dentro de la migración.

insert into core.reglamento_grupo
  (federation_id, categoria, genero, division, provincia, desde_anio, hasta_anio,
   ascensos, promocion, descensos, promocion_permanencia, fuente)
select f.id, 'juvenil', null, 'liga-nacional', null, null, null,
       1, 0, 3, 0,
       'Normas LNJ RFEF art. 9 (campeón asciende a División de Honor) + bases RFCYLF: descienden los 3 últimos (confirmado por David, 2026-11-05)'
  from core.federation f
 where f.codigo = 'castilla-leon'
   and not exists (
     select 1 from core.reglamento_grupo r
      where r.phase_group_id is null
        and r.federation_id = f.id
        and r.categoria = 'juvenil'
        and r.division = 'liga-nacional'
        and r.provincia is null
   );

comment on table core.reglamento_grupo is
  'Zonas de clasificación fijadas a mano (asciende, fase de ascenso, promoción, desciende). Manda sobre lo aprendido en analytics.zona_familia. Cada fila debe citar su fuente.';
