-- Ejecutar en la base PRIMARIA (la que escribe el ingestor). No cambia el código del ingestor.
-- Requisitos: wal_level=replica (ya está), max_wal_senders >= 4, rol con REPLICATION.
-- Revisar antes: select * from pg_publication; select * from pg_replication_slots;
create publication facylf_publica
  for tables in schema core, analytics;
-- ops.invalidacion es la señal de caché; si se replica ops entero, se arrastran colas internas.
-- Publicar sólo la tabla concreta:
alter publication facylf_publica add table ops.invalidacion;
