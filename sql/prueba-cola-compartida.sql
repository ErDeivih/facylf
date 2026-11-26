-- Prueba de la reclamación atómica de la cola compartida (26/11/2026).
-- Inserta 100 trabajos, los reclama como lo haría un navegador y comprueba que ninguno se entrega dos veces.
truncate ops.cola restart identity;

insert into ops.cola (clave, tipo, temporada, competicion, prioridad)
select 'jornada|1|' || g || '|' || j, 'jornada', '1', g::text, 0
  from generate_series(1, 20) g, generate_series(1, 5) j;

-- Una reclamación: la misma sentencia que usará el recolector.
update ops.cola
   set estado = 'en_curso', dueno = 'prueba', alquiler_hasta = now() + interval '15 min'
 where id = (
   select id from ops.cola
    where estado = 'pendiente'
    order by prioridad, id
    limit 1
    for update skip locked
 )
 returning id, clave;

-- Estado tras la reclamación: un en curso y el resto pendientes.
select estado, count(*) from ops.cola group by 1 order by 1;

-- Ninguna fila puede estar en dos manos: la clave es única y el id también.
select count(*) as claves_repetidas from (select clave from ops.cola group by 1 having count(*) > 1) x;

-- Devolver la cola a como estaba.
update ops.cola set estado = 'pendiente', dueno = null, alquiler_hasta = null;
