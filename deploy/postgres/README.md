# Replicación lógica para el VPS

No se toca el ingestor: sólo se publica lo que ya escribe en `core`, `analytics` y la tabla de
invalidación de caché.

1. En la primaria, comprobar `wal_level=replica` y crear un rol de replicación:
   `create role facylf_replica replication login password '...';`
2. Añadir `pg_hba.conf` para la IP del VPS (SSL obligatorio) y recargar.
3. Ejecutar `publicacion.sql` en la primaria.
4. En el VPS, crear la base y ejecutar `suscripcion.sql` con el `conninfo` por variable.
5. Verificar `pg_stat_subscription` y que `ops.invalidacion` llega.
6. El VPS necesita las tablas `app.*` locales (cuentas); no se replican.

Si no se quiere replicación, el receptor de lotes de `infra/vps/receptor-lotes.sql` sigue siendo un
borrador: no lo uses en producción hasta completar claves, lápidas e invalidaciones.
