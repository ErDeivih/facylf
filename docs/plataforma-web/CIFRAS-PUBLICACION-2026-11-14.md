# Cifras que deciden la publicación (14/11/2026)

Documento corto y con salidas reales. Se completa en tres pasos: red de CyL, tamaño de la base y plan del disco.
Cada paso va en su propio commit.

## 1 · CyL desde el servidor: portal, DNS, TLS y causa

Medido hoy con el mismo `curl` y el mismo `FacylfBot/1.0` en las dos máquinas:

| Origen | HTTP | DNS | TLS (`time_appconnect`) | TTFB | Total |
|---|---|---|---:|---:|---:|
| **PC** | **302** | 0,012-0,057 s | 0,13-0,52 s | 0,19-0,57 s | 0,19-0,57 s |
| **Servidor** | **302** | 0,049-0,069 s | 1,01-1,28 s | 1,06-1,33 s | 1,06-1,33 s |

- **HTTP 302 en las dos**: el portal responde y redirige a la página con cookie/portal; no hay bloqueo por IP.
- **DNS**: resuelve en ambas (`www.rfcylf.es → 195.53.102.51`), sin fallo.
- **TLS**: `TLSv1.3`, `Verify return code: 0 (ok)` en ambas.
- **La causa no es red**: es **`pageLoad`/renderizado**. Las actas de PNGF tardan **75-137 s** en el servidor
  (frente a ~1 s del PC), y el límite era 120 s → el renderer moría (timeout 118,4 s), el worker esperaba 10 min y
  repetía. Ya corregido: `FACYLF_PAGELOAD_MS=240000`, 4 GB, y rotación recortada.
- **Prueba de que ingiere**: `hechos hoy 1.582`, última petición `2026-11-14T11:48:15Z`, y una **clasificación
  guardada** a las 11:00:47Z (ver `INGESTA-CYL-SERVIDOR-DIAGNOSTICO-2026-11-14.md` §6).

## 2 · Tamaño real de la base (el dato que decide dónde publicar)

El usuario **no es `postgres`**: sale del compose del PC, `infra/docker-compose.yml` →
`POSTGRES_USER: facylf_admin` (y `POSTGRES_DB: facylf`). Comando exacto y salida:

```bash
docker exec facylf-postgres psql -U facylf_admin -c \
  "SELECT pg_size_pretty(pg_database_size(current_database()))"
```

```
 current_user | current_database | pg_size_pretty
--------------+------------------+----------------
 facylf_admin | facylf           | 41 GB
```

| Máquina | Base | Tamaño real |
|---|---|---:|
| **PC** (canónico de trabajo) | `facylf` | **41 GB** |
| Servidor | `facylf` (viva) | **16 GB** |
| Servidor | 4 copias `facylf_canonico*` (antiguas) | 28 + 29 + 29 + 30 = **116 GB** |

Desglose del PC por esquema: `core` 20 GB, `ops` 10 GB, `analytics` 7,9 GB, `source` 1,85 GB, `externo` 856 MB.
Conclusión para publicar: la base buena es la del PC (**41 GB**, con las 60 migraciones y 19 temporadas); la del
servidor está a 45 migraciones y solo 16 GB. `/srv/data` tiene 163 GB libres: **caber, cabe**; el problema del
servidor es el volumen de Docker, no `srv/data` (ver paso 3).
