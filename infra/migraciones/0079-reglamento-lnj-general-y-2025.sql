-- 0079 · Restaura la fila general de LNJ (3 descensos, sin límite) y añade la específica de 2025/26
-- (2 directos). La vista elige la fila más reciente que encaje; así no se borra la historia.
update core.reglamento_grupo
   set descensos = 3, desde_anio = null, hasta_anio = null,
       fuente = 'Normas LNJ RFEF art. 9 (campeón asciende a División de Honor) + bases RFCYLF: descienden los 3 últimos (confirmado por David, 2026-11-05)'
 where federation_id = (select id from core.federation where codigo='castilla-leon') and categoria = 'juvenil' and division = 'liga-nacional' and phase_group_id is null;

insert into core.reglamento_grupo (federation_id, categoria, division, desde_anio, hasta_anio, ascensos, descensos, fuente)
select f.id, 'juvenil', 'liga-nacional', 2025, 2025, 1, 2,
       'Circular RFCYLF nº1 2025/26, art. 4.3: descienden 15º y 16º; el arrastre desde División de Honor se suma aparte'
  from core.federation f where f.codigo = 'castilla-leon'
  and not exists (select 1 from core.reglamento_grupo r where r.federation_id=f.id and r.categoria='juvenil' and r.division='liga-nacional' and r.desde_anio=2025 and r.hasta_anio=2025);
