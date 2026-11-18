-- 0082 · Vista pública de anuncios directos activos. No expone app.* ni campañas apagadas.
create or replace view analytics.anuncio_publico as
select e.codigo as espacio,
       c.id as campana_id,
       c.patrocinador,
       c.titulo,
       c.imagen_url,
       c.destino_url,
       c.prioridad
  from app.espacio_anuncio e
  join app.campana_anuncio c on e.codigo = any(c.espacios)
 where e.activo
   and e.proveedor = 'directo'
   and c.activa
   and current_date between c.desde and c.hasta;
grant select on analytics.anuncio_publico to facylf_lector;
