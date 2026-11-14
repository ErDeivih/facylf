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

## Paso 2 · CyL desde el servidor: HTTP real frente al PC

Mismo `curl` y mismo `FacylfBot/1.0` en las dos máquinas, dos peticiones cada una:

| Origen | HTTP | DNS | TLS | TTFB | Total |
|---|---|---|---:|---:|---:|
| **PC** | **302** | 0,009-0,052 s | 0,127-0,172 s | 0,180-0,228 s | 0,180-0,228 s |
| **Servidor** | **302** | 0,010-0,040 s | 0,212-0,251 s | 0,260-0,308 s | 0,260-0,308 s |

- **Mismo código HTTP (302) en las dos**: no hay bloqueo por IP; DNS resuelve (`195.53.102.51`) y TLS es
  `TLSv1.3` con `Verify return code: 0 (ok)` en ambas.
- La diferencia es de **renderizado/página**, no de red: las actas de PNGF tardan 75-137 s en el servidor frente
  a ~1 s en el PC, y el `pageLoad` estaba en 120 s → el renderer moría y repetía. Con 240 s el worker guarda
  actas y clasificaciones.
- **Ahora mismo ingiere**: `hechos hoy 1.611`, última petición `2026-11-14T12:07:54Z`.
