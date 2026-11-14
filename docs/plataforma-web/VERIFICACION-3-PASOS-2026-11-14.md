# Verificación de los tres pasos (14/11/2026, tarde)

Repetición de las tres comprobaciones sobre el árbol actual, con salida real. Un commit por paso.

## Paso 1 · Tamaño real de la base

El rol `postgres` no existe como usuario de la aplicación: el compose (`infra/docker-compose.yml`) declara
`POSTGRES_DB: facylf` y **`POSTGRES_USER: facylf_admin`**. Comando y salida:

```bash
docker exec facylf-postgres psql -U facylf_admin -d facylf \
  -c "SELECT current_user, current_database(), pg_size_pretty(pg_database_size(current_database()))"
```

```
 current_user | current_database | pg_size_pretty
--------------+------------------+----------------
 facylf_admin | facylf           | 41 GB
```

Desglose por esquema del PC (suma de tablas, sin contar índices dos veces): `core` 20 GB, `ops` 10 GB,
`analytics` 7,9 GB, `source` 1,85 GB, `externo` 856 MB, `app` 1,8 MB. **Total 41 GB.**
