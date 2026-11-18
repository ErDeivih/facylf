-- 0080 · Circular RFCYLF nº1 2026/27: LNJ Grupo III, descienden 15º y 16º; el arrastre se suma aparte.
insert into core.reglamento_grupo (federation_id, categoria, division, desde_anio, hasta_anio, ascensos, descensos, fuente)
select f.id, 'juvenil', 'liga-nacional', 2026, 2026, 1, 2,
       'Circular RFCYLF nº1 2026/27, art. 4.3: descienden 15º y 16º; el arrastre desde División de Honor se suma aparte'
  from core.federation f where f.codigo = 'castilla-leon'
  and not exists (select 1 from core.reglamento_grupo r where r.federation_id=f.id and r.categoria='juvenil' and r.division='liga-nacional' and r.desde_anio=2026 and r.hasta_anio=2026);
