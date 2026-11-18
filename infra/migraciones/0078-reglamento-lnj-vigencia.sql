-- 0078 · La vigencia de 0077 se quedó en 2026 e incluía 2026/27. La circular es 2025/26.
update core.reglamento_grupo
   set hasta_anio = 2025
 where federation_id = 7 and categoria = 'juvenil' and division = 'liga-nacional' and phase_group_id is null;
