-- 0077 · La circular RFCYLF 2025/26 fija 2 descensos directos en Liga Nacional Juvenil;
-- el tercero, si procede, llega por arrastre desde División de Honor. No se inventa como fijo.
update core.reglamento_grupo
   set descensos = 2,
       fuente = 'Circular RFCYLF nº1 2025/26, art. 4.3: descienden 15º y 16º; el arrastre desde División de Honor se suma aparte',
       desde_anio = 2025,
       hasta_anio = 2026
 where categoria = 'juvenil' and division = 'liga-nacional' and phase_group_id is null;
