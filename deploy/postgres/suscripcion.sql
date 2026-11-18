-- Ejecutar en el VPS, como administrador local. La contraseña NO se escribe en el fichero:
--   psql -v conninfo="host=... dbname=facylf user=facylf_replica password=..." -f suscripcion.sql
create subscription facylf_vps
  connection :'conninfo'
  publication facylf_publica
  with (copy_data = true, create_slot = true, enabled = true);
-- Comprobación:
-- select subname, subenabled from pg_subscription;
-- select * from pg_stat_subscription;
