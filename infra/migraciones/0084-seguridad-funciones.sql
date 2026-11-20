-- 0084 · Cerrar la ejecución pública de funciones SECURITY DEFINER.
--
-- PostgreSQL concede EXECUTE a PUBLIC por defecto. Varias funciones de `app` son SECURITY DEFINER y
-- crean o modifican cuentas/sesiones: si `facylf_lector` puede ejecutarlas, un rol de sólo lectura
-- podría crear una sesión ajena. Se revoca PUBLIC y se concede sólo al rol de escritura de la web.
--
-- Las funciones de lectura de `ops` que usa la web se conceden explícitamente a `facylf_lector`,
-- `facylf_app` y `facylf_publicador`; el resto de `ops` no se toca.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('grant execute on function %s to facylf_app', f.firma);
  end loop;

  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ops' and p.proname in ('chequeos', 'chequeos_cuentas')
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('grant execute on function %s to facylf_lector, facylf_app, facylf_publicador', f.firma);
  end loop;
end
$$;
